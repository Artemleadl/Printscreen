import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'

// Renderers only talk to main through the preload bridge, so they can run
// fully sandboxed with context isolation.
const webPreferences: Electron.WebPreferences = {
  preload: join(__dirname, '../preload/index.js'),
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false
}

// Windows only ever show our own renderer: block in-page navigation and
// send any window.open / target=_blank link to the default browser instead.
function lockDown(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
}

// Load the renderer at a given hash route, in dev or production.
function loadRoute(win: BrowserWindow, route: string): void {
  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (devServer) {
    void win.loadURL(`${devServer}#/${route}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: `/${route}` })
  }
}

export function createOverlayWindow(bounds: Electron.Rectangle): BrowserWindow {
  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    enableLargerThanScreen: true,
    backgroundColor: '#00000000',
    webPreferences
  })

  // Float above everything, including the macOS menu bar and the Dock.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  lockDown(win)
  loadRoute(win, 'overlay')
  return win
}

export function createEditorWindow(width: number, height: number): BrowserWindow {
  // Keep the editor comfortably on-screen regardless of capture size.
  const winWidth = Math.min(Math.max(width + 80, 720), 1400)
  const winHeight = Math.min(Math.max(height + 160, 520), 900)

  const win = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    minWidth: 600,
    minHeight: 440,
    title: 'Snapshot Studio — Editor',
    backgroundColor: '#1e1e24',
    show: false,
    webPreferences
  })

  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })
  lockDown(win)
  loadRoute(win, 'editor')
  return win
}

export function createSettingsWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 560,
    height: 680,
    title: 'Snapshot Studio — Settings',
    backgroundColor: '#1e1e24',
    resizable: false,
    show: false,
    webPreferences
  })

  win.once('ready-to-show', () => win.show())
  lockDown(win)
  loadRoute(win, 'settings')
  return win
}
