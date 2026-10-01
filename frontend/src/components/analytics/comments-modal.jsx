import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../../lib/api.js'
import { Icon, NetworkGlyph } from '../ui/icon.jsx'
import { Sheet } from '../ui/floating.jsx'
import { Select } from '../ui/select.jsx'
import { NETWORK_LABELS } from '../../lib/platforms.js'

const COMMENTS_REFRESH_INTERVAL_MS = 60_000
const COMMENTS_EMPTY_RETRY_INTERVAL_MS = 60_000
const COMMENTS_EVENTUAL_CONSISTENCY_WINDOW_MS = 5 * COMMENTS_REFRESH_INTERVAL_MS

function firstCommentValue(...values) {
  return values.find(value => value !== null && value !== undefined && value !== '') ?? null
}

function commentParentId(comment) {
  return firstCommentValue(
    comment?.parentId,
    comment?.parent_id,
    comment?.parentCommentId,
    comment?.parent_comment_id,
    comment?.replyTo,
    comment?.reply_to,
    comment?.inReplyTo,
    comment?.in_reply_to
  )
}

function commentChildren(comment) {
  const children = comment?.replies ?? comment?.responses ?? comment?.children
  if (Array.isArray(children)) return children
  if (Array.isArray(children?.data)) return children.data
  if (Array.isArray(children?.comments)) return children.comments
  return []
}

function flattenComments(items, inheritedParentId = null, seen = new Set()) {
  if (!Array.isArray(items)) return []
  return items.flatMap(comment => {
    if (!comment || typeof comment !== 'object') return []
    const id = firstCommentValue(comment.id, comment.cid)
    if (id === null || seen.has(String(id))) return []
    seen.add(String(id))
    const parentId = commentParentId(comment) ?? inheritedParentId
    const normalized = parentId === null ? comment : { ...comment, id, parentId }
    return [normalized, ...flattenComments(commentChildren(comment), id, seen)]
  })
}

// YouTube e Facebook devolvem o nome de exibição do autor, não um @usuário.
const DISPLAY_NAME_PLATFORMS = new Set(['youtube', 'facebook'])

function authorLabel(author, platform) {
  const name = String(author || '').replace(/^@/, '')
  return DISPLAY_NAME_PLATFORMS.has(String(platform || '').toLowerCase()) ? name : `@${name}`
}

function platformKey(value) {
  return String(value || 'social').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'social'
}

function formatDate(value) {
  if (!value) return 'data não informada'
  try {
    return new Date(value).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo', dateStyle: 'medium', timeStyle: 'short'
    })
  } catch { return 'data não informada' }
}

function mediaItemsOf(post) {
  return post.mediaItems?.length
    ? post.mediaItems
    : (post.mediaPath ? [{ path: post.mediaPath, type: post.mediaType }] : [])
}

function SafeAvatar({ src, alt = '', className, fallback }) {
  const [failed, setFailed] = useState(false)
  return <span className={className}>{src && !failed ? <img src={src} alt={alt} onError={() => setFailed(true)} /> : fallback}</span>
}

function SafeMedia({ item, index }) {
  const [failed, setFailed] = useState('')
  const isVideo = item.type === 'video' || item.type === 'VIDEO' || item.mediaType === 'video' || item.media_type === 'VIDEO'
  const source = item.url || item.mediaUrl || item.media_url || item.path
  const poster = item.thumbnail || item.thumbnailUrl || item.thumbnail_url || item.poster || (isVideo ? item.path : null)
  if (!source) return null
  if (isVideo && !failed) return <video src={source} poster={poster && poster !== source ? poster : undefined} controls preload="metadata" onError={() => setFailed('video')} />
  if (isVideo && failed === 'video' && poster) return <img src={poster} alt={`Prévia da mídia ${index + 1} da publicação`} onError={() => setFailed('poster')} />
  if (poster && poster !== source && !failed) return <img src={poster} alt={`Prévia da mídia ${index + 1} da publicação`} onError={() => setFailed('poster')} />
  if (!failed) return <img src={source} alt={`Mídia ${index + 1} da publicação`} onError={() => setFailed('image')} />
  return <div className="cm-media__fallback">Prévia indisponível</div>
}

