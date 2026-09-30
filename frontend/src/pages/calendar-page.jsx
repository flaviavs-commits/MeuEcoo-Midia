import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import { useApiResource } from '../hooks/use-api-resource.js'
import { useToast } from '../components/ui/toast.jsx'
import { Icon, NetworkGlyph } from '../components/ui/icon.jsx'
import { OverflowMenu } from '../components/ui/overflow-menu.jsx'

const PLATFORM_LABELS = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok' }
const CALENDAR_VIEW_KEY = 'meu-ecoo:calendar-view'
const SCHEDULER_AUTOSAVE_KEY = 'meu-ecoo:scheduler-autosave'
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
// Tipo da mensagem de status -> tom visual e ícone usados no calendário.
const STATUS_TONES = { success: 'success', warning: 'warning', processing: 'info', error: 'danger', pending: 'pending', scheduled: 'scheduled' }
const STATUS_BADGES = { success: 'published', warning: 'partial', processing: 'processing', error: 'failed', pending: 'warning', scheduled: 'scheduled' }
const STATUS_ICONS = { success: 'checkCircle', warning: 'halfCircle', processing: 'processing', error: 'alertCircle', pending: 'clock', scheduled: 'clock' }
const LEGEND = [['scheduled', 'agendadas'], ['pending', 'aguardando confirmação'], ['processing', 'publicando'], ['success', 'publicadas'], ['warning', 'parciais'], ['error', 'com falha']]
const platformsOf = post => post.platforms || post.plataformas || (post.platform ? [post.platform] : [])
const postDateValue = post => post.calendarAt || post.calendar_at || post.publishedAt || post.published_at || post.scheduledAt || post.scheduled_at || post.data_agendamento
const normalizePostStatus = post => String(post.status || '').trim().toLowerCase()
const postStatusLabel = { scheduled: 'Agendado', agendado: 'Agendado', published: 'Publicado', publicado: 'Publicado', processing: 'Publicando', processando: 'Publicando', partial: 'Parcial', parcial: 'Parcial', error: 'Erro', erro: 'Erro' }
const isScheduled = post => ['scheduled', 'agendado'].includes(normalizePostStatus(post))
const shortText = (value, max) => value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value

function postStatusMessage(post) {
  const status = normalizePostStatus(post)
  if (status === 'published' || status === 'publicado') return { type: 'success', title: 'Publicado com sucesso', detail: 'A publicação foi confirmada nas redes selecionadas.' }
  if (status === 'partial' || status === 'parcial') return { type: 'warning', title: 'Publicado parcialmente', detail: 'A publicação foi confirmada em algumas redes e falhou em outra.' }
  if (status === 'processing' || status === 'processando') return { type: 'processing', title: 'Publicação em andamento', detail: 'O sistema está enviando o conteúdo para as redes selecionadas.' }
  if (status === 'error' || status === 'erro') return { type: 'error', title: 'Não foi possível publicar', detail: friendlyPostError(post) || 'Confira o histórico ou as conexões das redes selecionadas.' }
  const scheduledAt = new Date(postDateValue(post))
  if (isScheduled(post) && !Number.isNaN(scheduledAt.getTime()) && scheduledAt.getTime() <= Date.now()) return { type: 'pending', title: 'Aguardando confirmação da publicação', detail: 'O horário agendado já passou, mas ainda não recebemos a confirmação da rede social.' }
  return { type: 'scheduled', title: 'Publicação agendada', detail: 'Ela será enviada no dia e horário definidos.' }
}

