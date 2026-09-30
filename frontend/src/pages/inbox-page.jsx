import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import { useApiResource } from '../hooks/use-api-resource.js'
import { Icon, NetworkGlyph } from '../components/ui/icon.jsx'
import { CommentsModal } from '../components/analytics/comments-modal.jsx'

const INBOX_FILTERS_KEY = 'meu-ecoo:inbox-filters'
const INBOX_REFRESH_INTERVAL_MS = 60_000
const inboxPlatforms = [
  { id: 'all', label: 'Todas as redes' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'tiktok', label: 'TikTok' },
]
const NETWORK_LABELS = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok', linkedin: 'LinkedIn', threads: 'Threads', reddit: 'Reddit', bluesky: 'Bluesky', x: 'X', twitter: 'X' }

function readInboxFilters() {
  try { return JSON.parse(localStorage.getItem(INBOX_FILTERS_KEY) || '{}') } catch { return {} }
}

function readInboxStatusFilter() {
  const status = readInboxFilters().status || 'all'
  return status === 'unread' ? 'unanswered' : status === 'read' ? 'answered' : status
}

function mediaItemsOf(post) {
  return post.mediaItems?.length
    ? post.mediaItems
    : (post.mediaPath ? [{ path: post.mediaPath, type: post.mediaType }] : [])
}

function firstMediaOf(post) {
  const item = mediaItemsOf(post)[0]
  if (!item) return null
  return {
    source: item.url || item.mediaUrl || item.media_url || item.path,
    type: item.type || item.mediaType || item.media_type,
    thumbnail: item.thumbnail || item.thumbnailUrl || item.thumbnail_url || item.poster || item.posterUrl || item.preview || item.previewUrl || item.preview_url || item.cover || item.coverUrl || item.image || item.imageUrl
  }
}

export function InboxMediaPreview({ media }) {
  const isVideo = String(media?.type || '').toLowerCase().includes('video')
  const candidates = [media?.thumbnail, !isVideo ? media?.source : null].filter(Boolean)
  const [candidateIndex, setCandidateIndex] = useState(0)
  const previewSource = candidates[candidateIndex]

  if (!previewSource) return <Icon name={media ? 'play' : 'image'} size={18} />
  return <img src={previewSource} alt="Prévia da publicação" onError={() => setCandidateIndex(index => index + 1)} />
}