function previewFromInboxPost(post) {
  if (!post) return null
  const platform = post.externalPlatform || post.platform || post.platforms?.[0] || 'instagram'
  const account = (post.accounts || []).find(item => item.platform === platform) || (post.accounts || [])[0] || {}
  return {
    ...post,
    id: post.id,
    platform,
    handle: post.handle || account.handle || '',
    avatarUrl: post.avatarUrl || account.avatarUrl || null,
    publishedAt: post.publishedAt || post.scheduledAt || null,
    youtubeTitle: post.youtubeTitle || post.titleByPlatform?.youtube || post.title || '',
    text: post.textByPlatform?.[platform] || post.text || ''
  }
}

function PostPreview({ post }) {
  if (!post) return null
  const platform = post.platform || 'instagram'
  const label = NETWORK_LABELS[platform] || platform
  const items = mediaItemsOf(post)
  const handle = post.handle ? (String(post.handle).startsWith('@') ? post.handle : `@${post.handle}`) : 'Sua publicação'
  const caption = post.text || ''
  const isFacebook = platform === 'facebook'
  const isYoutube = platform === 'youtube'

  const media = items.length > 0
    // Várias mídias rolam na horizontal: o grupo recebe foco para rolar pelo teclado (setas).
    ? <div className="cm-media" role="group" aria-label={`${items.length} mídia${items.length > 1 ? 's' : ''} da publicação`} tabIndex={items.length > 1 ? 0 : undefined}>
        {items.map((item, index) => <SafeMedia key={`${item.url || item.path || index}-${index}`} item={item} index={index} />)}
      </div>
    : <p className="cm-media__none">Esta publicação não tem mídia disponível para visualização.</p>

  return <article className={`cm-post cm-post--${platformKey(platform)}`}>
    <header className="cm-post__account">
      <SafeAvatar src={post.avatarUrl} className="cm-avatar" fallback={<NetworkGlyph network={platform} size={16} />} />
      <span className="cm-post__who"><strong>{handle}</strong><small><NetworkGlyph network={platform} size={14} />{label} · publicado em {formatDate(post.publishedAt)}</small></span>
    </header>
    {isFacebook && <p className="cm-post__caption">{caption || 'Publicação sem texto.'}</p>}
    {media}
    {isYoutube && <div className="cm-post__yt"><strong>{post.youtubeTitle || caption || 'Vídeo publicado'}</strong>{post.youtubeTitle && caption && <p>{caption}</p>}</div>}
    {!isFacebook && !isYoutube && caption && <p className="cm-post__caption">{caption}</p>}
  </article>
}

