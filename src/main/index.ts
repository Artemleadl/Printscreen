import { join } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { appendFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  shell,
  Tray,
} from "electron";
import {
  IPC,
  type AfterCapture,
  type CaptureMode,
  type EditorPrefs,
  type RawImage,
  type SaveResult,
  type SelectionRect,
  type Settings,
  type UploadResult,
} from "../shared/types";
import {
  getSettings,
  saveAfterCapture,
  saveEditorPrefs,
  saveSettings,
} from "./store";
import {
  captureCursorDisplay,
  cropCapture,
  hasScreenAccess,
  isBlankCapture,
  listWindows,
  registerForScreenAccess,
  screenAccessStatus,
  toRawImage,
  windowsOnDisplay,
  type Capture,
} from "./capture";
import { uploadImage } from "./uploader";
import {
  createSettingsWindow,
  placeEditorWindow,
  prepareCaptureWindow,
  takeCaptureWindow,
} from "./windows";

let tray: Tray | null = null;
let overlayWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
// Bumped by every capture. A capture that finds it changed after grabbing
// the screen was superseded by a newer shortcut press and drops its result.
let captureSeq = 0;

// The capture each overlay/editor window shows, keyed by webContents id.
const captures = new Map<number, Capture>();
// Pending "capture is drawn" acknowledgements, keyed by webContents id.
const drawnWaiters = new Map<number, (drawn: boolean) => void>();

// How long a just-shown overlay gets to put its first frame on screen before
// it is sent the capture: receiving and drawing a multi-MB image keeps its
// renderer busy and would hold that frame back (measured: ~0.4s later).
const OVERLAY_FIRST_FRAME_MS = 100;

function dataUrlToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(base64, "base64");
}