export function InboxPage() {
  const conversationRef = useRef(null)
  const [platform, setPlatform] = useState(() => readInboxFilters().platform || 'all')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(readInboxStatusFilter)
  const [unanswered, setUnanswered] = useState({})
  const [selectedPostId, setSelectedPostId] = useState(null)
  const load = useCallback(() => apiFetch(`/api/posts/inbox${platform === 'all' ? '' : `?platform=${platform}`}`).then(data => data.posts || []), [platform])
  const { value: posts, loading, error, setValue: setPosts, setError } = useApiResource(load, [])
  const loadUnanswered = useCallback(() => apiFetch('/api/posts/inbox/unread').then(data => setUnanswered(data.unanswered || data.unread || {})).catch(() => {}), [])
  const handleConversationClose = useCallback(() => { loadUnanswered() }, [loadUnanswered])
  const handleReplySent = useCallback(() => {
    if (selectedPostId == null) return
    setUnanswered(current => {
      const count = Number(current[selectedPostId] || 0)
      if (count <= 1) {
        const next = { ...current }
        delete next[selectedPostId]
        return next
      }
      return { ...current, [selectedPostId]: count - 1 }
    })
  }, [selectedPostId])

  useEffect(() => {
    let active = true
    let refreshing = false

    const refresh = async () => {
      if (!active || refreshing || document.visibilityState === 'hidden') return
      refreshing = true
      try {
        const [nextPosts] = await Promise.all([load(), loadUnanswered()])
        if (active) {
          setPosts(nextPosts)
          setError('')
        }
      } catch (caught) {
        if (active) setError(caught.message)
      } finally {
        refreshing = false
      }
    }

    loadUnanswered()
    const timer = window.setInterval(refresh, INBOX_REFRESH_INTERVAL_MS)
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [load, loadUnanswered, setError, setPosts])
  useEffect(() => {
    try { localStorage.setItem(INBOX_FILTERS_KEY, JSON.stringify({ platform, status: statusFilter })) } catch { /* armazenamento indisponível */ }
  }, [platform, statusFilter])

  const visiblePosts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return posts.filter(post => {
      const searchable = [post.text, post.content, post.title, post.handle, post.youtubeTitle].filter(Boolean).join(' ').toLowerCase()
      const matchesSearch = !query || searchable.includes(query)
      const hasUnanswered = Number(unanswered[post.id] || 0) > 0
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'unanswered' ? hasUnanswered : !hasUnanswered)
      return matchesSearch && matchesStatus
    })
  }, [posts, search, statusFilter, unanswered])
  const totalUnanswered = Object.values(unanswered).reduce((sum, value) => sum + Number(value || 0), 0)
  const selectedPost = visiblePosts.find(post => post.id === selectedPostId) || null

  useEffect(() => {
    if (!visiblePosts.length) { setSelectedPostId(null); return }
    if (!visiblePosts.some(post => post.id === selectedPostId)) setSelectedPostId(visiblePosts[0].id)
  }, [visiblePosts, selectedPostId])

  const filtersActive = Boolean(search) || statusFilter !== 'all' || platform !== 'all'

  function clearFilters() {
    setSearch('')
    setPlatform('all')
    setStatusFilter('all')
  }

  // Abre a conversa; em telas estreitas a conversa fica abaixo da lista, então
  // a tela rola até ela e o foco acompanha.
  function openConversation(postId) {
    setSelectedPostId(postId)
    if (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1023px)').matches) {
      window.requestAnimationFrame(() => {
        conversationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        conversationRef.current?.focus({ preventScroll: true })
      })
    }
  }

  return <div className="ds-page inx" data-ds-root>
    <header className="ds-pagehead inx-head">
      <div className="ds-pagehead__text">
        <p className="ds-eyebrow">Comentários</p>
        <h1 className="ds-pagehead__title">Inbox</h1>
        <p className="ds-pagehead__lede">Veja os comentários das suas publicações e responda sua comunidade em um só lugar.</p>
      </div>
      <div className="ds-pagehead__actions">
        <span className="ds-status ds-status--soft" data-status={error ? 'warning' : 'ok'}><Icon name={error ? 'alertTriangle' : 'refresh'} />{error ? 'Última atualização falhou' : 'Atualiza a cada minuto'}</span>
      </div>
    </header>

    <div className="inx-filters">
      <div className="ds-netswitch inx-filters__nets" role="group" aria-label="Escolher rede social">
        {inboxPlatforms.map(item => <button type="button" className="ds-netswitch__opt" key={item.id} onClick={() => setPlatform(item.id)} aria-pressed={platform === item.id}>
          <NetworkGlyph network={item.id} size={16} />{item.label}
        </button>)}
      </div>
      <div className="inx-filters__line">
        <label className="ds-inputwrap inx-filters__search">
          <Icon name="search" />
          <input className="ds-input" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar pelo texto da publicação..." aria-label="Buscar publicação no Inbox" />
        </label>
        <span className="ds-select inx-filters__status">
          <select className="ds-select__control" value={statusFilter} onChange={event => setStatusFilter(event.target.value)} aria-label="Filtrar status de resposta">
            <option value="all">Todos os status</option>
            <option value="unanswered">Não respondidos</option>
            <option value="answered">Sem pendências</option>
          </select>
          <Icon name="chevronDown" className="ds-select__chev" />
        </span>
      </div>
    </div>

    {error && <div className="ds-alert inx-alert" data-tone="danger" role="alert">
      <Icon name="alertCircle" className="ds-alert__icon" />
      <p className="ds-alert__title">Não foi possível atualizar o Inbox</p>
      <p className="ds-alert__text">{error}</p>
    </div>}

    {loading
      ? <div className="inx-work" aria-busy="true">
          <p className="ds-sr-only" aria-live="polite">Carregando interações...</p>
          <div className="inx-list">{[1, 2, 3, 4].map(item => <div className="inx-skel" key={item}><span className="ds-skel" style={{ width: 52, height: 52, borderRadius: 10 }} /><span className="ds-stack" style={{ '--gap': '8px', flex: 1 }}><span className="ds-skel ds-skel--text" style={{ width: '80%' }} /><span className="ds-skel ds-skel--text" style={{ width: '50%' }} /></span></div>)}</div>
          <div className="inx-conv"><span className="ds-skel ds-skel--block" /></div>
        </div>
      : visiblePosts.length
        ? <div className="inx-work">
            <section className="inx-list" aria-labelledby="inx-list-title">
              <div className="inx-list__head">
                <h2 className="inx-list__title" id="inx-list-title">Publicações</h2>
                <p className="ds-meta"><span className="ds-num">{visiblePosts.length}</span> no filtro{totalUnanswered > 0 && <> · <span className="inx-pending"><span className="ds-num">{totalUnanswered}</span> {totalUnanswered === 1 ? 'comentário sem resposta' : 'comentários sem resposta'}</span></>}</p>
              </div>
              <ul className="inx-items">
                {visiblePosts.map(post => {
                  const count = Number(unanswered[post.id] || 0)
                  const network = post.externalPlatform || post.platform
                  const media = firstMediaOf(post)
                  const selected = selectedPostId === post.id
                  return <li key={post.id}>
                    <button type="button" className="inx-item" aria-current={selected ? 'true' : undefined} onClick={() => openConversation(post.id)}>
                      <span className={`inx-item__media${String(media?.type || '').toLowerCase() === 'video' ? ' is-video' : ''}`} aria-hidden="true"><InboxMediaPreview media={media} /></span>
                      <span className="inx-item__body">
                        <span className="inx-item__text">{post.text || post.title || 'Publicação'}</span>
                        <span className="inx-item__meta">
                          <NetworkGlyph network={network} size={14} />
                          <span>{NETWORK_LABELS[network] || network}</span>
                          {post.handle && <span>@{String(post.handle).replace(/^@/, '')}</span>}
                          <span>{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Publicação recente'}</span>
                          {post.commentCount != null && <span>{post.commentCount} {Number(post.commentCount) === 1 ? 'comentário' : 'comentários'}</span>}
                        </span>
                      </span>
                      {count > 0 && <span className="ds-badge inx-item__badge" data-tone="danger"><span className="ds-num">{count}</span><span className="ds-sr-only"> {count === 1 ? 'comentário sem resposta' : 'comentários sem resposta'}</span></span>}
                    </button>
                  </li>
                })}
              </ul>
            </section>
            <div className="inx-conv" ref={conversationRef} tabIndex={-1}>
              {selectedPostId != null
                ? <CommentsModal embedded postId={selectedPostId} initialPost={selectedPost} onClose={handleConversationClose} onReplySent={handleReplySent} />
                : <div className="ds-empty ds-empty--quiet"><p className="ds-empty__title ds-empty__title--sm">Selecione uma publicação</p><p className="ds-empty__text">Os comentários e as respostas aparecerão aqui.</p></div>}
            </div>
          </div>
        : !error || posts.length
          ? <div className="ds-empty inx-empty">
              <span className="ds-icontile ds-icontile--lg" aria-hidden="true"><Icon name={search ? 'search' : 'inbox'} /></span>
              <p className="ds-empty__title ds-empty__title--sm">{search ? 'Nenhuma publicação corresponde à busca.' : 'Nenhuma interação encontrada.'}</p>
              <p className="ds-empty__text">
                {platform === 'tiktok' && !search
                  ? 'O TikTok não disponibiliza os comentários das publicações para o Inbox. As interações aparecem para Instagram, Facebook e YouTube.'
                  : search ? 'A busca procura no texto e no título das publicações, não nos comentários.' : 'Quando suas publicações receberem comentários, elas aparecem aqui.'}
              </p>
              {filtersActive && <div className="ds-empty__actions"><button type="button" className="ds-go" onClick={clearFilters}>Limpar filtros<Icon name="arrow" /></button></div>}
            </div>
          : null}
  </div>
}
