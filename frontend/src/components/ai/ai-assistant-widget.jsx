import { useEffect, useRef, useState } from 'react'
import { AI_POST_DRAFT_KEY } from '../../lib/composer-handoff.js'
import { apiFetch } from '../../lib/api.js'
import { MEDIA, mediaMatches, useIsPhone } from '../../lib/breakpoints.js'
import { Sheet } from '../ui/floating.jsx'
import { Icon } from '../ui/icon.jsx'

function persistMessage(contexto, role, conteudo) {
  apiFetch('/api/ai/chat-messages', { method: 'POST', body: JSON.stringify({ contexto, role, conteudo }) }).catch(() => {})
}

const AI_REQUEST_TIMEOUT_MS = 120_000

function processingMessageFor(text) {
  const normalized = text.toLowerCase()
  if (/(imagem|arte|visual|foto|banner|thumbnail)/.test(normalized)) return 'Estou preparando sua imagem. Isso pode levar alguns segundos...'
  if (/(visualiza|desempenho|analytics|analis|alcance|engajamento)/.test(normalized)) return 'Estou analisando seus dados para encontrar o que funcionou melhor...'
  if (/(post|publica|legenda|caption|conteúdo|conteudo)/.test(normalized)) return 'Estou preparando o conteúdo ideal para você...'
  return 'Estou entendendo seu pedido e preparando a melhor resposta...'
}

function friendlyAgentError(error) {
  if (error?.status === 408 || /tempo esgotado|timeout/i.test(error?.message || '')) {
    return 'O sistema inteligente está levando mais tempo que o esperado para concluir essa tarefa. Aguarde alguns instantes antes de tentar novamente; sua solicitação pode ainda estar sendo processada.'
  }
  return error?.message || 'Não consegui concluir a solicitação agora. Tente novamente em alguns instantes.'
}

function storeAiPostDraft(postDraft) {
  const payload = { ...postDraft, savedAt: new Date().toISOString() }
  // A referência em memória evita perder uma imagem grande por limite de
  // sessionStorage; o storage mantém o fluxo funcionando após uma navegação.
  window.__socialAiPostDraft = payload
  try { sessionStorage.setItem(AI_POST_DRAFT_KEY, JSON.stringify(payload)) } catch { /* storage cheio ou bloqueado: a referência em memória acima basta */ }
}

function summarizeData(data) {
  if (!data) return ''
  if (data.image) return `Imagem gerada${data.fallback ? ' após fallback automático' : ''}.`
  if (data.capabilities) return data.capabilities.map(item => `• ${item.label}: ${item.description}`).join('\n')
  if (data.posts) return data.posts.slice(0, 8).map(post => `• #${post.id || '—'} ${post.text || post.title || post.texto || 'Publicação sem texto'} (${post.status || 'sem status'})`).join('\n')
  if (data.drafts) return data.drafts.slice(0, 8).map(draft => `• Rascunho #${draft.id}: ${draft.text || draft.title || 'sem texto'}`).join('\n')
  if (data.accounts) return data.accounts.map(account => `• Conta #${account.id}: ${account.name || account.handle || account.platform}`).join('\n')
  if (data.tokens) return data.tokens.map(token => `• ${token.account_name || token.accountName || token.platform}: ${token.status || 'sem status'}`).join('\n')
  if (data.requirements) return Object.entries(data.requirements).map(([platform, requirement]) => `• ${platform}: mídia ${requirement.media}; ${requirement.observação}`).join('\n')
  if (data.savedTexts) return data.savedTexts.slice(0, 8).map(item => `• Texto #${item.id}: ${item.title || item.body || 'sem título'}`).join('\n')
  if (data.presets) return data.presets.slice(0, 8).map(item => `• Preset #${item.id}: ${item.name} (${item.platform})`).join('\n')
  if (data.memories) return data.memories.slice(0, 8).map(item => `• Memória #${item.id}: ${item.conteudo}`).join('\n')
  if (data.logs) return data.logs.slice(0, 8).map(item => `• ${item.platform || 'sistema'}: ${item.message}`).join('\n')
  if (data.videos) return data.videos.slice(0, 8).map(item => `• ${item.title || item.description || item.id || 'Vídeo do TikTok'}: ${item.viewCount ?? item.view_count ?? 0} visualizações`).join('\n')
  if (data.insight) return data.insight
  if (data.unread) return Object.entries(data.unread).map(([postId, count]) => `• Post #${postId}: ${count} não lido(s)`).join('\n')
  if (data.status) return Object.entries(data.status).map(([platform, status]) => `• ${platform}: ${status}`).join('\n')
  if (data.post) return `• Post #${data.post.id}: ${data.post.text || 'sem texto'} (${data.post.status || 'sem status'})`
  if (data.history) return data.history.slice(0, 8).map(item => `• ${item.platform || 'rede'}: ${item.likes ?? 0} curtidas, ${item.comments ?? 0} comentários, ${item.views ?? 0} visualizações`).join('\n')
  if (data.reply) return `Resposta: ${data.reply.text || data.reply.message || 'publicada'}`
  if (data.summary) return Object.entries(data.summary).map(([key, value]) => `• ${key}: ${value}`).join('\n')
  return ''
}

