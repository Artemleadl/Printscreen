import Store from 'electron-store'
import { app } from 'electron'
import { DEFAULT_SETTINGS, DEFAULT_EDITOR_PREFS, type EditorPrefs, type Settings } from '../shared/types'

const store = new Store<{ settings: Settings }>({
  defaults: { settings: DEFAULT_SETTINGS }
})

export function getSettings(): Settings {
  const saved = store.get('settings')
  // Deep-merge so newly added defaults appear for users with an old config.
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...saved?.shortcuts },
    upload: {
      ...DEFAULT_SETTINGS.upload,
      ...saved?.upload,
      customHttp: { ...DEFAULT_SETTINGS.upload.customHttp, ...saved?.upload?.customHttp },
      supabase: { ...DEFAULT_SETTINGS.upload.supabase, ...saved?.upload?.supabase }
    },
    saveDirectory: saved?.saveDirectory || app.getPath('pictures'),
    editorPrefs: { ...DEFAULT_EDITOR_PREFS, ...saved?.editorPrefs }
  }
}

// Saves the Settings window's fields. Editor prefs are owned by the editor and
// always kept from the store, so a stale copy held by one window can't
// overwrite what another window saved in the meantime.
export function saveSettings(next: Settings): Settings {
  store.set('settings', { ...next, editorPrefs: getSettings().editorPrefs })
  return getSettings()
}

// Saves only the editor's last-used prefs, leaving every other setting as is.
export function saveEditorPrefs(prefs: EditorPrefs): EditorPrefs {
  store.set('settings', { ...getSettings(), editorPrefs: prefs })
  return getSettings().editorPrefs
}