function CommentRow({ comment, postId, post, platform, replySupported, onReplied, onReplySent, onSavedText, savedTexts = [], remoteReplies = [], replies = [], repliesFor = () => [] }) {
  const [replyText, setReplyText] = useState('')
  const [sentReplies, setSentReplies] = useState([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const data = comment.createdAt ? formatDate(comment.createdAt) : ''
  const author = comment.author || 'desconhecido'
  const authorAvatar = comment.authorAvatarUrl || comment.profilePictureUrl || comment.avatarUrl || null
  const viewerName = post?.handle || 'sua conta'
  const isReply = commentParentId(comment) !== null
  const platformLabel = NETWORK_LABELS[platform] || platform || 'rede social'
  const platformClass = platformKey(platform)

  async function send() {
    const text = replyText.trim()
    if (!text) { setNotice(''); return setError('Escreva uma resposta antes de enviar.') }
    setSending(true)
    setError('')
    setNotice('')
    try {
      const request = post?.remote
        ? { url: '/api/posts/inbox/remote-comments/reply', body: { platform: post.externalPlatform, accountId: post.zernioAccountId, postId: post.externalPostId, commentId: comment.id, text } }
        : { url: `/api/posts/${postId}/comments/${comment.id}/reply`, body: { text } }
      await apiFetch(request.url, { method: 'POST', body: JSON.stringify(request.body) })
      setReplyText('')
      setSentReplies(current => [...current, {
        id: `local-reply-${Date.now()}`,
        author: viewerName,
        text,
        createdAt: new Date().toISOString()
      }])
      onReplied?.()
      onReplySent?.()
    } catch (caught) {
      setError(caught.message)
    } finally {
      setSending(false)
    }
  }

  async function saveReply() {
    const text = replyText.trim()
    if (!text) { setNotice(''); return setError('Escreva a resposta antes de salvar.') }
    try {
      await apiFetch('/api/saved-texts', { method: 'POST', body: JSON.stringify({ title: 'Resposta salva', body: text }) })
      setError('')
      setNotice('Resposta salva na biblioteca de textos.')
      onSavedText?.()
    } catch (caught) { setNotice(''); setError(caught.message) }
  }

  const topLevel = commentParentId(comment) === null
  return <article className={`comment-row comment-row-platform-${platformClass}${isReply ? ' comment-row-nested' : ''}`} data-platform={platformClass}>
    <div className="cm-comment__head">
      <SafeAvatar src={authorAvatar} className="cm-avatar cm-avatar--sm" fallback={author.slice(0, 1).toUpperCase()} />
      <span className="cm-comment__author">{authorLabel(author, platform)}</span>
      <span className="cm-comment__meta">
        <NetworkGlyph network={platform} size={14} />{isReply ? `Resposta sincronizada · ${platformLabel}` : `Recebido do ${platformLabel}`}{data && <> · <time>{data}</time></>}
      </span>
    </div>
    <p className="comment-text">{comment.text}</p>
    {sentReplies.filter(reply => !remoteReplies.some(remoteReply => remoteReply.text === reply.text)).map(reply => <div className="cm-own" key={reply.id}>
      <p className="cm-own__head"><Icon name="reply" size={14} /><strong>Sua resposta</strong><small>publicada agora</small></p>
      <p>{reply.text}</p>
    </div>)}
    {replies.length > 0 && <div className="comment-replies" aria-label="Respostas deste comentário">
      {replies.map(reply => <CommentRow key={reply.id} comment={reply} postId={postId} post={post} platform={platform} replySupported={replySupported} onReplied={onReplied} onReplySent={onReplySent} onSavedText={onSavedText} savedTexts={savedTexts} remoteReplies={repliesFor(reply.id)} replies={repliesFor(reply.id)} repliesFor={repliesFor} />)}
    </div>}
    {topLevel && replySupported
      ? <div className="cm-reply" data-active={replyText ? 'true' : undefined}>
          <div className="cm-reply__form">
            <input type="text" className="ds-input" value={replyText} onChange={event => { setReplyText(event.target.value); setNotice('') }} placeholder="Responder este comentário..." aria-label="Resposta ao comentário" disabled={sending} onKeyDown={event => { if (event.key === 'Enter') send() }} />
            <button type="button" className="ds-btn ds-btn--primary ds-btn--sm" onClick={send} disabled={sending}>{sending ? 'Publicando…' : 'Responder'}</button>
          </div>
          <div className="cm-reply__tools">
            <span className="cm-reply__as">Respondendo como <strong>@{String(viewerName).replace(/^@/, '')}</strong> · será publicada no {NETWORK_LABELS[platform] || platform || 'rede social'}</span>
            <span className="cm-reply__actions">
              {savedTexts.length > 0 && <Select
                size="sm"
                className="cm-reply__saved"
                aria-label="Usar resposta salva"
                placeholder="Usar resposta salva…"
                sheetTitle="Respostas salvas"
                value=""
                onChange={id => setReplyText(savedTexts.find(item => String(item.id) === String(id))?.body || '')}
                options={savedTexts.map(item => {
                  const titled = item.title && item.title !== 'Resposta salva'
                  return { value: item.id, label: titled ? item.title : item.body.slice(0, 50), hint: titled ? item.body.slice(0, 60) : undefined }
                })}
              />}
              <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm" onClick={saveReply}><Icon name="bookmark" size={16} />Salvar texto atual</button>
            </span>
          </div>
        </div>
      : topLevel && <p className="cm-reply__off">A resposta pelo Meu Ecoo ainda não está disponível para esta rede.</p>}
    {error && <p className="ds-fieldmsg cm-comment__msg" role="alert"><Icon name="alertCircle" size={16} />{error}</p>}
    {notice && <p className="ds-fieldmsg cm-comment__msg" data-tone="success"><Icon name="checkCircle" size={16} />{notice}</p>}
  </article>
}

export function CommentsModal({ postId, initialPost = null, onClose, onReplySent, embedded = false }) {
  const [comments, setComments] = useState([])
  const [post, setPost] = useState(() => previewFromInboxPost(initialPost))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [waitingForComments, setWaitingForComments] = useState(false)
  // Falha de uma atualização em segundo plano: a conversa carregada continua na tela.
  const [staleNotice, setStaleNotice] = useState(false)
  const [savedTexts, setSavedTexts] = useState([])
  // A lista do Inbox é recriada a cada atualização; guardar o post e o onClose
  // em refs evita reiniciar a conversa (e apagar rascunhos) sem troca de post.
  const initialPostRef = useRef(initialPost)
  const onCloseRef = useRef(onClose)
  initialPostRef.current = initialPost
  onCloseRef.current = onClose
  const remoteKey = initialPost?.remote ? [initialPost.externalPlatform, initialPost.zernioAccountId, initialPost.externalPostId].join('|') : ''

  // Uma atualização silenciosa (60 s, foco da janela, depois de responder) só troca a
  // conversa quando dá certo; se falhar, a última versão boa fica na tela com um aviso
  // discreto, e os rascunhos e respostas recém-enviadas continuam onde estavam.
  // Recarga com controle de versão do efeito abaixo (também usada depois de responder).
  const refreshRef = useRef(null)
  const load = useCallback((silent = false, signal) => {
    const source = initialPostRef.current
    if (!silent) {
      setLoading(true)
      setError('')
    }
    const remote = source?.remote
      ? `?platform=${encodeURIComponent(source.externalPlatform)}&accountId=${encodeURIComponent(source.zernioAccountId)}&postId=${encodeURIComponent(source.externalPostId)}`
      : ''
    const failed = message => {
      if (silent) setStaleNotice(true)
      else setError(message)
      return { hasComments: false, hasError: true }
    }
    return apiFetch(remote ? `/api/posts/inbox/remote-comments${remote}` : `/api/posts/${postId}/comments`, { signal })
      .then(result => {
        if (signal?.aborted) return { aborted: true }
        const nextComments = flattenComments(result.comments || [])
        if (result.error && !nextComments.length) return failed(result.error)
        setComments(nextComments)
        setPost(current => ({ ...(current || {}), ...(result.post || {}) }))
        setError(result.error || '')
        setStaleNotice(false)
        if (nextComments.length && !source?.remote) apiFetch(`/api/posts/${postId}/comments/seen`, { method: 'POST', body: JSON.stringify({ commentIds: nextComments.map(comment => comment.id) }) }).catch(() => {})
        return { hasComments: nextComments.length > 0, hasError: Boolean(result.error) }
      })
      .catch(caught => {
        if (signal?.aborted) return { aborted: true }
        return failed(caught.message)
      })
      .finally(() => { if (!silent && !signal?.aborted) setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, remoteKey])

  useEffect(() => {
    let active = true
    let timer = null
    let controller = new AbortController()
    let version = 0

    // Mostra o post escolhido imediatamente, sem esperar a rede social.
    setPost(previewFromInboxPost(initialPostRef.current))
    setComments([])
    setError('')
    setStaleNotice(false)
    setWaitingForComments(false)
    setLoading(true)
    const emptyRetryUntil = Date.now() + COMMENTS_EVENTUAL_CONSISTENCY_WINDOW_MS

    const refresh = (silent = false) => {
      const currentVersion = ++version
      if (timer) window.clearTimeout(timer)
      controller.abort()
      controller = new AbortController()
      load(silent, controller.signal).then(result => {
        if (!active || currentVersion !== version || result?.aborted) return
        const waiting = !result?.hasComments && !result?.hasError && Date.now() < emptyRetryUntil
        setWaitingForComments(waiting)
        const nextRefreshIn = waiting ? COMMENTS_EMPTY_RETRY_INTERVAL_MS : COMMENTS_REFRESH_INTERVAL_MS
        timer = window.setTimeout(() => refresh(true), nextRefreshIn)
      })
    }

    const onFocus = () => refresh(true)
    refreshRef.current = refresh
    refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      active = false
      refreshRef.current = null
      if (timer) window.clearTimeout(timer)
      controller.abort()
      window.removeEventListener('focus', onFocus)
    }
  }, [load, postId])

  const loadSavedTexts = useCallback(() => apiFetch('/api/saved-texts').then(data => setSavedTexts(data.savedTexts || [])).catch(() => {}), [])
  useEffect(() => { loadSavedTexts() }, [loadSavedTexts])

  const visiblePost = post && String(post.id) === String(postId) ? post : previewFromInboxPost(initialPost)
  const repliesByParent = new Map()
  comments.forEach(comment => {
    const parentId = commentParentId(comment)
    if (parentId === null) return
    const key = String(parentId)
    const current = repliesByParent.get(key) || []
    current.push(comment)
    repliesByParent.set(key, current)
  })
  const repliesFor = commentId => repliesByParent.get(String(commentId)) || []
  const topLevelComments = comments.filter(comment => commentParentId(comment) === null)
  const platformClass = platformKey(visiblePost?.platform)
  const body = <>
    <PostPreview post={visiblePost} />
    <div className="cm-body">
      {error && <p className="ds-alert cm-state" data-tone="danger" role="alert"><Icon name="alertCircle" className="ds-alert__icon" /><span className="ds-alert__text">{error}</span></p>}
      {staleNotice && comments.length > 0 && <p className="cm-stale" role="status"><Icon name="refresh" size={16} />Não conseguimos atualizar os comentários agora. Mostrando a última versão; tentamos de novo em instantes.</p>}
      {!error && loading && <p className="cm-state" aria-live="polite"><span className="ds-spinner" aria-hidden="true" />Carregando publicação e comentários...</p>}
      {!error && !loading && !comments.length && waitingForComments && <p className="cm-state" role="status" aria-live="polite">Aguardando a sincronização dos comentários… verificando novamente.</p>}
      {!error && !loading && !comments.length && !waitingForComments && <p className="cm-state">Nenhum comentário ainda.</p>}
      {!loading && topLevelComments.length > 0 && <div className={`cm-thread cm-thread--${platformClass}`} aria-label="Comentários da publicação">
        {topLevelComments.map(comment => <CommentRow key={comment.id} comment={comment} postId={postId} post={visiblePost} platform={visiblePost?.platform} replySupported={visiblePost?.replySupported} onReplied={() => refreshRef.current?.(true)} onReplySent={onReplySent} onSavedText={loadSavedTexts} savedTexts={savedTexts} remoteReplies={repliesFor(comment.id)} replies={repliesFor(comment.id)} repliesFor={repliesFor} />)}
      </div>}
    </div>
  </>

  if (embedded) {
    return <section className="cm cm--embedded" aria-label="Conversa da publicação">
      <header className="cm-head">
        <p className="ds-eyebrow">Conversa</p>
        <h2 className="cm-head__title">Comentários e respostas</h2>
      </header>
      {body}
    </section>
  }

  return <Sheet open onClose={() => onCloseRef.current?.()} eyebrow="Conversa" title="Comentários e respostas" size="lg" className="cm cm--modal">
    <div className="cm-scroll">{body}</div>
  </Sheet>
}
