import { useEffect, useState } from 'react'
import type { Settings as SettingsType, UploadProvider } from '@shared/types'
import './settings.css'

export function Settings(): React.ReactElement {
  const [s, setS] = useState<SettingsType | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void window.api.getSettings().then(setS)
  }, [])

  if (!s) return <div className="settings-loading">Loading…</div>

  const update = (patch: Partial<SettingsType>): void => {
    setS({ ...s, ...patch })
    setSaved(false)
  }

  const save = async (): Promise<void> => {
    const next = await window.api.setSettings(s)
    setS(next)
    setSaved(true)
  }

  const pickDir = async (): Promise<void> => {
    const dir = await window.api.pickSaveDirectory()
    if (dir) update({ saveDirectory: dir })
  }

  return (
    <div className="settings">
      <h1>Snapshot Studio</h1>

      <section>
        <h2>Shortcuts</h2>
        <label className="row">
          <span>Capture region</span>
          <input
            value={s.shortcuts.region}
            onChange={(e) => update({ shortcuts: { ...s.shortcuts, region: e.target.value } })}
            placeholder="CommandOrControl+Shift+1"
          />
        </label>
        <label className="row">
          <span>Capture fullscreen</span>
          <input
            value={s.shortcuts.fullscreen}
            onChange={(e) => update({ shortcuts: { ...s.shortcuts, fullscreen: e.target.value } })}
            placeholder="CommandOrControl+Shift+2"
          />
        </label>
        <p className="hint">
          Use Electron accelerator syntax, e.g. <code>CommandOrControl+Shift+1</code>.
        </p>
      </section>

      <section>
        <h2>Capture</h2>
        <label className="row">
          <span>Save folder</span>
          <div className="dir-picker">
            <input readOnly value={s.saveDirectory} />
            <button onClick={() => void pickDir()}>Choose…</button>
          </div>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={s.copyOnCapture}
            onChange={(e) => update({ copyOnCapture: e.target.checked })}
          />
          <span>Copy to clipboard immediately after capture</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={s.launchAtLogin}
            onChange={(e) => update({ launchAtLogin: e.target.checked })}
          />
          <span>Launch at login</span>
        </label>
      </section>

      <section>
        <h2>Upload</h2>
        <label className="row">
          <span>Provider</span>
          <select
            value={s.upload.provider}
            onChange={(e) =>
              update({ upload: { ...s.upload, provider: e.target.value as UploadProvider } })
            }
          >
            <option value="none">None</option>
            <option value="custom-http">Custom HTTP endpoint</option>
            <option value="supabase">Supabase Storage</option>
          </select>
        </label>

        {s.upload.provider === 'custom-http' && (
          <>
            <label className="row">
              <span>Endpoint URL</span>
              <input
                value={s.upload.customHttp.url}
                onChange={(e) =>
                  update({
                    upload: { ...s.upload, customHttp: { ...s.upload.customHttp, url: e.target.value } }
                  })
                }
                placeholder="https://example.com/upload"
              />
            </label>
            <label className="row">
              <span>Bearer token</span>
              <input
                type="password"
                value={s.upload.customHttp.token ?? ''}
                onChange={(e) =>
                  update({
                    upload: { ...s.upload, customHttp: { ...s.upload.customHttp, token: e.target.value } }
                  })
                }
                placeholder="optional"
              />
            </label>
            <label className="row">
              <span>Response URL path</span>
              <input
                value={s.upload.customHttp.responseUrlPath}
                onChange={(e) =>
                  update({
                    upload: {
                      ...s.upload,
                      customHttp: { ...s.upload.customHttp, responseUrlPath: e.target.value }
                    }
                  })
                }
                placeholder="data.url"
              />
            </label>
            <p className="hint">
              The image is POSTed as multipart field <code>file</code>. The link is read from the
              JSON response at the given dot-path (or the plain-text body if not JSON).
            </p>
          </>
        )}

        {s.upload.provider === 'supabase' && (
          <>
            <label className="row">
              <span>Project URL</span>
              <input
                value={s.upload.supabase.url}
                onChange={(e) =>
                  update({ upload: { ...s.upload, supabase: { ...s.upload.supabase, url: e.target.value } } })
                }
                placeholder="https://xxxx.supabase.co"
              />
            </label>
            <label className="row">
              <span>Anon key</span>
              <input
                type="password"
                value={s.upload.supabase.anonKey}
                onChange={(e) =>
                  update({
                    upload: { ...s.upload, supabase: { ...s.upload.supabase, anonKey: e.target.value } }
                  })
                }
              />
            </label>
            <label className="row">
              <span>Bucket</span>
              <input
                value={s.upload.supabase.bucket}
                onChange={(e) =>
                  update({
                    upload: { ...s.upload, supabase: { ...s.upload.supabase, bucket: e.target.value } }
                  })
                }
                placeholder="screenshots"
              />
            </label>
            <p className="hint">Requires a public bucket with anon insert access.</p>
          </>
        )}
      </section>

      <div className="footer">
        {saved && <span className="saved">Saved</span>}
        <button className="save" onClick={() => void save()}>
          Save settings
        </button>
      </div>
    </div>
  )
}