function RobotAvatar({ size = 'small' }) {
  return <span className={`aiw-avatar aiw-avatar--${size}`} aria-hidden="true">
    <img src="/logo-icon.png" alt="" />
  </span>
}

function AgentMessage({ message, index, onConfirm, onEdit, editingIndex, onChangeMessage, onContinueToPost }) {
  const summary = summarizeData(message.data)
  const image = message.data?.image
  return (
    <div className="aiw-msg" data-role={message.role}>
      {message.role === 'agent' && editingIndex === index
        ? <textarea value={message.text} onChange={event => onChangeMessage(index, event.target.value)} aria-label="Editar resposta do sistema inteligente" className="ds-textarea aiw-msg__editor" />
        : <span className="aiw-msg__text">{message.text}</span>}
      {image && <img src={image} alt="Imagem criada pelo sistema inteligente" className="aiw-msg__image" />}
      {summary && <pre className="aiw-msg__data">{summary}</pre>}
      {(message.data?.postDraft?.image || message.confirmationToken || message.role === 'agent') && <div className="aiw-msg__actions">
        {message.data?.postDraft?.image && <button type="button" onClick={() => onContinueToPost(message.data.postDraft)} className="ds-btn ds-btn--primary ds-btn--sm">Usar no Meu Post</button>}
        {message.confirmationToken && <button type="button" onClick={() => onConfirm(message.confirmationToken, index)} className="ds-btn ds-btn--primary ds-btn--sm">Confirmar ação</button>}
        {message.role === 'agent' && <button type="button" onClick={() => onEdit(editingIndex === index ? null : index)} className="aiw-link">{editingIndex === index ? 'Concluir edição' : 'Editar resposta'}</button>}
      </div>}
    </div>
  )
}

function ChatLog({ messages, editingIndex, onEdit, onChangeMessage, sending, processingMessage, error, onConfirm, messagesRef, onContinueToPost }) {
  return <div ref={messagesRef} className="aiw-log">
    {messages.length === 0 && <div className="aiw-hello"><RobotAvatar size="large" /><p>Peça uma ideia, uma imagem ou consulte seus posts. Revise antes de publicar.</p></div>}
    {messages.map((message, index) => <AgentMessage key={index} message={message} index={index} editingIndex={editingIndex} onEdit={onEdit} onChangeMessage={onChangeMessage} onConfirm={onConfirm} onContinueToPost={onContinueToPost} />)}
    {sending && <div className="aiw-msg aiw-msg--wait" aria-live="polite"><span className="ds-spinner" aria-hidden="true" />{processingMessage}</div>}
    {error && <p className="aiw-error" role="alert"><Icon name="alertCircle" size={16} />{error}</p>}
  </div>
}

