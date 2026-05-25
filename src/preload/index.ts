import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type CaptureMode,
  type EditorPayload,
  type OverlayPayload,
  type SaveResult,
  type Settings,
  type UploadResult
} from '../shared/types'

const api = {
  getSettings: (): Promise<Settings> => ipcRenderer.invoke(IPC.getSettings),
  setSettings: (next: Settings): Promise<Settings> => ipcRenderer.invoke(IPC.setSettings, next),
  pickSaveDirectory: (): Promise<string | null> => ipcRenderer.invoke(IPC.pickSaveDirectory),
  triggerCapture: (mode: CaptureMode): Promise<void> =>
    ipcRenderer.invoke(IPC.triggerCapture, mode),

  // Overlay window
  requestOverlayData: (): Promise<OverlayPayload | null> =>
    ipcRenderer.invoke(IPC.requestOverlay),
  overlaySelect: (payload: EditorPayload): Promise<void> =>
    ipcRenderer.invoke(IPC.overlaySelect, payload),
  overlayCancel: (): Promise<void> => ipcRenderer.invoke(IPC.overlayCancel),

  // Editor window
  requestEditorData: (): Promise<EditorPayload | null> =>
    ipcRenderer.invoke(IPC.requestEditor),
  editorCopy: (dataUrl: string): Promise<void> => ipcRenderer.invoke(IPC.editorCopy, dataUrl),
  editorSave: (dataUrl: string): Promise<SaveResult> => ipcRenderer.invoke(IPC.editorSave, dataUrl),
  editorUpload: (dataUrl: string): Promise<UploadResult> =>
    ipcRenderer.invoke(IPC.editorUpload, dataUrl),
  editorClose: (): Promise<void> => ipcRenderer.invoke(IPC.editorClose)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