function timestampName(ext = "png"): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Screenshot ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} at ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}.${ext}`;
}

// Writes a PNG into the save folder and returns its path.
async function savePng(png: Buffer): Promise<string> {
  const dir = getSettings().saveDirectory || app.getPath("pictures");
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, timestampName());
  await writeFile(filePath, png);
  return filePath;
}

// Quiet confirmation for captures that skip the editor.
function notify(title: string, body = ""): void {
  if (Notification.isSupported())
    new Notification({ title, body, silent: true }).show();
}

// --- Capture orchestration -------------------------------------------------

// Log of what capture does and where its time goes: printed in development,
// and always appended to ~/Library/Logs/snapshot-studio/main.log (the app's
// logs folder elsewhere), so a problem on someone's machine can be read back.
let logFile: string | null = null;
function devLog(message: string): void {
  if (!app.isPackaged) console.log(`[capture] ${message}`);
  try {
    if (!logFile) {
      const dir = app.getPath("logs");
      mkdirSync(dir, { recursive: true });
      logFile = join(dir, "main.log");
      // Start over once it grows past 1 MB.
      try {
        if (statSync(logFile).size > 1_000_000) writeFileSync(logFile, "");
      } catch {
        // No log yet.
      }
    }
    appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Logging must never break capture.
  }
}

// Record renderer and helper-process failures, and never leave a broken
// overlay covering the screen: it would block every click.
function watchProcesses(): void {
  app.on("web-contents-created", (_e, wc) => {
    wc.on("render-process-gone", (_ev, details) => {
      devLog(
        `renderer gone (${details.reason}, exit ${details.exitCode}): ${wc.getURL()}`,
      );
      const win = BrowserWindow.fromWebContents(wc);
      if (win && win === overlayWindow) win.destroy();
    });
    wc.on("did-fail-load", (_ev, code, description, url) =>
      devLog(`load failed ${code} ${description}: ${url}`),
    );
    wc.on("preload-error", (_ev, path, error) =>
      devLog(`preload error in ${path}: ${error.message}`),
    );
    wc.on("console-message", (details) => {
      if (details.level === "error")
        devLog(
          `renderer error: ${details.message} (${details.sourceId}:${details.lineNumber})`,
        );
    });
  });
  app.on("child-process-gone", (_e, details) =>
    devLog(`${details.type} process gone (${details.reason})`),
  );
}

function logTiming(event: string, since: number): void {
  devLog(`${event} after ${Math.round(performance.now() - since)}ms`);
}

// Resolves true once the window's page reports the capture is on its canvas;
// false if the window closes first or the report doesn't come in time, so a
// lost message can't keep the window hidden for good.
function whenDrawn(win: BrowserWindow, timeoutMs: number): Promise<boolean> {
  const id = win.webContents.id;
  return new Promise((resolve) => {
    const done = (drawn: boolean): void => {
      clearTimeout(timer);
      drawnWaiters.delete(id);
      resolve(drawn);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    drawnWaiters.set(id, done);
  });
}

// Hand a (pre-created) window its capture: register it for the page to pull,
// then ping the page, optionally after a delay. Resolves once the page has
// drawn it (see whenDrawn).
function deliverCapture(
  win: BrowserWindow,
  capture: Capture,
  pingDelayMs = 0,
): Promise<boolean> {
  const id = win.webContents.id;
  captures.set(id, capture);
  win.on("closed", () => {
    captures.delete(id);
    drawnWaiters.get(id)?.(false);
  });
  const drawn = whenDrawn(win, 1000 + pingDelayMs);
  setTimeout(() => {
    if (!win.isDestroyed()) win.webContents.send(IPC.captureAvailable);
  }, pingDelayMs);
  return drawn;
}

async function openEditor(capture: Capture, since: number): Promise<void> {
  const win = await takeCaptureWindow("editor");
  const { width, height } = capture.image.getSize();
  placeEditorWindow(win, width, height);
  // Show it once the image is on the canvas, so it never flashes empty.
  const drawn = await deliverCapture(win, capture);
  if (win.isDestroyed()) return;
  win.show();
  win.focus();
  logTiming(
    drawn ? "editor shown" : "editor shown before its image was drawn",
    since,
  );
  if (getSettings().copyOnCapture) clipboard.writeImage(capture.image);
}

// Hands a finished capture (selection, window or full screen) to whatever the
// "After capture" option asks for.
async function finishCapture(capture: Capture, since: number): Promise<void> {
  const { afterCapture } = getSettings();
  if (afterCapture === "editor") return openEditor(capture, since);
  if (afterCapture === "copy") {
    clipboard.writeImage(capture.image);
    notify("Screenshot copied to clipboard");
  } else {
    notify("Screenshot saved", await savePng(capture.image.toPNG()));
  }
  logTiming(`${afterCapture} done`, since);
}

// Region mode: cover the display so the user can drag a selection over the
// frozen screenshot.
async function openOverlay(capture: Capture, since: number): Promise<void> {
  const win = await takeCaptureWindow("overlay");
  overlayWindow = win;
  win.on("closed", () => {
    if (overlayWindow === win) overlayWindow = null;
  });
  win.setBounds(capture.display.bounds);
  // Esc closes the overlay even when it never got keyboard focus.
  const escape = (): void => {
    if (!win.isDestroyed()) win.close();
  };
  if (globalShortcut.register("Escape", escape)) {
    win.on("closed", () => globalShortcut.unregister("Escape"));
  }
  // Show it right away — its dimming and crosshair are already painted, and
  // the frozen image matches what's on screen, so it can fill in underneath a
  // moment later. Take focus only after that, so the app below doesn't
  // visibly lose focus (grey title bar, selection) before it's covered.
  win.showInactive();
  logTiming("overlay shown", since);
  // The capture is registered right away, so a selection made meanwhile works.
  const drawn = await deliverCapture(win, capture, OVERLAY_FIRST_FRAME_MS);
  logTiming(
    drawn
      ? "overlay image drawn"
      : "overlay closed or timed out before its image was drawn",
    since,
  );
  if (win.isDestroyed()) return;
  // show() (not just focus()) so the app is activated even though the user is
  // in another app — otherwise macOS may leave the overlay without keyboard.
  win.show();
  win.focus();
}

const SCREEN_RECORDING_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";

// Without Screen Recording access macOS returns only the wallpaper, so tell
// the user how to fix it instead of opening a useless capture.
async function showScreenAccessHelp(blank = false): Promise<void> {
  // Make sure the app is listed in System Settings before sending the user there.
  await registerForScreenAccess();
  const { response } = await dialog.showMessageBox({
    type: "warning",
    message: "Snapshot Studio needs Screen Recording permission",
    detail: blank
      ? "macOS returned a black screen. Open System Settings → Privacy & Security → Screen Recording, " +
        "turn Snapshot Studio off and on again (or remove it with − and add it back), then restart the app."
      : "Open System Settings → Privacy & Security → Screen Recording, enable Snapshot Studio, then restart the app.",
    buttons: ["Open System Settings", "Cancel"],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) void shell.openExternal(SCREEN_RECORDING_SETTINGS_URL);
}

function showCaptureError(err: unknown): void {
  dialog.showErrorBox(
    "Capture failed",
    err instanceof Error ? err.message : String(err),
  );
}

async function startCapture(mode: CaptureMode): Promise<void> {
  devLog(`${mode}: started, screen recording access: ${screenAccessStatus()}`);
  if (!hasScreenAccess()) {
    await showScreenAccessHelp();
    return;
  }
  const seq = ++captureSeq;
  try {
    // A new capture replaces an open overlay; hide it first so it isn't in the shot.
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide();
      overlayWindow.close();
    }
    const started = performance.now();
    // The overlay's window mode needs the window layout as it was at the
    // shortcut, so list windows alongside the grab.
    const windows = mode === "region" ? listWindows() : undefined;
    const capture: Capture = { ...(await captureCursorDisplay()), windows };
    if (seq !== captureSeq) return;
    logTiming(`${mode}: screen grabbed`, started);
    // A black frame means macOS withheld the screen; don't cover the display
    // with it, explain how to fix the permission instead.
    if (process.platform === "darwin" && isBlankCapture(capture.image)) {
      devLog(
        `${mode}: capture is blank, Screen Recording access not in effect`,
      );
      await showScreenAccessHelp(true);
      return;
    }
    if (mode === "fullscreen") await finishCapture(capture, started);
    else await openOverlay(capture, started);
  } catch (err) {
    showCaptureError(err);
  }
}

// --- Global shortcuts ------------------------------------------------------

function registerShortcuts(settings: Settings): void {
  globalShortcut.unregisterAll();
  const bind = (accel: string, mode: CaptureMode) => {
    if (!accel) return;
    try {
      const ok = globalShortcut.register(accel, () => void startCapture(mode));
      // false: another app already owns this shortcut.
      devLog(
        `${mode} shortcut ${accel}: ${ok ? "registered" : "NOT registered (taken by another app)"}`,
      );
    } catch {
      // Invalid accelerator; the user can fix it in Settings.
      devLog(`${mode} shortcut ${accel}: invalid`);
    }
  };
  bind(settings.shortcuts.region, "region");
  bind(settings.shortcuts.fullscreen, "fullscreen");
}

// --- Tray ------------------------------------------------------------------

// A small "◉" drawn pixel by pixel, for platforms whose tray can't show text.
function trayIcon(): Electron.NativeImage {
  const size = 16;
  const bitmap = Buffer.alloc(size * size * 4); // BGRA, transparent by default
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      if ((d >= 5.5 && d <= 7.5) || d <= 3) {
        bitmap.fill(0xff, (y * size + x) * 4, (y * size + x) * 4 + 4); // opaque white
      }
    }
  }
  return nativeImage.createFromBitmap(bitmap, { width: size, height: size });
}

function buildTray(): void {
  tray?.destroy();
  if (process.platform === "darwin") {
    // The macOS menu bar renders a text title, so an empty image is enough.
    tray = new Tray(nativeImage.createEmpty());
    tray.setTitle("◉");
  } else {
    tray = new Tray(trayIcon());
  }
  tray.setToolTip("Snapshot Studio");

  const settings = getSettings();
  const menu = Menu.buildFromTemplate([
    {
      label: "Capture Region",
      accelerator: settings.shortcuts.region,
      click: () => void startCapture("region"),
    },
    {
      label: "Capture Fullscreen",
      accelerator: settings.shortcuts.fullscreen,
      click: () => void startCapture("fullscreen"),
    },
    { type: "separator" },
    { label: "Settings…", click: openSettings },
    { type: "separator" },
    { label: "Quit Snapshot Studio", role: "quit" },
  ]);
  tray.setContextMenu(menu);
}

function openSettings(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = createSettingsWindow();
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

// --- IPC -------------------------------------------------------------------

function registerIpc(): void {
  ipcMain.handle(IPC.getSettings, () => getSettings());

  ipcMain.handle(IPC.setSettings, (_e, next: Settings): Settings => {
    const saved = saveSettings(next);
    registerShortcuts(saved);
    syncLoginItem(saved.launchAtLogin);
    return saved;
  });

  ipcMain.handle(
    IPC.setEditorPrefs,
    (_e, prefs: EditorPrefs): EditorPrefs => saveEditorPrefs(prefs),
  );

  ipcMain.handle(
    IPC.setAfterCapture,
    (_e, value: AfterCapture): AfterCapture => saveAfterCapture(value),
  );

  // Windows the overlay can snap to, relative to its display.
  ipcMain.handle(IPC.overlayWindows, async (e): Promise<SelectionRect[]> => {
    const capture = captures.get(e.sender.id);
    return capture?.windows
      ? windowsOnDisplay(await capture.windows, capture.display)
      : [];
  });

  ipcMain.handle(IPC.pickSaveDirectory, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(IPC.triggerCapture, (_e, mode: CaptureMode) =>
    startCapture(mode),
  );

  ipcMain.handle(IPC.requestCapture, (e): RawImage | null => {
    const capture = captures.get(e.sender.id);
    return capture ? toRawImage(capture.image) : null;
  });

  ipcMain.handle(IPC.captureDrawn, (e) =>
    drawnWaiters.get(e.sender.id)?.(true),
  );

  ipcMain.handle(IPC.overlaySelect, async (e, rect: SelectionRect) => {
    const started = performance.now();
    const capture = captures.get(e.sender.id);
    BrowserWindow.fromWebContents(e.sender)?.close();
    if (!capture) return;
    try {
      await finishCapture(
        { ...capture, image: cropCapture(capture, rect) },
        started,
      );
    } catch (err) {
      showCaptureError(err);
    }
  });

  ipcMain.handle(IPC.overlayCancel, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
  });

  ipcMain.handle(IPC.editorCopy, (_e, dataUrl: string) => {
    clipboard.writeImage(nativeImage.createFromDataURL(dataUrl));
  });

  ipcMain.handle(
    IPC.editorSave,
    async (_e, dataUrl: string): Promise<SaveResult> => ({
      filePath: await savePng(dataUrlToBuffer(dataUrl)),
    }),
  );

  ipcMain.handle(
    IPC.editorUpload,
    async (_e, dataUrl: string): Promise<UploadResult> => {
      const settings = getSettings();
      const result = await uploadImage(
        dataUrlToBuffer(dataUrl),
        timestampName(),
        settings,
      );
      clipboard.writeText(result.url);
      return result;
    },
  );

  ipcMain.handle(IPC.editorClose, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
  });
}

// --- Lifecycle -------------------------------------------------------------

// Login items only make sense for the installed app; in dev macOS refuses them.
function syncLoginItem(openAtLogin: boolean): void {
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin });
}

if (!app.requestSingleInstanceLock()) {
  // Say why we quit: otherwise the already running copy (maybe an older
  // build) silently answers the shortcuts instead of this one.
  console.log(
    "Snapshot Studio is already running — quit it from the menu bar (◉ → Quit) first.",
  );
  app.quit();
} else {
  watchProcesses();
  app.whenReady().then(() => {
    devLog(
      `started ${app.getVersion()} on ${process.platform} ${process.getSystemVersion()}`,
    );
    // Menu-bar utility: keep it out of the Dock and app switcher.
    app.dock?.hide();
    registerIpc();
    buildTray();
    const settings = getSettings();
    registerShortcuts(settings);
    syncLoginItem(settings.launchAtLogin);
    // Have the capture windows loaded before the first shortcut press.
    prepareCaptureWindow("overlay");
    prepareCaptureWindow("editor");
  });

  // Keep running in the background as a menu-bar app when all windows close.
  app.on("window-all-closed", () => {});

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
  });
}
