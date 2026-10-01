/*
 * Abrir uma publicação no Meu Post a partir de outra tela (Início, Calendário, Baú, Biblioteca,
 * Assistente). O Meu Post lê, ao abrir:
 *   - SCHEDULER_AUTOSAVE_KEY (localStorage): o rascunho — textos, redes e as opções de cada rede;
 *   - MEDIA_LIBRARY_SELECTION_KEY (sessionStorage): as mídias a anexar, uma ou várias, na ordem;
 *   - AI_POST_DRAFT_KEY (sessionStorage): imagem e texto vindos do assistente.
 * Antes, cada tela escrevia esse rascunho à sua maneira e as cópias divergiram (carrossel virava uma
 * imagem só, Reels do Facebook voltava a Feed, categoria do YouTube e opções do TikTok se perdiam).
 */
export const SCHEDULER_AUTOSAVE_KEY = 'meu-ecoo:scheduler-autosave'
export const MEDIA_LIBRARY_SELECTION_KEY = 'meu-ecoo:media-library-selection'
export const AI_POST_DRAFT_KEY = 'meu-ecoo:ai-post-draft'

const DEFAULT_TIKTOK_PRIVACY = 'PUBLIC_TO_EVERYONE'

function objectOrEmpty(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch { return {} }
  }
  return {}
}

function pick(source, ...keys) {
  for (const key of keys) if (source?.[key] != null && source[key] !== '') return source[key]
  return undefined
}

// Mídias de uma publicação ou ideia, na ordem: mediaItems (array ou JSON) e, sem eles, a mídia única.
export function mediaItemsOf(source) {
  const raw = pick(source, 'mediaItems', 'media_items')
  let items = []
  if (Array.isArray(raw)) items = raw
  else if (typeof raw === 'string') {
    try { items = JSON.parse(raw) } catch { items = [] }
  }
  items = (Array.isArray(items) ? items : []).filter(item => item && (item.path || item.url))
  if (items.length) return items
  const path = pick(source, 'mediaPath', 'media_path')
  return path ? [{ path, type: pick(source, 'mediaType', 'media_type') || 'image' }] : []
}

// Mídia no formato que o Meu Post baixa e anexa: { url, name, mimeType }.
export function mediaSelectionOf(item, fallbackName = 'Mídia da publicação') {
  return {
    url: item.path || item.url,
    name: item.name || fallbackName,
    mimeType: item.mimeType || item.mimetype || (item.type && item.type.includes('/') ? item.type : '') || 'application/octet-stream',
  }
}

/*
 * Rascunho completo do Meu Post a partir de uma publicação (ou ideia) — todos os campos que o Meu Post
 * restaura. Campos em snake_case (Baú) e camelCase (posts) são aceitos.
 */
export function composerDraftFromPost(post, { publishNow = false, date = '', sourceFailureId = null } = {}) {
  const platforms = Array.isArray(post.platforms) && post.platforms.length ? post.platforms.filter(Boolean) : ['instagram']
  const text = pick(post, 'text', 'texto', 'title') || ''
  const textsFromPost = objectOrEmpty(pick(post, 'textByPlatform', 'text_by_platform'))
  const textByPlatform = Object.keys(textsFromPost).length ? textsFromPost : Object.fromEntries(platforms.map(platform => [platform, text]))
  const madeForKids = pick(post, 'youtubeMadeForKids', 'youtube_made_for_kids')
  return {
    text,
    textByPlatform,
    titleByPlatform: objectOrEmpty(pick(post, 'titleByPlatform', 'title_by_platform')),
    selected: platforms,
    publishNow,
    date,
    youtubeTitle: pick(post, 'youtubeTitle', 'youtube_title') || '',
    youtubeVisibility: pick(post, 'youtubeVisibility', 'youtube_visibility') || 'public',
    youtubeMadeForKids: madeForKids == null ? '' : String(madeForKids),
    youtubeCategoryId: String(pick(post, 'youtubeCategoryId', 'youtube_category_id') || ''),
    youtubeFormat: pick(post, 'youtubeFormat', 'youtube_format') || '',
    igFormat: pick(post, 'igFormat', 'ig_format') || 'post',
    facebookFormat: pick(post, 'facebookFormat', 'facebook_format') || 'post',
    tiktokPrivacyLevel: pick(post, 'tiktokPrivacyLevel', 'tiktok_privacy_level') || DEFAULT_TIKTOK_PRIVACY,
    tiktokDisableComment: Boolean(pick(post, 'tiktokDisableComment', 'tiktok_disable_comment')),
    tiktokDisableDuet: Boolean(pick(post, 'tiktokDisableDuet', 'tiktok_disable_duet')),
    tiktokDisableStitch: Boolean(pick(post, 'tiktokDisableStitch', 'tiktok_disable_stitch')),
    sourceFailureId,
    savedAt: new Date().toISOString(),
  }
}

// Rascunho em branco (ex.: "Agendar neste dia" no Calendário).
export function blankComposerDraft({ date = '', selected = ['instagram'] } = {}) {
  return composerDraftFromPost({ platforms: selected }, { date })
}

/*
 * Grava o rascunho e as mídias para o Meu Post. Devolve false quando o navegador não deixa gravar
 * (storage cheio ou bloqueado) — quem chama avisa a pessoa em vez de abrir um Meu Post vazio.
 */
export function openInComposer({ draft, media = [] }) {
  try {
    localStorage.setItem(SCHEDULER_AUTOSAVE_KEY, JSON.stringify(draft))
  } catch {
    return false
  }
  try {
    if (media.length) sessionStorage.setItem(MEDIA_LIBRARY_SELECTION_KEY, JSON.stringify(media))
    else sessionStorage.removeItem(MEDIA_LIBRARY_SELECTION_KEY)
  } catch { /* sem sessionStorage: o texto abre, as mídias ficam para anexar à mão */ }
  return true
}

// Lê e consome as mídias deixadas para o Meu Post (aceita o formato antigo, um objeto só).
export function readMediaSelection() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(MEDIA_LIBRARY_SELECTION_KEY) || 'null')
    const list = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
    return list.filter(item => item && typeof item.url === 'string' && item.url)
  } catch {
    return []
  }
}

export function clearMediaSelection() {
  try { sessionStorage.removeItem(MEDIA_LIBRARY_SELECTION_KEY) } catch { /* nada a limpar */ }
}
