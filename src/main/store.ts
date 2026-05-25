import Store from 'electron-store'
import { app } from 'electron'
import { DEFAULT_SETTINGS, DEFAULT_EDITOR_PREFS, type Settings } from '../shared/types'

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

export function saveSettings(next: Settings): Settings {
  store.set('settings', next)
  return getSettings()
}
