import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type CaptureMode,
  type CaptureSize,
  type EditorPrefs,
  type RawImage,
  type SaveResult,
  type SelectionRect,
  type Settings,
  type UploadResult
} from '../shared/types'

// The capture this window shows, as raw pixels. It stays here, in the
// preload's isolated world, and is drawn straight into the page's canvas:
// copying tens of MB across the context bridge costs more than the drawing.
let capture: RawImage | null = null

// BGRA (as sent by main) -> RGBA ImageData for the canvas. Alpha is forced
// opaque; screenshots have no transparency.
function toImageData({ width, height, bgra }: RawImage): ImageData {
  const count = width * height
  // A Uint32 view needs 4-byte alignment; IPC buffers normally start at 0.
  const aligned = bgra.byteOffset % 4 === 0 ? bgra : bgra.slice()
  const src = new Uint32Array(aligned.buffer, aligned.byteOffset, count)
  const dst = new Uint32Array(count)
  for (let i = 0; i < count; i++) {
    const p = src[i]
    // Little-endian: BGRA bytes read as 0xAARRGGBB, RGBA needs 0xAABBGGRR.
    dst[i] = 0xff000000 | ((p & 0xff) << 16) | (p & 0xff00) | ((p >>> 16) & 0xff)
  }
  return new ImageData(new Uint8ClampedArray(dst.buffer), width, height)
}

const api = {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (next: Settings): Promise<Settings> => ipcRenderer.invoke(IPC.setSettings, next),
  setEditorPrefs: (prefs: EditorPrefs): Promise<EditorPrefs> =>
    ipcRenderer.invoke(IPC.setEditorPrefs, prefs),
  pickSaveDirectory: (): Promise<string | null> => ipcRenderer.invoke(IPC.pickSaveDirectory),
  triggerCapture: (mode: CaptureMode): Promise<void> =>
    ipcRenderer.invoke(IPC.triggerCapture, mode),

  // Capture windows (overlay + editor)
  // Runs `callback` whenever main hands this window a capture. Returns an unsubscribe.
  onCaptureAvailable: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(IPC.captureAvailable, listener)
    return () => {
      ipcRenderer.removeListener(IPC.captureAvailable, listener)
    }
  },
  // Fetches this window's capture; resolves with its size, or null if none yet.
  loadCapture: async (): Promise<CaptureSize | null> => {
    const image: RawImage | null = await ipcRenderer.invoke(IPC.requestCapture)
    if (!image) return null
    capture = image
    return { width: image.width, height: image.height }
  },
  // Sizes `canvas` to the loaded capture and draws it. The pixels are released
  // afterwards (the canvas keeps them), so this draws once per load.
  drawCapture: (canvas: HTMLCanvasElement): boolean => {
    if (!capture) return false
    canvas.width = capture.width
    canvas.height = capture.height
    canvas.getContext('2d')?.putImageData(toImageData(capture), 0, 0)
    capture = null
    return true
  },
  // Tells main the capture is on screen, so it can show or focus the window.
  captureDrawn: (): Promise<void> => ipcRenderer.invoke(IPC.captureDrawn),

  // Overlay window
  overlaySelect: (rect: SelectionRect): Promise<void> =>
    ipcRenderer.invoke(IPC.overlaySelect, rect),
  overlayCancel: (): Promise<void> => ipcRenderer.invoke(IPC.overlayCancel),

  // Editor window
  editorCopy: (dataUrl: string): Promise<void> => ipcRenderer.invoke(IPC.editorCopy, dataUrl),
  editorSave: (dataUrl: string): Promise<SaveResult> => ipcRenderer.invoke(IPC.editorSave, dataUrl),
  editorUpload: (dataUrl: string): Promise<UploadResult> =>
    ipcRenderer.invoke(IPC.editorUpload, dataUrl),
  editorClose: (): Promise<void> => ipcRenderer.invoke(IPC.editorClose)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
