import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'

const preload = join(__dirname, '../preload/index.js')

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
    webPreferences: { preload, sandbox: false }
  })

  // Float above everything, including the macOS menu bar and the Dock.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

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
    webPreferences: { preload, sandbox: false }
  })

  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })
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
    webPreferences: { preload, sandbox: false }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.once('ready-to-show', () => win.show())
  loadRoute(win, 'settings')
  return win
}
