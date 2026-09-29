import { join } from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray
} from 'electron'
import {
  IPC,
  type CaptureMode,
  type EditorPrefs,
  type RawImage,
  type SaveResult,
  type SelectionRect,
  type Settings,
  type UploadResult
} from '../shared/types'
import { getSettings, saveEditorPrefs, saveSettings } from './store'
import { captureCursorDisplay, cropCapture, hasScreenAccess, toRawImage, type Capture } from './capture'
import { uploadImage } from './uploader'
import {
  createSettingsWindow,
  placeEditorWindow,
  prepareCaptureWindow,
  takeCaptureWindow
} from './windows'

let tray: Tray | null = null
let overlayWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
// Bumped by every capture. A capture that finds it changed after grabbing
// the screen was superseded by a newer shortcut press and drops its result.
let captureSeq = 0

// The capture each overlay/editor window shows, keyed by webContents id.
const captures = new Map<number, Capture>()
// Pending "capture is drawn" acknowledgements, keyed by webContents id.
const drawnWaiters = new Map<number, (drawn: boolean) => void>()

// How long a just-shown overlay gets to put its first frame on screen before
// it is sent the capture: receiving and drawing a multi-MB image keeps its
// renderer busy and would hold that frame back (measured: ~0.4s later).
const OVERLAY_FIRST_FRAME_MS = 100

function dataUrlToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  return Buffer.from(base64, 'base64')
}

function timestampName(ext = 'png'): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `Screenshot ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} at ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}.${ext}`
}

// --- Capture orchestration -------------------------------------------------

// Dev-only log of where capture time goes on this machine.
function logTiming(event: string, since: number): void {
  if (!app.isPackaged) console.log(`[capture] ${event} after ${Math.round(performance.now() - since)}ms`)
}

// Resolves true once the window's page reports the capture is on its canvas;
// false if the window closes first or the report doesn't come in time, so a
// lost message can't keep the window hidden for good.
function whenDrawn(win: BrowserWindow, timeoutMs: number): Promise<boolean> {
  const id = win.webContents.id
  return new Promise((resolve) => {
    const done = (drawn: boolean): void => {
      clearTimeout(timer)
      drawnWaiters.delete(id)
      resolve(drawn)
    }
    const timer = setTimeout(() => done(false), timeoutMs)
    drawnWaiters.set(id, done)
  })
}

// Hand a (pre-created) window its capture: register it for the page to pull,
// then ping the page, optionally after a delay. Resolves once the page has
// drawn it (see whenDrawn).
function deliverCapture(win: BrowserWindow, capture: Capture, pingDelayMs = 0): Promise<boolean> {
  const id = win.webContents.id
  captures.set(id, capture)
  win.on('closed', () => {
    captures.delete(id)
    drawnWaiters.get(id)?.(false)
  })
  const drawn = whenDrawn(win, 1000 + pingDelayMs)
  setTimeout(() => {
    if (!win.isDestroyed()) win.webContents.send(IPC.captureAvailable)
  }, pingDelayMs)
  return drawn
}

async function openEditor(capture: Capture, since: number): Promise<void> {
  const win = await takeCaptureWindow('editor')
  const { width, height } = capture.image.getSize()
  placeEditorWindow(win, width, height)
  // Show it once the image is on the canvas, so it never flashes empty.
  const drawn = await deliverCapture(win, capture)
  if (win.isDestroyed()) return
  win.show()
  win.focus()
  logTiming(drawn ? 'editor shown' : 'editor shown before its image was drawn', since)
  if (getSettings().copyOnCapture) clipboard.writeImage(capture.image)
}

// Region mode: cover the display so the user can drag a selection over the
// frozen screenshot.
async function openOverlay(capture: Capture, since: number): Promise<void> {
  const win = await takeCaptureWindow('overlay')
  overlayWindow = win
  win.on('closed', () => {
    if (overlayWindow === win) overlayWindow = null
  })
  win.setBounds(capture.display.bounds)
  // Show it right away — its dimming and crosshair are already painted, and
  // the frozen image matches what's on screen, so it can fill in underneath a
  // moment later. Take focus only after that, so the app below doesn't
  // visibly lose focus (grey title bar, selection) before it's covered.
  win.showInactive()
  logTiming('overlay shown', since)
  // The capture is registered right away, so a selection made meanwhile works.
  const drawn = await deliverCapture(win, capture, OVERLAY_FIRST_FRAME_MS)
  logTiming(drawn ? 'overlay image drawn' : 'overlay closed or timed out before its image was drawn', since)
  if (win.isDestroyed()) return
  // show() (not just focus()) so the app is activated even though the user is
  // in another app — otherwise macOS may leave the overlay without keyboard.
  win.show()
  win.focus()
}

const SCREEN_RECORDING_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

// Without Screen Recording access macOS returns only the wallpaper, so tell
// the user how to fix it instead of opening a useless capture.
async function showScreenAccessHelp(): Promise<void> {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    message: 'Snapshot Studio needs Screen Recording permission',
    detail:
      'Open System Settings → Privacy & Security → Screen Recording, enable Snapshot Studio, then restart the app.',
    buttons: ['Open System Settings', 'Cancel'],
    defaultId: 0,
    cancelId: 1
  })
  if (response === 0) void shell.openExternal(SCREEN_RECORDING_SETTINGS_URL)
}

function showCaptureError(err: unknown): void {
  dialog.showErrorBox('Capture failed', err instanceof Error ? err.message : String(err))
}

