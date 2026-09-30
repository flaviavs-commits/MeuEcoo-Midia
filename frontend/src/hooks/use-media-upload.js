import { useCallback, useRef, useState } from 'react'
import { apiFetch } from '../lib/api.js'

// The same limits the backend enforces (src/infra/storage/blobStorage.js): accepted types and 200 MB per file.
export const MEDIA_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'image/avif', 'image/tiff', 'image/bmp',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska',
])
export const MEDIA_MAX_BYTES = 200 * 1024 * 1024
export const MEDIA_ACCEPT = [...MEDIA_TYPES].join(',')

export function validateMediaFile(file) {
  if (!MEDIA_TYPES.has(String(file.type || '').toLowerCase())) return 'Formato não aceito. Envie imagens (JPG, PNG, WebP, GIF, HEIC, AVIF) ou vídeos (MP4, MOV, WebM, MKV).'
  if (file.size > MEDIA_MAX_BYTES) return 'O arquivo passa de 200 MB.'
  return ''
}

// XHR, not fetch: only XHR reports upload progress.
function putWithProgress(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', url)
    request.setRequestHeader('Content-Type', file.type)
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded / event.total) }
    request.onload = () => (request.status >= 200 && request.status < 300
      ? resolve(request.responseText)
      : reject(new Error('O armazenamento recusou o arquivo. Tente de novo.')))
    request.onerror = () => reject(new Error('A conexão caiu durante o envio. Tente de novo.'))
    request.send(file)
  })
}

let sequence = 0

/*
 * Upload queue of the media library. Each file is checked against the backend limits, sent to the
 * signed upload URL with progress, then registered with POST /api/media-assets (same payload as
 * before). Files go one after another; a failure stays on its own line with its reason and a retry.
 */
export function useMediaUpload({ onFinished } = {}) {
  const [items, setItems] = useState([])
  const itemsRef = useRef(items)
  itemsRef.current = items
  const onFinishedRef = useRef(onFinished)
  onFinishedRef.current = onFinished

  const update = useCallback((id, patch) => {
    setItems(current => current.map(item => (item.id === id ? { ...item, ...patch } : item)))
  }, [])

  const uploadOne = useCallback(async item => {
    update(item.id, { status: 'uploading', progress: 0, error: '' })
    try {
      const signed = await apiFetch('/api/posts/upload-url', { method: 'POST', body: JSON.stringify({ filename: item.file.name, mimetype: item.file.type }) })
      const answer = await putWithProgress(signed.uploadUrl, item.file, progress => update(item.id, { progress }))
      let uploaded = null
      try { uploaded = answer ? JSON.parse(answer) : null } catch { uploaded = null }
      const mediaUrl = signed.mediaUrl || uploaded?.url
      if (!mediaUrl) throw new Error('O envio terminou sem o endereço do arquivo. Tente de novo.')
      update(item.id, { status: 'saving', progress: 1 })
      await apiFetch('/api/media-assets', { method: 'POST', body: JSON.stringify({ name: item.file.name, url: mediaUrl, mimeType: item.file.type, sizeBytes: item.file.size, folder: item.folder }) })
      update(item.id, { status: 'done' })
      return true
    } catch (error) {
      update(item.id, { status: 'error', retryable: true, error: error.message || 'Não foi possível enviar este arquivo.' })
      return false
    }
  }, [update])

  const add = useCallback(async (files, folder) => {
    const batch = [...files].map(file => {
      const problem = validateMediaFile(file)
      sequence += 1
      return { id: `up-${sequence}`, file, folder, status: problem ? 'error' : 'queued', progress: 0, error: problem, retryable: false }
    })
    if (!batch.length) return
    setItems(current => [...current.filter(item => item.status !== 'done'), ...batch])
    let sent = 0
    for (const item of batch) {
      if (item.status === 'queued' && await uploadOne(item)) sent += 1
    }
    onFinishedRef.current?.({ sent, failed: batch.length - sent, folder })
  }, [uploadOne])

  const retry = useCallback(async id => {
    const item = itemsRef.current.find(entry => entry.id === id)
    if (!item || !item.retryable) return
    const ok = await uploadOne(item)
    onFinishedRef.current?.({ sent: ok ? 1 : 0, failed: ok ? 0 : 1, folder: item.folder })
  }, [uploadOne])

  const dismiss = useCallback(id => setItems(current => current.filter(item => item.id !== id)), [])
  const clearFinished = useCallback(() => setItems(current => current.filter(item => item.status !== 'done')), [])
  const busy = items.some(item => item.status === 'uploading' || item.status === 'saving' || item.status === 'queued')

  return { items, add, retry, dismiss, clearFinished, busy }
}