function ChatCompose({ input, onInputChange, onSend, sending, inputRef }) {
  return <form onSubmit={onSend} className="aiw-compose">
    <input ref={inputRef} value={input} onChange={onInputChange} placeholder="Digite o que você precisa..." aria-label="Mensagem para o Assistente inteligente" className="ds-input aiw-compose__input" enterKeyHint="send" />
    <button type="submit" disabled={sending || !input.trim()} className="ds-btn ds-btn--primary aiw-compose__send"><Icon name="send" size={16} />Enviar</button>
  </form>
}

// Desktop: painel flutuante ao lado do botão, sem bloquear a página.
function AiWidgetPanel({ panelId, onClose, inputRef, ...chat }) {
  return (
    <section id={panelId} role="dialog" aria-label="Assistente inteligente" className="aiw-panel">
      <header className="aiw-head">
        <div className="aiw-head__id"><RobotAvatar /><div><p className="aiw-head__title">Assistente inteligente</p><p className="aiw-head__sub">Ajuda para agilizar sua rotina</p></div></div>
        <button type="button" aria-label="Fechar assistente" onClick={onClose} className="ds-btn ds-btn--quiet ds-btn--icon ds-btn--sm"><Icon name="close" size={18} /></button>
      </header>
      <ChatLog {...chat} />
      <ChatCompose {...chat} inputRef={inputRef} />
    </section>
  )
}

// Elementos em que a pessoa digita: com o teclado virtual aberto, o botão
// flutuante sai de cena para não ficar por cima do campo ou do botão de enviar.
const TYPING_FIELD = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="file"]):not([type="range"]):not([type="color"]), textarea, select, [contenteditable="true"]'

// O botão flutuante não pode esconder o botão principal do fim da página: ao
// rolar para baixo ele recolhe, ao subir ele volta. No celular e no tablet
// também recolhe enquanto um campo da página tem foco.
function useFabAway(active, rootRef) {
  const [scrolledAway, setScrolledAway] = useState(false)
  const [typing, setTyping] = useState(false)

  useEffect(() => {
    if (!active) { setScrolledAway(false); return undefined }
    let lastY = window.scrollY
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const y = window.scrollY
        if (Math.abs(y - lastY) < 8) return
        const ownFocus = rootRef.current?.contains(document.activeElement)
        setScrolledAway(y > lastY && y > 120 && !ownFocus)
        lastY = y
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); if (frame) window.cancelAnimationFrame(frame) }
  }, [active, rootRef])

  useEffect(() => {
    const isPageField = element => Boolean(element?.matches?.(TYPING_FIELD)) && !rootRef.current?.contains(element) && !element.closest('.aiw-sheet')
    const onFocusIn = event => setTyping(isPageField(event.target) && mediaMatches(MEDIA.compact))
    const onFocusOut = event => { if (!isPageField(event.relatedTarget)) setTyping(false) }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => { document.removeEventListener('focusin', onFocusIn); document.removeEventListener('focusout', onFocusOut) }
  }, [rootRef])

  return active && (scrolledAway || typing)
}

