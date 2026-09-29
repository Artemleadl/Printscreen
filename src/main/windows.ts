import { join } from 'node:path'
import { app, BrowserWindow, screen, shell } from 'electron'

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

// Capture windows are created hidden, ahead of time, and positioned when used.

function createOverlayWindow(): BrowserWindow {
  const { bounds } = screen.getPrimaryDisplay()
  const win = new BrowserWindow({
    ...bounds,
    show: false,
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
    // It's shown before it takes focus: let the first click start a selection.
    acceptFirstMouse: true,
    backgroundColor: '#00000000',
    webPreferences
  })

  // Float above everything, including the macOS menu bar and the Dock. The app
  // is already a UI-element app (Dock hidden), so skip the process-type switch
  // that would briefly hide every window, e.g. an open editor.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })

  lockDown(win)
  loadRoute(win, 'overlay')
  return win
}

function createEditorWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 720,
    height: 520,
    minWidth: 600,
    minHeight: 440,
    title: 'Snapshot Studio — Editor',
    backgroundColor: '#1e1e24',
    show: false,
    webPreferences
  })

  lockDown(win)
  loadRoute(win, 'editor')
  return win
}

// Size the editor to the capture, keep it comfortably on-screen, and center
// it on the display the capture came from.
export function placeEditorWindow(win: BrowserWindow, width: number, height: number): void {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const w = Math.min(Math.max(width + 80, 720), 1400, workArea.width)
  const h = Math.min(Math.max(height + 160, 520), 900, workArea.height)
  win.setBounds({
    x: Math.round(workArea.x + (workArea.width - w) / 2),
    y: Math.round(workArea.y + (workArea.height - h) / 2),
    width: w,
    height: h
  })
}

// --- Spare capture windows ---------------------------------------------------
// Creating a window and starting its renderer takes hundreds of ms (seconds in
// dev, where the page loads from the Vite server). Keep one hidden, loaded
// window per kind ready, so a capture only has to hand it the image.

export type CaptureWindowKind = 'overlay' | 'editor'

// Delay before preparing the next spare, so its renderer startup doesn't
// compete with the capture that just took one.
const SPARE_REFILL_DELAY_MS = 1000

const spares = new Map<CaptureWindowKind, Promise<BrowserWindow>>()
let quitting = false
app.on('before-quit', () => {
  quitting = true
})

// Resolves once the page has loaded. Always settles, so a capture waiting on
// a spare can't hang on a window that never finishes loading.
function loadCaptureWindow(kind: CaptureWindowKind): Promise<BrowserWindow> {
  const win = kind === 'overlay' ? createOverlayWindow() : createEditorWindow()
  return new Promise((resolve, reject) => {
    let settled = false
    const fail = (reason: string): void => {
      if (settled) return
      settled = true
      if (!win.isDestroyed()) win.destroy()
      reject(new Error(`Capture window failed to load: ${reason}`))
    }
    win.webContents.once('did-finish-load', () => {
      settled = true
      resolve(win)
    })
    win.webContents.once('did-fail-load', (_e, _code, description) => fail(description))
    win.webContents.once('render-process-gone', (_e, details) => fail(details.reason))
    win.once('closed', () => fail('window closed'))
  })
}

export function prepareCaptureWindow(kind: CaptureWindowKind): void {
  if (quitting || spares.has(kind)) return
  const spare = loadCaptureWindow(kind)
  spares.set(kind, spare)
  // A spare that failed to load is dropped; the next take creates a window.
  spare.catch(() => {
    if (spares.get(kind) === spare) spares.delete(kind)
  })
}

// Hand out the ready spare (or a fresh window if there is none) and prepare
// the next one shortly after.
export async function takeCaptureWindow(kind: CaptureWindowKind): Promise<BrowserWindow> {
  const spare = spares.get(kind)
  spares.delete(kind)
  let win = spare ? await spare.catch(() => null) : null
  if (!win || win.isDestroyed() || win.webContents.isCrashed()) {
    if (win && !win.isDestroyed()) win.destroy()
    win = await loadCaptureWindow(kind)
  }
  setTimeout(() => prepareCaptureWindow(kind), SPARE_REFILL_DELAY_MS)
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
