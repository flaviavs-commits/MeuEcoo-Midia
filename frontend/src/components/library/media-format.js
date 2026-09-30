export function isVideo(asset) {
  return String(asset?.mimeType || '').startsWith('video/')
}

export function formatSize(value) {
  const bytes = Number(value || 0)
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

// "image/png" → "PNG": the format helps, the raw MIME type does not.
export function formatName(asset) {
  const subtype = String(asset?.mimeType || '').split('/')[1] || ''
  return subtype.replace(/^svg\+xml$/, 'svg').replace(/^x-matroska$/, 'mkv').replace(/^x-/, '').replace(/^quicktime$/, 'mov').replace(/^jpeg$/, 'jpg').toUpperCase()
}

export function kindLabel(asset) {
  const format = formatName(asset)
  const kind = isVideo(asset) ? 'Vídeo' : String(asset?.mimeType || '').startsWith('image/') ? 'Imagem' : 'Arquivo'
  return format ? `${kind} ${format}` : kind
}

export function countLabel(count) {
  return `${count} ${count === 1 ? 'mídia' : 'mídias'}`
}

export function shortText(text, limit = 60) {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  return value.length > limit ? `${value.slice(0, limit - 1).trimEnd()}…` : value
}

export function formatDate(value) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
}
