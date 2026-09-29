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
  type EditorPayload,
  type EditorPrefs,
  type OverlayPayload,
  type SaveResult,
  type Settings,
  type UploadResult
} from '../shared/types'
import { getSettings, saveEditorPrefs, saveSettings } from './store'
import { captureCursorDisplay, hasScreenAccess } from './capture'
import { uploadImage } from './uploader'
import { createEditorWindow, createOverlayWindow, createSettingsWindow } from './windows'

let tray: Tray | null = null
let overlayWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null

// Each capture window pulls its payload on mount, keyed by webContents id.
const editorPayloads = new Map<number, EditorPayload>()
const overlayPayloads = new Map<number, OverlayPayload>()

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

function openEditor(payload: EditorPayload): void {
  const settings = getSettings()
  if (settings.copyOnCapture) {
    clipboard.writeImage(nativeImage.createFromDataURL(payload.imageDataUrl))
  }
  const win = createEditorWindow(payload.width, payload.height)
  const id = win.webContents.id
  editorPayloads.set(id, payload)
  win.on('closed', () => editorPayloads.delete(id))
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

async function startCapture(mode: CaptureMode): Promise<void> {
  if (!hasScreenAccess()) {
    await showScreenAccessHelp()
    return
  }
  try {
    if (mode === 'fullscreen') {
      const { imageDataUrl, display } = await captureCursorDisplay()
      openEditor({
        imageDataUrl,
        width: Math.round(display.bounds.width * display.scaleFactor),
        height: Math.round(display.bounds.height * display.scaleFactor)
      })
      return
    }

    // Region mode: freeze the cursor display and let the user drag a selection.
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close()
    }
    const payload = await captureCursorDisplay()
    overlayWindow = createOverlayWindow(payload.display.bounds)
    const win = overlayWindow
    const id = win.webContents.id
    overlayPayloads.set(id, payload)
    win.webContents.once('did-finish-load', () => win.focus())
    win.on('closed', () => {
      overlayPayloads.delete(id)
      if (overlayWindow === win) overlayWindow = null
    })
  } catch (err) {
    dialog.showErrorBox('Capture failed', err instanceof Error ? err.message : String(err))
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

  ipcMain.handle(IPC.requestOverlay, (e): OverlayPayload | null => overlayPayloads.get(e.sender.id) ?? null)
  ipcMain.handle(IPC.requestEditor, (e): EditorPayload | null => editorPayloads.get(e.sender.id) ?? null)

  ipcMain.handle(IPC.overlaySelect, (_e, payload: EditorPayload) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close()
    openEditor(payload)
  })

  ipcMain.handle(IPC.overlayCancel, () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close()
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
  })

  // Keep running in the background as a menu-bar app when all windows close.
  app.on('window-all-closed', () => {})

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })
}