export function AiAssistantWidget({ hidden = false, currentPage = null, onNavigate }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [processingMessage, setProcessingMessage] = useState('')
  const [error, setError] = useState('')
  const [editingIndex, setEditingIndex] = useState(null)
  const [pendingPlan, setPendingPlan] = useState(null)
  const messagesRef = useRef(null)
  const rootRef = useRef(null)
  const toggleRef = useRef(null)
  const inputRef = useRef(null)
  const phone = useIsPhone()
  const away = useFabAway(!open && !hidden, rootRef)
  const panelId = 'aiw-panel'

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight
  }, [messages, sending, open])

  // Desktop: o painel não é modal; ao abrir, o foco vai para o campo; ao fechar
  // (Escape ou X), volta para o botão. No celular quem cuida disso é o Sheet.
  function close() {
    setOpen(false)
    if (!phone) toggleRef.current?.focus()
  }

  useEffect(() => {
    if (!open || phone) return undefined
    inputRef.current?.focus()
    function onKeyDown(event) { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phone])

  if (hidden) return null

  async function send(event) {
    event.preventDefault()
    const text = input.trim()
    if (!text || sending) return
    setInput(''); setError(''); setProcessingMessage(processingMessageFor(text)); setMessages(value => [...value, { role: 'user', text }]); persistMessage('fab', 'user', text); setSending(true)
    try {
      const history = messages.slice(-6).map(({ role, text: content, plan, data }) => ({
        role,
        content,
        action: plan?.actionId || null,
        contexto: summarizeData(data).slice(0, 1500),
      }))
      const data = await apiFetch('/api/ai/agent', { method: 'POST', timeoutMs: AI_REQUEST_TIMEOUT_MS, body: JSON.stringify({ message: text, currentPage, history, pendingPlan }) }) || {}
      const reply = data.message || 'Solicitação processada.'
      setMessages(value => [...value, { role: 'agent', text: reply, data: data.data, plan: data.plan || null, confirmationToken: data.confirmationToken || null }])
      setPendingPlan(data.requiresInput ? data.plan : null)
      persistMessage('fab', 'agent', reply)
      followNavigation(data.navigation)
    } catch (caught) { setError(friendlyAgentError(caught)) } finally { setSending(false); setProcessingMessage('') }
  }

  async function confirm(token, index) {
    if (sending) return
    setError(''); setProcessingMessage('Estou executando a ação confirmada. Aguarde só mais um momento...'); setSending(true)
    try {
      const data = await apiFetch('/api/ai/agent', { method: 'POST', timeoutMs: AI_REQUEST_TIMEOUT_MS, body: JSON.stringify({ approvalToken: token }) }) || {}
      const reply = data.message || 'Ação concluída.'
      setMessages(value => value.map((message, messageIndex) => messageIndex === index ? { ...message, text: `${message.text}\n${reply}`, data: data.data, confirmationToken: null } : message))
      setPendingPlan(null)
      persistMessage('fab', 'agent', reply)
      followNavigation(data.navigation)
    } catch (caught) { setError(friendlyAgentError(caught)) } finally { setSending(false); setProcessingMessage('') }
  }

  /*
   * O servidor sugere uma página em quase toda resposta, inclusive 'ai' na conversa comum: seguir essa
   * levava a pessoa ao Assistente a cada mensagem. O widget já é o assistente, então 'ai' fica onde está;
   * 'tokens' (página antiga) vira Contas. No celular a folha fecha para a página nova aparecer.
   */
  function followNavigation(target) {
    if (!target || !onNavigate || target === 'ai') return
    onNavigate(target === 'tokens' ? 'integracoes' : target)
    if (phone) setOpen(false)
  }

  function continueToPost(postDraft) {
    storeAiPostDraft(postDraft)
    onNavigate?.('agendador')
    if (phone) setOpen(false)
  }

  const chat = {
    messages, editingIndex, onEdit: setEditingIndex, sending, processingMessage, error, input, messagesRef,
    onChangeMessage: (index, text) => setMessages(value => value.map((message, messageIndex) => messageIndex === index ? { ...message, text } : message)),
    onInputChange: event => setInput(event.target.value), onSend: send, onConfirm: confirm, onContinueToPost: continueToPost,
  }

  return <div ref={rootRef} className="ai-assistant-widget aiw" data-ds-root data-away={away || undefined}>
    {open && !phone && <AiWidgetPanel panelId={panelId} onClose={close} inputRef={inputRef} {...chat} />}
    {/* Celular: folha inferior do DS (acima da barra inferior, foco preso, Escape, rolagem só dentro do chat). */}
    {phone && <Sheet open={open} onClose={close} title="Assistente inteligente" description="Ajuda para agilizar sua rotina" closeLabel="Fechar assistente" className="aiw-sheet" footer={<ChatCompose {...chat} inputRef={inputRef} />}>
      <ChatLog {...chat} />
    </Sheet>}
    <button ref={toggleRef} type="button" onClick={() => (open ? close() : setOpen(true))} aria-label={open ? 'Fechar assistente inteligente' : 'Abrir assistente inteligente'} aria-expanded={open} aria-controls={open && !phone ? panelId : undefined} className="aiw-toggle" data-open={open || undefined}>{open ? <Icon name="close" size={22} /> : <RobotAvatar size="large" />}</button>
  </div>
}
