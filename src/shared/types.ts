// Types shared between the main process, preload bridge and renderer windows.

export type CaptureMode = 'region' | 'fullscreen' | 'window'

export interface DisplayInfo {
  id: number
  scaleFactor: number
  // Bounds in DIP (device-independent pixels), relative to the global desktop.
  bounds: { x: number; y: number; width: number; height: number }
}

// A captured image as raw pixels: tightly packed BGRA rows, the order Chromium
// keeps bitmaps in. Captures travel like this instead of as PNG data URLs, so
// no image encode/decode sits between the shortcut and the window appearing.
export interface RawImage {
  width: number
  height: number
  bgra: Uint8Array
}

// Pixel size of the capture a window holds; the pixels themselves stay in
// the preload, which draws them straight into the page's canvas.
export interface CaptureSize {
  width: number
  height: number
}

// A region selected in the overlay, in the overlay window's own coordinates
// (DIP). The main process maps it onto the captured image's pixels.
export interface SelectionRect {
  x: number
  y: number
  width: number
  height: number
}

export type Background =
  | { type: 'none' }
  | { type: 'solid'; color: string }
  | { type: 'gradient'; from: string; to: string; angle: number }

export interface Frame {
  padding: number
  radius: number
  background: Background
}

export interface EditorPrefs {
  frame: Frame
  color: string
  width: number
  blurRadius: number
}

export const DEFAULT_EDITOR_PREFS: EditorPrefs = {
  frame: { padding: 0, radius: 0, background: { type: 'none' } },
  color: '#f0476b',
  width: 4,
  blurRadius: 10
}

export type UploadProvider = 'none' | 'custom-http' | 'supabase'

export interface CustomHttpUploadConfig {
  // Endpoint receiving a multipart/form-data POST with field `file`.
  url: string
  // Optional bearer token sent as `Authorization: Bearer <token>`.
  token?: string
  // JSON path (dot notation) to the public URL in the response, e.g. "data.url".
  responseUrlPath: string
}

export interface SupabaseUploadConfig {
  url: string
  anonKey: string
  bucket: string
}

export interface Settings {
  shortcuts: {
    region: string
    fullscreen: string
  }
  saveDirectory: string
  copyOnCapture: boolean
  launchAtLogin: boolean
  upload: {
    provider: UploadProvider
    customHttp: CustomHttpUploadConfig
    supabase: SupabaseUploadConfig
  }
  editorPrefs: EditorPrefs
}

export interface UploadResult {
  url: string
}

export interface SaveResult {
  filePath: string
}

export const DEFAULT_SETTINGS: Settings = {
  shortcuts: {
    region: 'CommandOrControl+Shift+1',
    fullscreen: 'CommandOrControl+Shift+2'
  },
  saveDirectory: '',
  copyOnCapture: false,
  launchAtLogin: false,
  upload: {
    provider: 'none',
    customHttp: { url: '', token: '', responseUrlPath: 'url' },
    supabase: { url: '', anonKey: '', bucket: 'screenshots' }
  },
  editorPrefs: DEFAULT_EDITOR_PREFS
}

// IPC channel names, kept in one place so main/preload/renderer stay in sync.
// All channels are renderer -> main invoke()s except `captureAvailable`, a
// data-less main -> renderer ping. Capture windows are created ahead of time;
// they pull their image on mount and again on that ping, so a ping sent
// before the page subscribed is never lost.
export const IPC = {
  requestCapture: 'capture:request',
  captureAvailable: 'capture:available',
  captureDrawn: 'capture:drawn',
  overlaySelect: 'overlay:select',
  overlayCancel: 'overlay:cancel',
  editorCopy: 'editor:copy',
  editorSave: 'editor:save',
  editorUpload: 'editor:upload',
  editorClose: 'editor:close',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  setEditorPrefs: 'settings:setEditorPrefs',
  pickSaveDirectory: 'settings:pickSaveDirectory',
  triggerCapture: 'capture:trigger'
} as const
