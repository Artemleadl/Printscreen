import type { Settings, UploadResult } from '../shared/types'

function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

async function uploadCustomHttp(
  png: Buffer,
  filename: string,
  cfg: Settings['upload']['customHttp']
): Promise<UploadResult> {
  if (!cfg.url) throw new Error('Custom HTTP upload URL is not configured.')

  const form = new FormData()
  const blob = new Blob([new Uint8Array(png)], { type: 'image/png' })
  form.append('file', blob, filename)

  const headers: Record<string, string> = {}
  if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`

  const res = await fetch(cfg.url, { method: 'POST', body: form, headers })
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${res.statusText}`)
  }

  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const json = await res.json()
    const url = getByPath(json, cfg.responseUrlPath || 'url')
    if (typeof url !== 'string') {
      throw new Error(`Could not find URL at "${cfg.responseUrlPath}" in response.`)
    }
    return { url }
  }

  // Fall back to a plain-text body containing the URL.
  const text = (await res.text()).trim()
  if (!/^https?:\/\//.test(text)) {
    throw new Error('Upload succeeded but the response did not contain a URL.')
  }
  return { url: text }
}

async function uploadSupabase(
  png: Buffer,
  filename: string,
  cfg: Settings['upload']['supabase']
): Promise<UploadResult> {
  if (!cfg.url || !cfg.anonKey) {
    throw new Error('Supabase URL and anon key are required.')
  }
  const base = cfg.url.replace(/\/$/, '')
  const objectPath = `${Date.now()}-${filename}`
  const endpoint = `${base}/storage/v1/object/${cfg.bucket}/${encodeURIComponent(objectPath)}`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.anonKey}`,
      apikey: cfg.anonKey,
      'Content-Type': 'image/png',
      'x-upsert': 'true'
    },
    body: new Uint8Array(png)
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Supabase upload failed: ${res.status} ${detail}`)
  }
  return {
    url: `${base}/storage/v1/object/public/${cfg.bucket}/${encodeURIComponent(objectPath)}`
  }
}

export async function uploadImage(
  png: Buffer,
  filename: string,
  settings: Settings
): Promise<UploadResult> {
  switch (settings.upload.provider) {
    case 'custom-http':
      return uploadCustomHttp(png, filename, settings.upload.customHttp)
    case 'supabase':
      return uploadSupabase(png, filename, settings.upload.supabase)
    default:
      throw new Error('No upload provider configured. Set one in Settings.')
  }
}