function uniquePosts(items) {
  const seen = new Set()
  return items.filter(post => {
    const key = post.id != null ? `id:${post.id}` : `fallback:${postDateValue(post)}:${post.text || post.title || ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function formatPostTime(post) {
  const value = new Date(postDateValue(post))
  return Number.isNaN(value.getTime()) ? 'Horário não informado' : value.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function localDateTimeValue(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function calendarDayDateValue(year, month, day) {
  const date = new Date(year, month - 1, day, 10, 0, 0, 0)
  return localDateTimeValue(date)
}

function suggestedPasteDate(post) {
  const next = new Date(postDateValue(post))
  if (Number.isNaN(next.getTime())) {
    const fallback = new Date()
    fallback.setDate(fallback.getDate() + 1)
    fallback.setHours(10, 0, 0, 0)
    return localDateTimeValue(fallback)
  }
  next.setDate(next.getDate() + 1)
  return localDateTimeValue(next)
}

function suggestedRescheduleDate(post) {
  const current = new Date(postDateValue(post))
  if (!Number.isNaN(current.getTime()) && current.getTime() > Date.now()) return localDateTimeValue(current)
  const next = new Date(Date.now() + 60 * 60 * 1000)
  next.setSeconds(0, 0)
  return localDateTimeValue(next)
}

function formatPasteDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Escolha o dia e horário'
    : date.toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' })
}

function formatSavedSchedule(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'o horário salvo'
    : new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' }).format(date)
}

function brazilMonthOf(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { year: null, month: null }
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric' }).formatToParts(date)
  return {
    year: Number(parts.find(part => part.type === 'year')?.value),
    month: Number(parts.find(part => part.type === 'month')?.value)
  }
}

function brazilCalendarDateOf(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { year: null, month: null, day: null }
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date)
  return {
    year: Number(parts.find(part => part.type === 'year')?.value),
    month: Number(parts.find(part => part.type === 'month')?.value),
    day: Number(parts.find(part => part.type === 'day')?.value)
  }
}

function isAccountError(detail) {
  return /conta.*(?:não encontrada|nao encontrada|não encontrado|nao encontrado|desconect)|token|autoriz|permiss|access|\b401\b|\b403\b|reconect/i.test(detail)
}

function isUnavailableError(detail) {
  return !isAccountError(detail) && /não existe|nao existe|não encontrado|nao encontrado|remov|apag|deleted|removed|does not exist|cannot be loaded/i.test(detail)
}

// A ação disponível no calendário depende da causa registrada. Em especial,
// uma falha de conteúdo ou autorização não deve ser reenviada sem revisão.
function postFailureKind(post) {
  const detail = String(post.errorMessage || post.error_message || '').trim().toLowerCase()
  if (!detail) return 'unknown'
  if (isAccountError(detail)) return 'account'
  if (isUnavailableError(detail)) return 'unavailable'
  if (/processamento interrompido|aguardando confirmação|timeout|timed out|econnreset|etimedout|enotfound|fetch failed|network|rate.?limit|too many requests|temporariamente indispon|service unavailable|gateway timeout|\b(408|425|429|500|502|503|504|529)\b/.test(detail)) return 'retryable'
  if (/imagem|image|vídeo|video|mídia|media|formato|tamanho|caract|caption|texto|obrigat|conteúdo|content|duplicate|duplicad/.test(detail)) return 'content'
  return 'unknown'
}

function parseMediaItems(post) {
  const rawItems = Array.isArray(post.mediaItems)
    ? post.mediaItems
    : typeof post.mediaItems === 'string'
      ? (() => { try { return JSON.parse(post.mediaItems) } catch { return [] } })()
      : []
  const items = rawItems.filter(item => item && (item.path || item.url))
  if (items.length) return items
  return post.mediaPath ? [{ path: post.mediaPath, type: post.mediaType || 'image' }] : []
}

function postText(post, platform = platformsOf(post)[0]) {
  const textByPlatform = post.textByPlatform && typeof post.textByPlatform === 'object' ? post.textByPlatform : {}
  return textByPlatform[platform] || post.text || post.title || post.youtubeTitle || 'Publicação'
}

function friendlyPostError(post) {
  const detail = String(post.errorMessage || '').trim()
  if (isUnavailableError(detail)) return 'Esta publicação não está mais disponível na rede social. O registro foi mantido no calendário.'
  if (['partial', 'parcial'].includes(normalizePostStatus(post))) return 'A publicação foi concluída em algumas redes, mas houve uma falha em outra.'
  if (['error', 'erro'].includes(normalizePostStatus(post))) {
    // O backend já remove credenciais e limita mensagens externas; mostrar o
    // detalhe real evita esconder causas acionáveis como duplicidade, limite
    // da plataforma ou conta desconectada.
    if (detail) return detail.slice(0, 320)
    return 'Não foi possível confirmar esta publicação na rede social. O histórico foi mantido.'
  }
  return ''
}

// Leva o foco para dentro do diálogo ao abrir e devolve ao elemento de origem ao fechar.
function useDialogFocus(open, ref) {
  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    const target = ref.current?.querySelector('[data-autofocus]') || ref.current?.querySelector('button, input, select, textarea, [href]')
    target?.focus()
    return () => { if (previous?.isConnected && typeof previous.focus === 'function') previous.focus() }
  }, [open, ref])
}

function CalendarNetworks({ platforms, size = 16 }) {
  if (!platforms.length) return null
  return <span className="cal-nets" role="img" aria-label={`Redes: ${platforms.map(platform => PLATFORM_LABELS[platform] || platform).join(', ')}`}>
    {platforms.map(platform => PLATFORM_LABELS[platform]
      ? <NetworkGlyph network={platform} size={size} key={platform} />
      : <span className="ds-meta" key={platform}>{platform}</span>)}
  </span>
}

function CalendarStatus({ post }) {
  const { type } = postStatusMessage(post)
  const status = normalizePostStatus(post)
  return <span className="ds-status ds-status--soft" data-status={STATUS_BADGES[type]}>
    <Icon name={STATUS_ICONS[type]} />{postStatusLabel[status] || post.status || 'Sem status'}
  </span>
}

function CalendarMediaPreview({ post, compact = false }) {
  const item = parseMediaItems(post)[0]
  const source = item?.path || item?.url
  const [failed, setFailed] = useState(false)

  useEffect(() => setFailed(false), [source])

  if (!source) return null
  const className = `cal-media${compact ? ' cal-media--compact' : ''}`
  if (failed) {
    return compact
      ? <span className="cal-media cal-media--compact cal-media--off" role="img" aria-label="Prévia indisponível"><Icon name="image" size={18} /></span>
      : <p className="cal-media-off" role="status"><Icon name="image" size={16} />Prévia indisponível. A publicação pode ter sido removida da rede social.</p>
  }
  if (item.type === 'video' || item.mimetype?.startsWith('video/')) {
    return <video className={className} src={source} muted playsInline controls={!compact} preload="metadata" onError={() => setFailed(true)} aria-label="Prévia do vídeo publicado" />
  }
  return <img className={className} src={source} alt="Prévia do conteúdo publicado" onError={() => setFailed(true)} />
}

function CalendarDayPost({ post, onEdit, onCopy, onDelete, onRetryNow, onReview, onOpenIntegrations, onRepeat, repeating, repeatDate, onRepeatDateChange, onRepeatSubmit, onRepeatCancel }) {
  const platforms = platformsOf(post)
  const primaryPlatform = platforms[0]
  const error = friendlyPostError(post)
  const status = normalizePostStatus(post)
  const canRepeat = ['published', 'publicado', 'partial', 'parcial'].includes(status)
  const failureKind = postFailureKind(post)
  const retryableError = ['error', 'erro'].includes(status) && failureKind === 'retryable'
  const scheduled = isScheduled(post)
  const statusMessage = postStatusMessage(post)
  const tone = STATUS_TONES[statusMessage.type]
  const repeatInputId = useId()
  const repeatInputRef = useRef(null)
  const time = formatPostTime(post)
  const menuItems = [
    scheduled && { label: 'Excluir agendamento', icon: 'trash', danger: true, onSelect: onDelete },
    canRepeat && { label: 'Excluir post publicado', icon: 'trash', danger: true, onSelect: onDelete }
  ].filter(Boolean)
  // O aviso extra só aparece quando traz algo além da mensagem de status.
  const extraWarning = error && error !== statusMessage.detail && statusMessage.type !== 'warning' ? error : ''

  useEffect(() => { if (repeating) repeatInputRef.current?.focus() }, [repeating])

  return (
    <article className="cal-post" aria-label={`Publicação das ${time}`}>
      <time className="cal-post__time ds-num">{time}</time>
      <div className="cal-post__main">
        <p className="cal-post__meta">
          <CalendarNetworks platforms={platforms} />
          <CalendarStatus post={post} />
        </p>
        <p className="cal-post__text">{postText(post, primaryPlatform)}</p>
        <CalendarMediaPreview post={post} />
        <div className="cal-note" data-tone={tone} role={statusMessage.type === 'error' ? 'alert' : 'status'}>
          <Icon name={STATUS_ICONS[statusMessage.type]} />
          <p><strong>{statusMessage.title}</strong><span>{statusMessage.detail}</span></p>
        </div>
        {extraWarning && <p className="cal-warning"><Icon name="alertTriangle" size={16} />{extraWarning}</p>}
        <div className="cal-post__actions">
          {scheduled && <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={onEdit}><Icon name="clock" size={16} />Editar data/horário</button>}
          {scheduled && <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm" onClick={onCopy}><Icon name="copy" size={16} />Copiar</button>}
          {retryableError && <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={onRetryNow}><Icon name="refresh" size={16} />Tentar publicar novamente</button>}
          {retryableError && <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm" onClick={onEdit}><Icon name="clock" size={16} />Reagendar tentativa</button>}
          {failureKind === 'content' && <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={onReview}><Icon name="compose" size={16} />Revisar no editor</button>}
          {failureKind === 'account' && <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={onOpenIntegrations}><Icon name="plug" size={16} />Corrigir conexão</button>}
          {canRepeat && <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={onRepeat} aria-expanded={repeating}><Icon name="repeat" size={16} />Reagendar este post</button>}
          {menuItems.length > 0 && <OverflowMenu label={`Mais ações para a publicação das ${time}`} items={menuItems} />}
        </div>
        {repeating && <form className="cal-repeat" onSubmit={onRepeatSubmit}>
          <div className="cal-repeat__intro">
            <p className="cal-repeat__title">Reagendar esta publicação</p>
            <p className="ds-hint">O post original continuará publicado. Escolha o novo dia e horário para criar uma nova publicação.</p>
          </div>
          <div className="ds-field">
            <label className="ds-label" htmlFor={repeatInputId}>Novo dia e horário</label>
            <input ref={repeatInputRef} id={repeatInputId} className="ds-input cal-datetime" required type="datetime-local" value={repeatDate} onChange={onRepeatDateChange} />
          </div>
          <div className="cal-repeat__actions">
            <button type="submit" className="ds-btn ds-btn--primary ds-btn--sm">Agendar novo post</button>
            <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm" onClick={onRepeatCancel}>Cancelar</button>
          </div>
        </form>}
      </div>
    </article>
  )
}

function CalendarListEntry({ post, onEdit, onCopy, onDelete, onRetry, onReview, onOpenIntegrations }) {
  const failureKind = postFailureKind(post)
  const retryableError = ['error', 'erro'].includes(normalizePostStatus(post)) && failureKind === 'retryable'
  const scheduled = isScheduled(post)
  const error = friendlyPostError(post)
  const time = formatPostTime(post)
  const text = postText(post)
  const primary = scheduled
    ? { label: 'Editar', icon: 'clock', onClick: onEdit }
    : retryableError
      ? { label: 'Tentar novamente', icon: 'refresh', onClick: onRetry }
      : failureKind === 'content'
        ? { label: 'Revisar', icon: 'compose', onClick: onReview }
        : failureKind === 'account'
          ? { label: 'Corrigir conexão', icon: 'plug', onClick: onOpenIntegrations }
          : null
  const menuItems = [
    scheduled && { label: 'Copiar', icon: 'copy', onSelect: onCopy },
    scheduled && { label: 'Excluir', icon: 'trash', danger: true, onSelect: onDelete },
    retryableError && { label: 'Reagendar', icon: 'clock', onSelect: onEdit }
  ].filter(Boolean)
  return <li className="cal-entry">
    <time className="cal-entry__time ds-num">{time}</time>
    <div className="cal-entry__main">
      <CalendarMediaPreview post={post} compact />
      <div className="cal-entry__body">
        <p className="cal-entry__text">{text}</p>
        <p className="cal-entry__meta">
          <span className="cal-entry__nets">{platformsOf(post).map(platform => <span className="cal-entry__net" key={platform}>{PLATFORM_LABELS[platform] && <NetworkGlyph network={platform} size={14} />}{PLATFORM_LABELS[platform] || platform}</span>)}</span>
          <CalendarStatus post={post} />
        </p>
        {error && <p className="cal-warning"><Icon name="alertTriangle" size={16} />{error}</p>}
      </div>
    </div>
    {(primary || menuItems.length > 0) && <div className="cal-entry__actions">
      {primary && <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={primary.onClick}><Icon name={primary.icon} size={16} />{primary.label}</button>}
      {menuItems.length > 0 && <OverflowMenu label={`Mais ações para ${shortText(text, 40)}`} items={menuItems} />}
    </div>}
  </li>
}

// Agrupa a lista por dia (fuso de Brasília), mantendo a ordem cronológica.
function groupPostsByDay(posts) {
  const groups = []
  const byKey = new Map()
  posts.forEach(post => {
    const parts = brazilCalendarDateOf(postDateValue(post))
    const key = parts.day ? `${parts.year}-${parts.month}-${parts.day}` : 'sem-data'
    if (!byKey.has(key)) {
      const group = { key, parts, posts: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    byKey.get(key).posts.push(post)
  })
  return groups
}

export function CalendarPage({ onNavigate }) {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [editing, setEditing] = useState(null)
  const [repeating, setRepeating] = useState(null)
  const [copiedPost, setCopiedPost] = useState(null)
  const [pasting, setPasting] = useState(false)
  const [selectedDay, setSelectedDay] = useState(null)
  const [date, setDate] = useState('')
  const [repeatDate, setRepeatDate] = useState('')
  const [pasteDate, setPasteDate] = useState('')
  const [platformFilter, setPlatformFilter] = useState(() => localStorage.getItem(`${CALENDAR_VIEW_KEY}:platform`) || 'all')
  const [viewMode, setViewMode] = useState(() => localStorage.getItem(CALENDAR_VIEW_KEY) || 'calendar')
  const [draggedPost, setDraggedPost] = useState(null)
  const [dropDay, setDropDay] = useState(null)
  const notify = useToast()
  const [message, setMessage] = useState('')
  const pastePanelRef = useRef(null)
  const pasteInputRef = useRef(null)
  const dayDialogRef = useRef(null)
  const editDialogRef = useRef(null)
  const previousStatuses = useRef(null)
  const load = useCallback(async () => {
    // O endpoint do mês é a fonte principal da grade. A segunda consulta
    // garante que agendamentos recentes também apareçam na Lista mesmo quando
    // o horário persistido cruza o limite do mês por causa do fuso horário.
    const [calendarResult, scheduledResult] = await Promise.allSettled([
      apiFetch(`/api/posts/calendar?year=${year}&month=${month}`),
      apiFetch('/api/posts?status=scheduled&limit=100')
    ])
    if (calendarResult.status === 'rejected') throw calendarResult.reason
    const monthPosts = calendarResult.value?.posts || []
    const scheduledPosts = scheduledResult.status === 'fulfilled' ? scheduledResult.value?.posts || [] : []
    return uniquePosts([...monthPosts, ...scheduledPosts])
  }, [month, year])
  const { value: posts, loading, error, setError, setValue: setPosts, reload } = useApiResource(load, [])

  useEffect(() => {
    if (!posts.length) return
    const currentStatuses = new Map(posts.filter(post => post.id != null).map(post => [post.id, normalizePostStatus(post)]))
    const previous = previousStatuses.current
    if (previous) {
      posts.forEach(post => {
        if (post.id == null) return
        const before = previous.get(post.id)
        const after = normalizePostStatus(post)
        if (!before || before === after) return
        const label = postText(post).slice(0, 70)
        if (after === 'published' || after === 'publicado') notify(`Publicação ${label ? `“${label}” ` : ''}publicada com sucesso.`)
        else if (after === 'partial' || after === 'parcial') notify(`Publicação ${label ? `“${label}” ` : ''}publicada parcialmente.`, 'warning')
        else if (['error', 'erro', 'failed'].includes(after)) notify(`Publicação ${label ? `“${label}” ` : ''}falhou. Confira os detalhes no calendário.`, 'error')
      })
    }
    previousStatuses.current = currentStatuses
  }, [posts, notify])

  useEffect(() => {
    const interval = window.setInterval(() => { reload().catch(() => {}) }, 30_000)
    return () => window.clearInterval(interval)
  }, [reload])

  useEffect(() => { localStorage.setItem(`${CALENDAR_VIEW_KEY}:platform`, platformFilter) }, [platformFilter])
  useEffect(() => { localStorage.setItem(CALENDAR_VIEW_KEY, viewMode) }, [viewMode])
  // Esc fecha o diálogo do topo: reagendar, colar e, por fim, o dia.
  useEffect(() => {
    if (!selectedDay && !editing && !pasting) return undefined
    const closeOnEscape = event => {
      if (event.key !== 'Escape') return
      if (editing) setEditing(null)
      else if (pasting) setPasting(false)
      else setSelectedDay(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectedDay, editing, pasting])

  function shift(delta) {
    const next = new Date(year, month - 1 + delta, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth() + 1)
    setMessage('')
  }

  function goToToday() {
    const today = new Date()
    setYear(today.getFullYear())
    setMonth(today.getMonth() + 1)
    setMessage('')
  }

  async function reschedule(event) {
    event.preventDefault()
    try {
      const result = await apiFetch(`/api/posts/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ scheduledAt: date }) })
      const savedAt = result.post?.scheduledAt || result.post?.scheduled_at || date
      const targetMonth = brazilMonthOf(savedAt)
      if (targetMonth.year && targetMonth.month) {
        setYear(targetMonth.year)
        setMonth(targetMonth.month)
        const refreshed = await apiFetch(`/api/posts/calendar?year=${targetMonth.year}&month=${targetMonth.month}`)
        setPosts(refreshed.posts || [])
      } else {
        await reload()
      }
      setEditing(null)
      setSelectedDay(null)
      const exactDate = formatSavedSchedule(savedAt)
      setMessage(`Horário salvo: ${exactDate}. O calendário foi atualizado com a informação persistida.`)
      notify(`Publicação reagendada para ${exactDate}.`)
    }
    catch (e) { setError(e.message); notify(e.message, 'error') }
  }

  async function retryPost(post) {
    if (!window.confirm('O processamento foi interrompido sem confirmação. Confira primeiro se a publicação não apareceu na rede social; se ela já tiver sido publicada, uma nova tentativa pode gerar duplicidade. Deseja tentar novamente em aproximadamente 1 minuto?')) return
    const retryAt = new Date(Date.now() + 60 * 1000)
    try {
      await apiFetch(`/api/posts/${post.id}`, { method: 'PATCH', body: JSON.stringify({ scheduledAt: retryAt.toISOString() }) })
      setSelectedDay(null)
      setEditing(null)
      setMessage('Nova tentativa agendada para aproximadamente 1 minuto.')
      await reload()
      notify('Nova tentativa de publicação agendada.')
    } catch (e) { setError(e.message); notify(e.message, 'error') }
  }

  async function repeatPost(event) {
    event.preventDefault()
    try {
      await apiFetch(`/api/posts/${repeating.id}/repeat`, { method: 'POST', body: JSON.stringify({ scheduledAt: repeatDate }) })
      setRepeating(null)
      setSelectedDay(null)
      setMessage('Nova publicação agendada.')
      await reload()
      notify('O mesmo post foi agendado para o novo dia e horário.')
    } catch (e) { setError(e.message); notify(e.message, 'error') }
  }

  function copyScheduled(post) {
    setCopiedPost(post)
    setPasteDate(suggestedPasteDate(post))
    setPasting(true)
    setMessage('Sugerimos o próximo dia no mesmo horário. Confira ou altere antes de confirmar.')
    notify('Agendamento copiado. Escolha o novo dia e horário.')
  }

  function openPaste() {
    if (!copiedPost) return
    if (!pasteDate) setPasteDate(suggestedPasteDate(copiedPost))
    setPasting(true)
    // Leva o usuário até o campo de data, inclusive quando o diálogo já
    // estava aberto.
    window.setTimeout(() => {
      pastePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      pasteInputRef.current?.focus()
    }, 0)
  }

  function discardCopy() {
    setPasting(false)
    setCopiedPost(null)
    setMessage('')
  }

  async function pastePost(event) {
    event.preventDefault()
    if (!copiedPost) return
    try {
      await apiFetch(`/api/posts/${copiedPost.id}/repeat`, { method: 'POST', body: JSON.stringify({ scheduledAt: pasteDate }) })
      setPasting(false)
      setCopiedPost(null)
      setMessage('Agendamento colado como uma nova publicação.')
      await reload()
      notify('Novo agendamento criado.')
    } catch (e) { setError(e.message); notify(e.message, 'error') }
  }

  async function deletePublished(post) {
    const label = postText(post)
    if (!window.confirm(`Excluir “${label}” do calendário?\n\nO registro será removido do Meu Ecoo, mas a publicação original continuará nas redes sociais.`)) return
    try {
      await apiFetch(`/api/posts/${post.id}`, { method: 'DELETE' })
      setSelectedDay(null)
      setMessage('Publicação removida do calendário.')
      await reload()
      notify('Publicação removida do calendário.')
    } catch (e) { setError(e.message); notify(e.message, 'error') }
  }

  async function deleteScheduled(post) {
    const label = postText(post)
    if (!window.confirm(`Excluir o agendamento “${label}”?\n\nEle será removido do calendário e não será publicado.`)) return
    try {
      await apiFetch(`/api/posts/${post.id}`, { method: 'DELETE' })
      setSelectedDay(null)
      setMessage('Agendamento excluído.')
      await reload()
      notify('Agendamento excluído.')
    } catch (e) { setError(e.message); notify(e.message, 'error') }
  }

  async function dropPost(event, day) {
    event.preventDefault()
    const post = draggedPost
    setDraggedPost(null)
    if (!post || !isScheduled(post)) return
    const current = new Date(postDateValue(post))
    if (Number.isNaN(current.getTime())) return
    const next = new Date(year, month - 1, day, current.getHours(), current.getMinutes())
    try {
      await apiFetch(`/api/posts/${post.id}`, { method: 'PATCH', body: JSON.stringify({ scheduledAt: next.toISOString() }) })
      setMessage('Publicação movida no calendário.')
      await reload()
      notify('Publicação reagendada.')
    } catch (e) { setError(e.message); notify(e.message, 'error') }
  }

  const days = new Date(year, month, 0).getDate()
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const trailingCells = (7 - ((firstWeekday + days) % 7)) % 7
  const monthName = MONTH_NAMES[month - 1]
  const normalizedPosts = uniquePosts(posts)
  const filteredPosts = normalizedPosts.filter(post => platformFilter === 'all' || platformsOf(post).includes(platformFilter))
  const sortedPosts = [...filteredPosts].sort((a, b) => new Date(postDateValue(a)) - new Date(postDateValue(b)))
  const scheduledOutsideMonth = filteredPosts.filter(post => {
    if (!isScheduled(post)) return false
    const dateParts = brazilMonthOf(postDateValue(post))
    return dateParts.year !== year || dateParts.month !== month
  })
  const legend = LEGEND
    .map(([type, label]) => [type, label, filteredPosts.filter(post => postStatusMessage(post).type === type).length])
    .filter(([, , count]) => count > 0)
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()

  function postsForDay(day) {
    return filteredPosts
      .filter(post => {
        const value = brazilCalendarDateOf(postDateValue(post))
        return value.year === year && value.month === month && value.day === day
      })
      .sort((a, b) => new Date(postDateValue(a)) - new Date(postDateValue(b)))
  }

  function openDay(day) {
    setSelectedDay({ day })
  }

  function openPostComposer(day, schedule = false) {
    const savedAt = new Date().toISOString()
    localStorage.setItem(SCHEDULER_AUTOSAVE_KEY, JSON.stringify({
      textByPlatform: {},
      titleByPlatform: {},
      date: schedule ? calendarDayDateValue(year, month, day) : '',
      publishNow: false,
      approvalWorkspaceId: '',
      selected: ['instagram'],
      youtubeTitle: '',
      youtubeVisibility: 'public',
      youtubeMadeForKids: '',
      youtubeFormat: '',
      igFormat: 'post',
      igAspect: 'auto',
      facebookFormat: 'post',
      tiktokAspect: 'auto',
      tiktokPrivacyLevel: 'PUBLIC_TO_EVERYONE',
      savedAt
    }))
    setSelectedDay(null)
    onNavigate('agendador')
  }

  function openEditor(post) {
    setEditing(post)
    setDate(suggestedRescheduleDate(post))
    setSelectedDay(null)
  }

  function reviewFailure(post) {
    const selected = Array.isArray(post.platforms) && post.platforms.length ? post.platforms : ['instagram']
    const textByPlatform = post.textByPlatform && typeof post.textByPlatform === 'object'
      ? post.textByPlatform
      : Object.fromEntries(selected.map(platform => [platform, post.text || '']))
    const media = parseMediaItems(post)[0]
    const mediaPath = media?.path || media?.url
    if (mediaPath) {
      sessionStorage.setItem('meu-ecoo:media-library-selection', JSON.stringify({
        url: mediaPath,
        name: media?.name || 'Mídia da publicação',
        mimeType: media?.type || media?.mimetype || post.mediaType || 'application/octet-stream'
      }))
    } else sessionStorage.removeItem('meu-ecoo:media-library-selection')
    localStorage.setItem(SCHEDULER_AUTOSAVE_KEY, JSON.stringify({
      text: post.text || '',
      textByPlatform,
      titleByPlatform: post.titleByPlatform && typeof post.titleByPlatform === 'object' ? post.titleByPlatform : {},
      selected,
      publishNow: true,
      date: '',
      youtubeTitle: post.youtubeTitle || '',
      youtubeVisibility: post.youtubeVisibility || 'public',
      youtubeMadeForKids: post.youtubeMadeForKids == null ? '' : String(post.youtubeMadeForKids),
      youtubeCategoryId: post.youtubeCategoryId || '',
      youtubeFormat: post.youtubeFormat || '',
      igFormat: post.igFormat || 'post',
      facebookFormat: post.facebookFormat || 'post',
      tiktokPrivacyLevel: post.tiktokPrivacyLevel || 'PUBLIC_TO_EVERYONE',
      tiktokDisableComment: Boolean(post.tiktokDisableComment),
      tiktokDisableDuet: Boolean(post.tiktokDisableDuet),
      tiktokDisableStitch: Boolean(post.tiktokDisableStitch),
      sourceFailureId: post.id,
      savedAt: new Date().toISOString()
    }))
    onNavigate('agendador')
  }

  function openRepeat(post) {
    const next = new Date(Date.now() + 24 * 60 * 60 * 1000)
    next.setSeconds(0, 0)
    setRepeating(post)
    setRepeatDate(localDateTimeValue(next))
  }

  const selectedDayPosts = selectedDay ? postsForDay(selectedDay.day) : []
  // Reagendar e colar abrem por cima; o dia volta a aparecer quando eles fecham.
  const dayDialogOpen = Boolean(selectedDay) && !editing && !(pasting && copiedPost)
  const pasteDialogOpen = Boolean(pasting && copiedPost) && !editing
  useDialogFocus(dayDialogOpen, dayDialogRef)
  useDialogFocus(Boolean(editing), editDialogRef)
  useDialogFocus(pasteDialogOpen, pastePanelRef)

  const weekdayName = selectedDay ? new Date(year, month - 1, selectedDay.day).toLocaleDateString('pt-BR', { weekday: 'long' }) : ''
  const selectedWeekday = weekdayName.charAt(0).toUpperCase() + weekdayName.slice(1)
  const editingCurrent = editing ? new Date(postDateValue(editing)) : null

  return (
    <div className="ds-page cal" data-ds-root>
      <header className="ds-pagehead cal-head">
        <div className="ds-pagehead__text">
          <p className="ds-eyebrow">Calendário</p>
          <h1 className="ds-pagehead__title">{monthName} <em className="ds-em">{year}</em></h1>
          <p className="ds-pagehead__lede">Abra um dia para ver e agir nas publicações. Arraste um agendamento para outro dia para mudar a data.</p>
        </div>
        <div className="ds-pagehead__actions">
          <button type="button" className="ds-btn ds-btn--secondary" onClick={goToToday}>Hoje</button>
          <span className="cal-stepper">
            <button type="button" className="ds-btn ds-btn--secondary ds-btn--icon" onClick={() => shift(-1)} aria-label="Mês anterior"><Icon name="chevronLeft" /></button>
            <button type="button" className="ds-btn ds-btn--secondary ds-btn--icon" onClick={() => shift(1)} aria-label="Próximo mês"><Icon name="chevronRight" /></button>
          </span>
        </div>
        <p className="ds-sr-only" aria-live="polite">Mostrando {monthName} de {year}</p>
      </header>

      <div className="cal-controls">
        <div className="ds-netswitch" role="group" aria-label="Filtrar calendário por rede">
          {[['all', 'Todas'], ...Object.entries(PLATFORM_LABELS)].map(([key, label]) => <button type="button" className="ds-netswitch__opt" aria-pressed={platformFilter === key} onClick={() => setPlatformFilter(key)} key={key}>
            <NetworkGlyph network={key} size={16} />{label}
          </button>)}
        </div>
        <div className="ds-seg" role="group" aria-label="Modo de visualização">
          <button type="button" className="ds-seg__opt" aria-pressed={viewMode === 'calendar'} onClick={() => setViewMode('calendar')}><Icon name="calendar" size={16} />Calendário</button>
          <button type="button" className="ds-seg__opt" aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}><Icon name="activity" size={16} />Lista</button>
        </div>
      </div>

      <p className="cal-legend">
        {!(error && !filteredPosts.length) && <span className="cal-legend__total"><strong className="ds-num">{filteredPosts.length}</strong> {filteredPosts.length === 1 ? 'publicação encontrada' : 'publicações encontradas'}</span>}
        {legend.map(([type, label, count]) => <span className="cal-legend__item" key={type}><span className="cal-dot" data-tone={STATUS_TONES[type]} aria-hidden="true" /><span className="ds-num">{count}</span> {label}</span>)}
        {loading && <span className="cal-legend__sync" aria-live="polite"><span className="ds-spinner" aria-hidden="true" />Carregando publicações do mês...</span>}
      </p>

      {message && <div className="ds-alert cal-notice" data-tone={copiedPost ? undefined : 'success'} role="status">
        <Icon name={copiedPost ? 'copy' : 'checkCircle'} className="ds-alert__icon" />
        <p className="ds-alert__title">{copiedPost ? 'Post copiado com segurança' : 'Agendamento atualizado'}</p>
        <p className="ds-alert__text">{message}</p>
        {copiedPost && <p className="ds-alert__text">Nova publicação: <strong>{formatPasteDate(pasteDate)}</strong>. O agendamento original não será alterado.</p>}
        {copiedPost && <div className="ds-alert__actions">
          <button type="button" className="ds-btn ds-btn--primary ds-btn--sm" onClick={openPaste}>{pasting ? 'Alterar dia e horário' : 'Escolher dia e horário'}</button>
          <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm" onClick={discardCopy}>Descartar cópia</button>
        </div>}
        {!copiedPost && <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-btn--sm ds-alert__close" onClick={() => setMessage('')} aria-label="Dispensar aviso"><Icon name="close" size={16} /></button>}
      </div>}

      {error && <div className="ds-alert cal-notice" data-tone="danger" role="alert">
        <Icon name="alertCircle" className="ds-alert__icon" />
        <p className="ds-alert__text">{error}</p>
        <div className="ds-alert__actions"><button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={() => reload().catch(() => {})}><Icon name="refresh" size={16} />Tentar novamente</button></div>
      </div>}

      {viewMode === 'calendar' && scheduledOutsideMonth.length > 0 && <div className="ds-alert cal-notice" role="status">
        <Icon name="info" className="ds-alert__icon" />
        <p className="ds-alert__text"><strong>{scheduledOutsideMonth.length} {scheduledOutsideMonth.length === 1 ? 'agendamento' : 'agendamentos'}</strong> {scheduledOutsideMonth.length === 1 ? 'está' : 'estão'} fora de {monthName} e já foi carregado.</p>
        <div className="ds-alert__actions"><button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={() => setViewMode('list')}>Ver na lista</button></div>
      </div>}

      {viewMode === 'calendar'
        ? <div className="cal-month" aria-busy={loading}>
          {WEEKDAYS.map(label => <div className="cal-month__wd" aria-hidden="true" key={label}>{label}</div>)}
          {Array.from({ length: firstWeekday }, (_, index) => <div className="cal-month__pad" aria-hidden="true" key={`lead-${index}`} />)}
          {Array.from({ length: days }, (_, index) => {
            const day = index + 1
            const dayPosts = postsForDay(day)
            const isToday = today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === day
            const isPast = new Date(year, month - 1, day).getTime() < startOfToday
            const countId = `cal-day-${year}-${month}-${day}`
            return <button
              type="button"
              key={day}
              className="cal-day"
              data-today={isToday || undefined}
              data-past={isPast || undefined}
              data-drop={dropDay === day || undefined}
              aria-label={`Abrir publicações de ${day} de ${monthName} de ${year}${isToday ? ', hoje' : ''}`}
              aria-describedby={dayPosts.length ? countId : undefined}
              onClick={() => openDay(day)}
              onDragOver={event => { event.preventDefault(); if (draggedPost && isScheduled(draggedPost) && dropDay !== day) setDropDay(day) }}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropDay(current => current === day ? null : current) }}
              onDrop={event => { setDropDay(null); dropPost(event, day) }}
            >
              <span className="cal-day__top">
                <span className="cal-day__num ds-num">{day}</span>
                {isToday && <span className="cal-day__today">Hoje</span>}
                {dayPosts.length > 0 && <span className="ds-sr-only" id={countId}>{dayPosts.length} {dayPosts.length === 1 ? 'publicação' : 'publicações'}</span>}
              </span>
              <span className="cal-day__events">
                {dayPosts.slice(0, 3).map(post => {
                  const draggable = isScheduled(post)
                  return <span
                    className="cal-event"
                    data-tone={STATUS_TONES[postStatusMessage(post).type]}
                    key={post.id || `${postDateValue(post)}-${post.text}`}
                    draggable={draggable}
                    onDragStart={event => { event.dataTransfer?.setData('text/plain', String(post.id ?? '')); setDraggedPost(post) }}
                    onDragEnd={() => setDropDay(null)}
                    title={draggable ? 'Arraste para outro dia para reagendar' : undefined}
                  >
                    <time className="cal-event__time">{formatPostTime(post)}</time>
                    {platformsOf(post).filter(platform => PLATFORM_LABELS[platform]).slice(0, 1).map(platform => <NetworkGlyph network={platform} size={14} key={platform} />)}
                    <span className="cal-event__text">{postText(post)}</span>
                  </span>
                })}
                {dayPosts.length > 3 && <span className="cal-day__more">+{dayPosts.length - 3} mais</span>}
              </span>
            </button>
          })}
          {Array.from({ length: trailingCells }, (_, index) => <div className="cal-month__pad" aria-hidden="true" key={`trail-${index}`} />)}
        </div>
        : sortedPosts.length
          ? <div className="cal-agenda">
            {groupPostsByDay(sortedPosts).map(group => {
              const { parts } = group
              const groupDate = parts.day ? new Date(parts.year, parts.month - 1, parts.day) : null
              const isTodayGroup = groupDate && groupDate.getTime() === startOfToday
              return <section className="cal-agenda__day" key={group.key} aria-label={groupDate ? groupDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Sem data definida'}>
                <div className="cal-agenda__date" data-today={isTodayGroup || undefined} aria-hidden="true">
                  {groupDate
                    ? <><span className="cal-agenda__num ds-num">{parts.day}</span><span className="cal-agenda__label">{groupDate.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')} · {MONTH_NAMES[parts.month - 1].slice(0, 3).toLowerCase()}{parts.year !== year ? ` ${parts.year}` : ''}</span></>
                    : <span className="cal-agenda__label">Sem data</span>}
                </div>
                <ul className="cal-agenda__items">
                  {group.posts.map(post => <CalendarListEntry
                    key={post.id || `${postDateValue(post)}-${post.text}`}
                    post={post}
                    onEdit={() => openEditor(post)}
                    onCopy={() => copyScheduled(post)}
                    onDelete={() => deleteScheduled(post)}
                    onRetry={() => retryPost(post)}
                    onReview={() => reviewFailure(post)}
                    onOpenIntegrations={() => onNavigate('integracoes')}
                  />)}
                </ul>
              </section>
            })}
          </div>
          : !loading && <div className="ds-empty cal-empty">
            <span className="ds-icontile ds-icontile--lg" aria-hidden="true"><Icon name="calendar" /></span>
            <p className="ds-empty__title ds-empty__title--sm">Nenhuma publicação neste filtro.</p>
            <p className="ds-empty__text">{platformFilter === 'all' ? 'Quando você agendar ou publicar posts, eles aparecem aqui em ordem de data.' : 'Tente ver todas as redes ou outro mês.'}</p>
            {platformFilter !== 'all' && <div className="ds-empty__actions"><button type="button" className="ds-go" onClick={() => setPlatformFilter('all')}>Ver todas as redes<Icon name="arrow" /></button></div>}
          </div>}

      {dayDialogOpen && <div className="ds-scrim" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedDay(null) }}>
        <section ref={dayDialogRef} className="ds-modal ds-modal--lg" role="dialog" aria-modal="true" aria-labelledby="calendar-day-modal-title" aria-describedby="calendar-day-modal-desc">
          <header className="ds-modal__head">
            <div className="ds-modal__heading">
              <p className="ds-eyebrow">Agenda do dia</p>
              <h2 className="ds-modal__title" id="calendar-day-modal-title">{selectedDay.day} de {monthName}</h2>
              <p className="ds-modal__desc" id="calendar-day-modal-desc">
                {selectedWeekday} · {selectedDayPosts.length ? `${selectedDayPosts.length} ${selectedDayPosts.length === 1 ? 'publicação' : 'publicações'}` : 'sem publicações'}
              </p>
            </div>
            <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-modal__close" onClick={() => setSelectedDay(null)} aria-label="Fechar publicações do dia"><Icon name="close" /></button>
          </header>
          <div className="ds-modal__body">
            {selectedDayPosts.length
              ? <div className="cal-dayposts">{selectedDayPosts.map(post => <CalendarDayPost key={post.id || `${postDateValue(post)}-${post.text}`} post={post} onEdit={() => openEditor(post)} onCopy={() => copyScheduled(post)} onRetryNow={() => retryPost(post)} onReview={() => reviewFailure(post)} onOpenIntegrations={() => onNavigate('integracoes')} onRepeat={() => openRepeat(post)} onDelete={() => isScheduled(post) ? deleteScheduled(post) : deletePublished(post)} repeating={repeating?.id === post.id} repeatDate={repeatDate} onRepeatDateChange={event => setRepeatDate(event.target.value)} onRepeatSubmit={repeatPost} onRepeatCancel={() => setRepeating(null)} />)}</div>
              : <div className="ds-empty ds-empty--quiet cal-dayempty">
                <span className="ds-icontile" aria-hidden="true"><Icon name="calendar" /></span>
                <p className="ds-empty__title ds-empty__title--sm">Nenhuma publicação neste dia.</p>
                <p className="ds-empty__text">Este dia está livre para planejar um conteúdo.</p>
              </div>}
          </div>
          <footer className="ds-modal__foot">
            <p className="ds-modal__foot-text"><strong>Quer publicar mais alguma coisa?</strong><span>Abra o Meu Post para criar o conteúdo e escolher o horário.</span></p>
            <button type="button" className="ds-btn ds-btn--primary" onClick={() => openPostComposer(selectedDay.day)}><Icon name="plus" />Criar post</button>
          </footer>
        </section>
      </div>}

      {pasteDialogOpen && <div className="ds-scrim" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPasting(false) }}>
        <section ref={pastePanelRef} className="ds-modal ds-modal--sm" role="dialog" aria-modal="true" aria-labelledby="calendar-paste-title" aria-describedby="calendar-paste-desc">
          <header className="ds-modal__head">
            <div className="ds-modal__heading">
              <p className="ds-eyebrow">Duplicar agendamento</p>
              <h2 className="ds-modal__title" id="calendar-paste-title">Escolha onde colar o post</h2>
              <p className="ds-modal__desc" id="calendar-paste-desc">A cópia de “{shortText(postText(copiedPost), 90)}” será criada no dia e horário abaixo. O agendamento original continuará intacto.</p>
            </div>
            <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-modal__close" onClick={() => setPasting(false)} aria-label="Fechar"><Icon name="close" /></button>
          </header>
          <form className="cal-dialog" onSubmit={pastePost}>
            <div className="ds-modal__body cal-dialog__body">
              <div className="ds-field">
                <label className="ds-label" htmlFor="calendar-paste-date">Dia e horário da nova publicação</label>
                <input ref={pasteInputRef} id="calendar-paste-date" className="ds-input cal-datetime" data-autofocus required type="datetime-local" value={pasteDate} onChange={event => setPasteDate(event.target.value)} />
                <p className="ds-hint">{formatPasteDate(pasteDate)}</p>
              </div>
            </div>
            <footer className="ds-modal__foot cal-dialog__foot">
              <button type="button" className="ds-btn ds-btn--quiet" onClick={() => setPasting(false)}>Cancelar</button>
              <button type="submit" className="ds-btn ds-btn--primary">Confirmar nova publicação</button>
            </footer>
          </form>
        </section>
      </div>}

      {editing && <div className="ds-scrim" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setEditing(null) }}>
        <section ref={editDialogRef} className="ds-modal ds-modal--sm" role="dialog" aria-modal="true" aria-labelledby="calendar-edit-title" aria-describedby="calendar-edit-desc">
          <header className="ds-modal__head">
            <div className="ds-modal__heading">
              <p className="ds-eyebrow">Agendamento</p>
              <h2 className="ds-modal__title" id="calendar-edit-title">{['error', 'erro'].includes(normalizePostStatus(editing)) ? 'Reagendar tentativa' : 'Reagendar publicação'}</h2>
              <p className="ds-modal__desc" id="calendar-edit-desc">{shortText(postText(editing), 110)}</p>
            </div>
            <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-modal__close" onClick={() => setEditing(null)} aria-label="Fechar"><Icon name="close" /></button>
          </header>
          <form className="cal-dialog" onSubmit={reschedule}>
            <div className="ds-modal__body cal-dialog__body">
              <div className="ds-field">
                <label className="ds-label" htmlFor="calendar-edit-date">Novo dia e horário</label>
                <input id="calendar-edit-date" className="ds-input cal-datetime" data-autofocus required type="datetime-local" value={date} onChange={event => setDate(event.target.value)} />
                <p className="ds-hint">Horário atual: {editingCurrent && !Number.isNaN(editingCurrent.getTime()) ? formatPasteDate(editingCurrent) : 'não informado'}</p>
              </div>
            </div>
            <footer className="ds-modal__foot cal-dialog__foot">
              <button type="button" className="ds-btn ds-btn--quiet" onClick={() => setEditing(null)}>Cancelar</button>
              <button type="submit" className="ds-btn ds-btn--primary">Salvar</button>
            </footer>
          </form>
        </section>
      </div>}
    </div>
  )
}
