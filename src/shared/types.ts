// Types shared between the main process, preload bridge and renderer windows.

export type CaptureMode = 'region' | 'fullscreen' | 'window'

export interface DisplayInfo {
  id: number
  scaleFactor: number
  // Bounds in DIP (device-independent pixels), relative to the global desktop.
  bounds: { x: number; y: number; width: number; height: number }
}

// Payload handed to the overlay window so it can render the frozen screenshot
// of the display the cursor is on and let the user drag a selection.
export interface OverlayPayload {
  display: DisplayInfo
  // Full-resolution PNG data URL of the captured display.
  imageDataUrl: string
}

// A region selected by the user, expressed in the captured image's own pixels.
export interface SelectionRect {
  x: number
  y: number
  width: number
  height: number
}

// Payload handed to the editor window: a cropped PNG ready for annotation.
export interface EditorPayload {
  imageDataUrl: string
  width: number
  height: number
}

export interface EditorPrefs {
  frame: {
    padding: number
    radius: number
    background:
      | { type: 'none' }
      | { type: 'solid'; color: string }
      | { type: 'gradient'; from: string; to: string; angle: number }
  }
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
// All channels are renderer -> main invoke()s; windows pull their data on
// mount (rather than main pushing it) to avoid a load/subscribe race.
export const IPC = {
  requestOverlay: 'overlay:request',
  overlaySelect: 'overlay:select',
  overlayCancel: 'overlay:cancel',
  requestEditor: 'editor:request',
  editorCopy: 'editor:copy',
  editorSave: 'editor:save',
  editorUpload: 'editor:upload',
  editorClose: 'editor:close',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  pickSaveDirectory: 'settings:pickSaveDirectory',
  triggerCapture: 'capture:trigger'
} as const