async function startCapture(mode: CaptureMode): Promise<void> {
  if (!hasScreenAccess()) {
    await showScreenAccessHelp()
    return
  }
  const seq = ++captureSeq
  try {
    // A new capture replaces an open overlay; hide it first so it isn't in the shot.
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide()
      overlayWindow.close()
    }
    const started = performance.now()
    const capture = await captureCursorDisplay()
    if (seq !== captureSeq) return
    logTiming(`${mode}: screen grabbed`, started)
    if (mode === 'fullscreen') await openEditor(capture, started)
    else await openOverlay(capture, started)
  } catch (err) {
    showCaptureError(err)
  }
}

// --- Global shortcuts ------------------------------------------------------

function registerShortcuts(settings: Settings): void {
  globalShortcut.unregisterAll()
  const bind = (accel: string, mode: CaptureMode) => {
    if (!accel) return
    try {
      globalShortcut.register(accel, () => void startCapture(mode))
    } catch {
      // Ignore invalid accelerators; the user can fix them in Settings.
    }
  }
  bind(settings.shortcuts.region, 'region')
  bind(settings.shortcuts.fullscreen, 'fullscreen')
}

// --- Tray ------------------------------------------------------------------

// A small "◉" drawn pixel by pixel, for platforms whose tray can't show text.
function trayIcon(): Electron.NativeImage {
  const size = 16
  const bitmap = Buffer.alloc(size * size * 4) // BGRA, transparent by default
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c)
      if ((d >= 5.5 && d <= 7.5) || d <= 3) {
        bitmap.fill(0xff, (y * size + x) * 4, (y * size + x) * 4 + 4) // opaque white
      }
    }
  }
  return nativeImage.createFromBitmap(bitmap, { width: size, height: size })
}

function buildTray(): void {
  tray?.destroy()
  if (process.platform === 'darwin') {
    // The macOS menu bar renders a text title, so an empty image is enough.
    tray = new Tray(nativeImage.createEmpty())
    tray.setTitle('◉')
  } else {
    tray = new Tray(trayIcon())
  }
  tray.setToolTip('Snapshot Studio')

  const settings = getSettings()
  const menu = Menu.buildFromTemplate([
    {
      label: 'Capture Region',
      accelerator: settings.shortcuts.region,
      click: () => void startCapture('region')
    },
    {
      label: 'Capture Fullscreen',
      accelerator: settings.shortcuts.fullscreen,
      click: () => void startCapture('fullscreen')
    },
    { type: 'separator' },
    { label: 'Settings…', click: openSettings },
    { type: 'separator' },
    { label: 'Quit Snapshot Studio', role: 'quit' }
  ])
  tray.setContextMenu(menu)
}

function openSettings(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return
  }
  settingsWindow = createSettingsWindow()
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

// --- IPC -------------------------------------------------------------------

function registerIpc(): void {
  ipcMain.handle(IPC.getSettings, () => getSettings())

  ipcMain.handle(IPC.setSettings, (_e, next: Settings): Settings => {
    const saved = saveSettings(next)
    registerShortcuts(saved)
    app.setLoginItemSettings({ openAtLogin: saved.launchAtLogin })
    return saved
  })

  ipcMain.handle(IPC.setEditorPrefs, (_e, prefs: EditorPrefs): EditorPrefs => saveEditorPrefs(prefs))

  ipcMain.handle(IPC.pickSaveDirectory, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC.triggerCapture, (_e, mode: CaptureMode) => startCapture(mode))

  ipcMain.handle(IPC.requestCapture, (e): RawImage | null => {
    const capture = captures.get(e.sender.id)
    return capture ? toRawImage(capture.image) : null
  })

  ipcMain.handle(IPC.captureDrawn, (e) => drawnWaiters.get(e.sender.id)?.(true))

  ipcMain.handle(IPC.overlaySelect, async (e, rect: SelectionRect) => {
    const started = performance.now()
    const capture = captures.get(e.sender.id)
    BrowserWindow.fromWebContents(e.sender)?.close()
    if (!capture) return
    try {
      await openEditor({ ...capture, image: cropCapture(capture, rect) }, started)
    } catch (err) {
      showCaptureError(err)
    }
  })

  ipcMain.handle(IPC.overlayCancel, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })

  ipcMain.handle(IPC.editorCopy, (_e, dataUrl: string) => {
    clipboard.writeImage(nativeImage.createFromDataURL(dataUrl))
  })

  ipcMain.handle(IPC.editorSave, async (_e, dataUrl: string): Promise<SaveResult> => {
    const settings = getSettings()
    const dir = settings.saveDirectory || app.getPath('pictures')
    await mkdir(dir, { recursive: true })
    const filePath = join(dir, timestampName())
    await writeFile(filePath, dataUrlToBuffer(dataUrl))
    return { filePath }
  })

  ipcMain.handle(IPC.editorUpload, async (_e, dataUrl: string): Promise<UploadResult> => {
    const settings = getSettings()
    const result = await uploadImage(dataUrlToBuffer(dataUrl), timestampName(), settings)
    clipboard.writeText(result.url)
    return result
  })

  ipcMain.handle(IPC.editorClose, (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
}

// --- Lifecycle -------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.whenReady().then(() => {
    // Menu-bar utility: keep it out of the Dock and app switcher.
    app.dock?.hide()
    registerIpc()
    buildTray()
    const settings = getSettings()
    registerShortcuts(settings)
    app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin })
    // Have the capture windows loaded before the first shortcut press.
    prepareCaptureWindow('overlay')
    prepareCaptureWindow('editor')
  })

  // Keep running in the background as a menu-bar app when all windows close.
  app.on('window-all-closed', () => {})

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })
}
