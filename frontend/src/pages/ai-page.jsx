import { useEffect, useRef, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { PublicationStatusModal } from '../components/ui/publication-status-modal.jsx'
import { Sheet } from '../components/ui/floating.jsx'
import { useToast } from '../components/ui/toast.jsx'
import { Select } from '../components/ui/select.jsx'
import { useConfirm } from '../components/ui/confirm-dialog.jsx'
import { Icon, NetworkGlyph } from '../components/ui/icon.jsx'
import { findPublicationResult, latestPublicationEventId, processingPublicationMessage, publicationResultMessage } from '../lib/publicationEvents.js'

// O backend espera até 45s pelo provedor. O OpenRouter pode precisar de alguns
// segundos adicionais para devolver a resposta ou o fallback do servidor.
const AI_GENERATION_TIMEOUT_MS = 60_000
const INSTRUCTION_MAX_LENGTH = 4000
const AI_ACTIVITY_LABELS = {
  generate: 'Conteúdo criado pelo sistema',
  'analyze-media': 'Descrição de mídia gerada',
  'image-generate': 'Imagem criada pelo sistema',
  'chat-message': 'Conversa com o sistema inteligente',
  schedule: 'Agendamento processado',
  'publish-now': 'Publicação processada',
}
// O servidor grava sucesso / erro / fallback; versões antigas usavam success / ok.
const AI_ACTIVITY_STATUS = {
  sucesso: { status: 'ok', label: 'Concluído', icon: 'checkCircle' },
  success: { status: 'ok', label: 'Concluído', icon: 'checkCircle' },
  ok: { status: 'ok', label: 'Concluído', icon: 'checkCircle' },
  fallback: { status: 'warning', label: 'Resposta alternativa', icon: 'info' },
  erro: { status: 'failed', label: 'Falhou', icon: 'alertCircle' },
  error: { status: 'failed', label: 'Falhou', icon: 'alertCircle' },
}
const PUBLISH_PLATFORMS = [
  { id: 'instagram', label: 'Instagram', hint: 'Imagem obrigatória' },
  { id: 'facebook', label: 'Facebook', hint: 'Imagem opcional' },
  { id: 'tiktok', label: 'TikTok', hint: 'Imagem ou vídeo' },
  { id: 'youtube', label: 'YouTube', hint: 'Exige vídeo', videoOnly: true },
]
const PUBLISH_STATUS = {
  processing: { status: 'processing', label: 'Aguardando confirmação da rede' },
  partial: { status: 'partial', label: 'Publicada em parte' },
  error: { status: 'failed', label: 'Não publicada' },
  published: { status: 'published', label: 'Publicada' },
}
const ANALYTICS_PERIODS = [7, 30, 90]
const PAGE_TABS = [
  { key: 'criar', label: 'Criar', icon: 'sparkle' },
  { key: 'desempenho', label: 'Desempenho', icon: 'chart' },
  { key: 'atividade', label: 'Atividade', icon: 'activity' },
]

function formatAiActivity(log) {
  const action = String(log.acao || '')
  const title = AI_ACTIVITY_LABELS[action] || (action.startsWith('agent:') || action === 'agent' ? 'Assistente inteligente' : 'Atividade do sistema inteligente')
  const details = String(log.detalhes || '')
    .split(' · ')
    .filter(part => !/^(fallback|tentados|chave do servidor|chave do usuário)\b/i.test(part.trim()))
    .join(' · ')
    .replace(/\bopenrouter(?:[-_][\w-]+)?\b/gi, 'Sistema inteligente')
    .trim()

  return { title, details: details || 'Processamento concluído' }
}

function activityStatus(value) {
  const key = String(value || '').toLowerCase()
  return AI_ACTIVITY_STATUS[key] || { status: 'muted', label: value ? String(value) : 'Sem status', icon: 'info' }
}

function formatActivityDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

// Mensagem do backend quando existe; falha de rede ou resposta fora do formato
// vira o texto da ação. Erros criados pela própria tela já trazem texto pronto.
function messageOf(error, fallback) {
  return error instanceof ApiError ? error.message : fallback
}

// fetch direto (imagem gerada, upload assinado): a falha de rede chega como
// TypeError em inglês ("Failed to fetch"); aqui vira a frase da etapa.
async function fetchOrExplain(url, options, message) {
  try { return await fetch(url, options) }
  catch { throw new Error(message) }
}

const SLIDE_COUNTS = [2, 3, 4, 5, 6, 7, 8].map(count => ({ value: count, label: `${count} slides` }))
const TIKTOK_PRIVACY = [
  { value: 'PUBLIC_TO_EVERYONE', label: 'Público' },
  { value: 'MUTUAL_FOLLOW_FRIENDS', label: 'Amigos' },
  { value: 'FOLLOWER_OF_CREATOR', label: 'Seguidores do criador' },
  { value: 'SELF_ONLY', label: 'Somente eu' },
]

export function AiPage() {
  const [tab, setTab] = useState('criar')
  const [instruction, setInstruction] = useState('')
  const [instructionError, setInstructionError] = useState('')
  const [visualFormat, setVisualFormat] = useState('single')
  const [carouselCount, setCarouselCount] = useState(5)
  const [posts, setPosts] = useState([])
  const [error, setError] = useState('')
  const [errorSource, setErrorSource] = useState('generate')
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [editingIndex, setEditingIndex] = useState(null)
  const [activityLogs, setActivityLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(true)
  const [logsError, setLogsError] = useState('')
  const [analyticsInsights, setAnalyticsInsights] = useState(null)
  const [analyticsDays, setAnalyticsDays] = useState(30)
  const [analyzedDays, setAnalyzedDays] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState('')
  const [imageLoadingIndex, setImageLoadingIndex] = useState(null)
  const [imageLoadingProgress, setImageLoadingProgress] = useState(null)
  const [imageQuota, setImageQuota] = useState(null)
  const [publishingIndex, setPublishingIndex] = useState(null)
  const [connectedAccounts, setConnectedAccounts] = useState([])
  const [accountsLoaded, setAccountsLoaded] = useState(false)
  const [accountsLoadError, setAccountsLoadError] = useState(false)
  const [publishModalIndex, setPublishModalIndex] = useState(null)
  const [publishPlatform, setPublishPlatform] = useState('instagram')
  const [tiktokPrivacyLevel, setTiktokPrivacyLevel] = useState('PUBLIC_TO_EVERYONE')
  const [publicationDialog, setPublicationDialog] = useState(null)
  const [publicationProgress, setPublicationProgress] = useState('')
  const [clearingLogs, setClearingLogs] = useState(false)
  const publicationPollTimer = useRef(null)
  const mountedRef = useRef(true)
  const notify = useToast()
  const { confirm, confirmDialog } = useConfirm()

  function loadActivityLogs() {
    setLogsLoading(true); setLogsError('')
    return apiFetch('/api/ai/activity-log?limit=20')
      .then(data => setActivityLogs(data?.logs || []))
      .catch(e => setLogsError(messageOf(e, 'Não foi possível carregar a atividade do assistente.')))
      .finally(() => setLogsLoading(false))
  }

  useEffect(() => { loadActivityLogs() }, [])

  useEffect(() => {
    apiFetch('/api/accounts?ativo=true')
      .then(data => setConnectedAccounts(Array.isArray(data?.data) ? data.data : []))
      .catch(() => setAccountsLoadError(true))
      .finally(() => setAccountsLoaded(true))
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearTimeout(publicationPollTimer.current)
    }
  }, [])

  // Novas ideias substituem a lista, e imagem e publicação em andamento apontam para a posição da
  // ideia: gerar no meio disso gravaria o resultado na ideia errada. Espera terminar.
  const ideaWorkBusy = imageLoadingIndex !== null || publishingIndex !== null

  async function generate(event) {
    event.preventDefault()
    if (ideaWorkBusy) return
    if (!instruction.trim()) {
      setInstructionError('Descreva o que você quer publicar para receber as ideias.')
      return
    }
    setInstructionError(''); setLoading(true); setError(''); setErrorSource('generate')
    try {
      const data = await apiFetch('/api/ai/generate', { method: 'POST', timeoutMs: AI_GENERATION_TIMEOUT_MS, body: JSON.stringify({ instrucao: instruction, plataformas: ['instagram'], quantidade: 3, tom: 'profissional' }) })
      const requestedFormat = requestedVisualFormat()
      setPosts((data?.posts || []).map(post => normalizePost(post, requestedFormat)))
      setEditingIndex(null)
      // O compositor fica em cima e as ideias chegam embaixo, fora da tela no
      // celular: leva a pessoa (e o foco) até elas.
      window.requestAnimationFrame(() => {
        const title = document.getElementById('as-results-title')
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        title?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
        title?.focus({ preventScroll: true })
      })
    } catch (e) { setError(messageOf(e, 'Não foi possível gerar as ideias agora. Tente de novo.')) } finally { setLoading(false) }
  }

  // Gera mais ideias sobre o mesmo assunto (mesma instrução e modelo já
  // usados) e acrescenta às sugestões já na tela, em vez de substituí-las —
  // permite ao usuário pedir várias rodadas de ideias sem perder as
  // anteriores nem reescrever a instrução.
  async function generateMore() {
    setLoadingMore(true); setError(''); setErrorSource('more')
    try {
      const data = await apiFetch('/api/ai/generate', { method: 'POST', timeoutMs: AI_GENERATION_TIMEOUT_MS, body: JSON.stringify({ instrucao: instruction, plataformas: ['instagram'], quantidade: 3, tom: 'profissional' }) })
      const novos = (data?.posts || []).map(post => normalizePost(post, requestedVisualFormat()))
      setPosts(current => [...current, ...novos])
    } catch (e) { setError(messageOf(e, 'Não foi possível gerar mais ideias agora. Tente de novo.')) } finally { setLoadingMore(false) }
  }

  function requestedVisualFormat() {
    const instructionRequestsCarousel = /\b(carrossel|carousel|slides?|sequência de imagens)\b/i.test(instruction)
    return visualFormat === 'carousel' || instructionRequestsCarousel ? 'carousel' : 'single'
  }

  function normalizePost(post, format = visualFormat) {
    return {
      ...post,
      // A resposta antiga da API podia não trazer a lista de redes. Mantenha
      // sempre um valor seguro para a publicação gerada pelo sistema inteligente.
      plataformas: Array.isArray(post.plataformas) && post.plataformas.length ? post.plataformas : ['instagram'],
      text: post.texto || post.text || post.caption || '',
      visualFormat: format,
      carouselCount: format === 'carousel' ? carouselCount : 5,
      imageUrl: null,
      carouselImages: [],
      mediaPath: null,
      mediaItems: null,
      imageError: '',
      publishStatus: '',
      publishPlatform: null,
    }
  }

  function updatePost(index, patch) {
    setPosts(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  }

  function imageDescription(post) {
    return `Crie uma imagem original, profissional e visualmente atraente para acompanhar esta publicação. Escolha a composição mais adequada ao tema e ao ângulo do conteúdo, em formato quadrado ou vertical para feed. Não inclua textos, letras, logotipos, marcas d'água ou interfaces na imagem. A referência abaixo serve apenas para entender a ideia: não copie a legenda nem transforme a instrução em texto dentro da arte.\n\nLegenda da publicação:\n${post.text}\n\nÂngulo da publicação:\n${post.angulo || 'conteúdo educativo e relevante'}`
  }

  function carouselSlideDescription(post, slideIndex, total) {
    const slideRole = slideIndex === 0
      ? 'capa visual, com uma composição forte e simples'
      : slideIndex === total - 1
        ? 'encerramento visual, transmitindo conclusão e convite à ação sem escrever texto'
        : `desenvolvimento visual do ponto ${slideIndex} da sequência`
    return `Crie o slide ${slideIndex + 1} de ${total} de um carrossel profissional para Instagram, em formato vertical 4:5. Todos os slides precisam parecer parte da mesma série: mantenha a mesma paleta de cores, iluminação, estilo fotográfico ou ilustrado e elementos visuais coerentes. Este slide deve ser uma ${slideRole}. Não inclua textos, letras, logotipos, marcas d'água ou interfaces na imagem. A referência abaixo serve apenas para entender a ideia: não copie a legenda nem transforme a instrução em texto dentro da arte.

Legenda da publicação:
${post.text}

Ângulo da publicação:
${post.angulo || 'conteúdo educativo e relevante'}`
  }

  async function requestImage(post, description = imageDescription(post)) {
    const data = await apiFetch('/api/ai/image/generate', {
      method: 'POST',
      timeoutMs: 60_000,
      body: JSON.stringify({ modelo: 'auto', descricao: description }),
    })
    if (!data?.image) throw new Error('O gerador não retornou uma imagem válida.')
    // O servidor devolve o saldo do mês a cada imagem; slides em paralelo podem
    // chegar fora de ordem, então vale o retorno com mais imagens usadas.
    if (data.imageQuota && Number.isFinite(Number(data.imageQuota.limit))) {
      setImageQuota(current => current && Number(current.used) > Number(data.imageQuota.used) ? current : data.imageQuota)
    }
    return { imageUrl: data.image, imageModel: data.modelo || 'auto' }
  }

  async function requestCarousel(post, total, onProgress) {
    let completed = 0
    const images = await Promise.all(Array.from({ length: total }, (_, index) => requestImage(post, carouselSlideDescription(post, index, total)).then(result => {
      completed += 1
      onProgress?.(completed)
      return result
    })))
    return {
      carouselImages: images.map(item => item.imageUrl),
      imageModel: images[0]?.imageModel || 'auto',
    }
  }

  async function generateImage(index) {
    const post = posts[index]
    if (!post) return
    const isCarousel = post.visualFormat === 'carousel'
    const total = isCarousel ? Math.min(Math.max(Number(post.carouselCount) || 5, 2), 8) : 1
    setImageLoadingIndex(index)
    setImageLoadingProgress(isCarousel ? { current: 0, total } : null)
    updatePost(index, { imageError: '', publishStatus: '' })
    try {
      const generated = isCarousel
        ? await requestCarousel(post, total, current => setImageLoadingProgress({ current, total }))
        : await requestImage(post)
      updatePost(index, { ...generated, imageUrl: isCarousel ? null : generated.imageUrl, mediaPath: null, mediaItems: null, imageError: '' })
      notify(isCarousel ? `Carrossel com ${total} imagens gerado para a ideia selecionada.` : 'Imagem gerada para a ideia selecionada.')
    } catch (error) {
      updatePost(index, { imageError: error.message || 'Não foi possível gerar a imagem.' })
    } finally {
      setImageLoadingIndex(null)
      setImageLoadingProgress(null)
    }
  }

  async function uploadGeneratedMedia(post) {
    const sourceImages = post.carouselImages?.length ? post.carouselImages : (post.imageUrl ? [post.imageUrl] : [])
    if (!sourceImages.length) throw new Error('Gere uma imagem antes de publicar.')
    if (post.mediaItems?.length) return { mediaPath: post.mediaPath || post.mediaItems[0].path, mediaItems: post.mediaItems, mediaSize: post.mediaItems[0].size }
    const uploadedItems = await Promise.all(sourceImages.map(async (source, index) => {
      const imageBlob = await fetchOrExplain(source, undefined, 'Não foi possível preparar uma imagem gerada.').then(response => {
        if (!response.ok) throw new Error('Não foi possível preparar uma imagem gerada.')
        return response.blob()
      })
      const mimeType = imageBlob.type || 'image/png'
      const signed = await apiFetch('/api/posts/upload-url', {
        method: 'POST',
        body: JSON.stringify({ filename: `ia-${Date.now()}-${index + 1}.png`, mimetype: mimeType }),
      })
      const uploadResponse = await fetchOrExplain(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: imageBlob }, 'Não foi possível enviar uma imagem para publicação. Verifique sua conexão e tente de novo.')
      if (!uploadResponse.ok) throw new Error('Não foi possível enviar uma imagem para publicação.')
      const uploaded = await uploadResponse.json().catch(() => null)
      const mediaUrl = signed.mediaUrl || uploaded?.url
      if (!mediaUrl) throw new Error('O upload de uma imagem não retornou uma URL válida.')
      return { path: mediaUrl, type: 'image', mimetype: mimeType, size: imageBlob.size }
    }))
    return { mediaPath: uploadedItems[0].path, mediaItems: uploadedItems.length > 1 ? uploadedItems : null, mediaSize: uploadedItems[0].size }
  }

  function accountsForPlatform(platform) {
    return connectedAccounts.filter(account => account.platform === platform && account.ativo !== false)
  }

  function accountLabel(account) {
    return account.handle || account.name || account.accountName || `Conta ${account.id}`
  }

  function isPublishPlatformAvailable(platform, targetPost = null) {
    const option = PUBLISH_PLATFORMS.find(item => item.id === platform)
    if (!option || option.videoOnly) return false
    if (targetPost?.visualFormat === 'carousel' && !['instagram', 'tiktok'].includes(platform)) return false
    if (!accountsLoaded || accountsLoadError) return true
    return accountsForPlatform(platform).length > 0
  }

  // Motivo curto, com a mesma regra de isPublishPlatformAvailable, para a
  // pessoa entender por que uma rede não pode ser escolhida.
  function platformNote(option, targetPost) {
    if (option.videoOnly) return 'Disponível no Meu Post com vídeo'
    if (targetPost?.visualFormat === 'carousel' && !['instagram', 'tiktok'].includes(option.id)) return 'Carrossel só no Instagram ou TikTok'
    if (!accountsLoaded) return 'Verificando contas conectadas…'
    if (accountsLoadError) return option.hint
    const count = accountsForPlatform(option.id).length
    if (!count) return 'Nenhuma conta conectada'
    return `${option.hint} · ${count} ${count === 1 ? 'conta' : 'contas'}`
  }

  function openPublishPlatformModal(index) {
    const post = posts[index]
    if (!post) return
    const currentPlatform = post.publishPlatform || post.plataformas?.[0]
    const firstAvailable = PUBLISH_PLATFORMS.find(option => isPublishPlatformAvailable(option.id, post))
    setPublishPlatform(isPublishPlatformAvailable(currentPlatform, post) ? currentPlatform : firstAvailable?.id || 'instagram')
    setPublishModalIndex(index)
  }

  function closePublishPlatformModal() {
    if (publishingIndex === null) setPublishModalIndex(null)
  }

  function publicationStatusFromResponse(data, postId, platforms) {
    const publishedPost = data.posts?.[0]
    return publicationResultMessage({
      event_name: 'post_published',
      payload: {
        id: postId,
        status: publishedPost?.status,
        platforms: publishedPost?.platforms || platforms,
        results: publishedPost?.results || [],
      },
    })
  }

  function finishAiPublication(index, result) {
    const publishStatus = result.type === 'success' ? 'published' : result.type === 'warning' ? 'partial' : 'error'
    updatePost(index, { publishStatus, imageError: result.type === 'success' ? '' : result.message })
    setPublicationProgress('')
    setPublicationDialog(current => current ? { ...current, status: result } : current)
    notify(result.message, result.type === 'success' ? 'success' : 'error')
  }

  function monitorAiPublication(index, postId, initialCursor, platforms) {
    let cursor = initialCursor
    const poll = async () => {
      try {
        const { events = [] } = await apiFetch(`/api/logs/events/since/${cursor}`)
        if (!mountedRef.current) return
        if (events.length) cursor = Math.max(cursor, ...events.map(event => Number(event.id) || 0))
        const result = findPublicationResult(events, postId)
        if (result) {
          finishAiPublication(index, result)
          return
        }
      } catch {
        // Uma falha pontual não encerra o acompanhamento da publicação.
      }
      // Uma consulta ainda em andamento ao sair da página não agenda outra.
      if (mountedRef.current) publicationPollTimer.current = setTimeout(poll, 4000)
    }
    const labels = platforms.map(platform => PUBLISH_PLATFORMS.find(option => option.id === platform)?.label || platform)
    setPublicationProgress(`Aguardando confirmação de ${labels.join(' e ')}...`)
    poll()
  }

  function confirmPublishPlatform() {
    if (publishModalIndex === null || !isPublishPlatformAvailable(publishPlatform, posts[publishModalIndex]) || (publishPlatform === 'tiktok' && !tiktokPrivacyLevel)) return
    const index = publishModalIndex
    setPublishModalIndex(null)
    publishWithGeneratedImage(index, publishPlatform)
  }

  async function publishWithGeneratedImage(index, selectedPlatform = null) {
    const post = posts[index]
    if (!post) return
    setPublishingIndex(index)
    updatePost(index, { imageError: '', publishStatus: '' })
    try {
      const platform = selectedPlatform || post.publishPlatform || post.plataformas?.[0] || 'instagram'
      const platforms = [platform]
      if (platforms.includes('youtube')) throw new Error('O YouTube exige vídeo. Escolha uma ideia para Instagram, Facebook ou TikTok.')
      const isCarousel = post.visualFormat === 'carousel' && ['instagram', 'tiktok'].includes(platform)
      if (post.visualFormat === 'carousel' && !['instagram', 'tiktok'].includes(platform)) throw new Error('O carrossel pode ser publicado somente no Instagram ou TikTok.')
      updatePost(index, { publishPlatform: platform, plataformas: platforms })
      setPublicationDialog({ index, platforms, status: { type: 'processing', message: processingPublicationMessage(platforms) } })
      setPublicationProgress('Preparando sua publicação...')
      let postWithImage = post
      const hasGeneratedMedia = isCarousel ? postWithImage.carouselImages?.length > 1 : !!postWithImage.imageUrl
      if (!hasGeneratedMedia) {
        const total = Math.min(Math.max(Number(postWithImage.carouselCount) || 5, 2), 8)
        setPublicationProgress(isCarousel ? `Gerando carrossel (0/${total})...` : 'Gerando imagem...')
        const generated = isCarousel
          ? await requestCarousel(postWithImage, total, current => {
              setImageLoadingProgress({ current, total })
              setPublicationProgress(`Gerando carrossel (${current}/${total})...`)
            })
          : await requestImage(postWithImage)
        postWithImage = { ...postWithImage, ...generated, imageUrl: isCarousel ? null : generated.imageUrl }
        updatePost(index, { ...generated, imageUrl: isCarousel ? null : generated.imageUrl })
      }
      setPublicationProgress('Enviando mídia para publicação...')
      const uploadedMedia = await uploadGeneratedMedia(postWithImage)
      updatePost(index, { ...uploadedMedia, imageUrl: postWithImage.imageUrl, carouselImages: postWithImage.carouselImages || [], imageModel: postWithImage.imageModel })
      setPublicationProgress('Enviando publicação para a rede...')
      const eventCursor = await latestPublicationEventId(apiFetch)
      const publishRequest = {
        publishNow: true,
        posts: [{ texto: post.text, titulo: post.titulo || '', plataformas: platforms, horario: new Date().toISOString(), mediaPath: uploadedMedia.mediaPath, mediaItems: uploadedMedia.mediaItems, mediaSize: uploadedMedia.mediaSize, mediaType: 'image', ...(platform === 'tiktok' ? { tiktokPrivacyLevel } : {}) }],
      }
      let data
      try {
        data = await apiFetch('/api/ai/schedule', { method: 'POST', timeoutMs: 60_000, body: JSON.stringify(publishRequest) })
      } catch (confirmationError) {
        const token = confirmationError.body?.confirmationToken
        if (confirmationError.status !== 409 || !confirmationError.body?.requiresConfirmation || !token) throw confirmationError
        const approved = await confirm({
          title: 'Publicar esta imagem na rede selecionada?',
          description: 'A publicação sai agora e não pode ser desfeita pelo Meu Ecoo.',
          confirmLabel: 'Publicar agora',
          tone: 'warning',
          icon: 'send',
        })
        if (!approved) throw new Error('Publicação cancelada.', { cause: confirmationError })
        data = await apiFetch('/api/ai/schedule', {
          method: 'POST',
          timeoutMs: 60_000,
          body: JSON.stringify({ ...publishRequest, approvalToken: token }),
        })
      }
      const createdPost = data.posts?.[0]
      if (!createdPost?.id) throw new Error('A publicação foi enviada, mas não foi possível acompanhar sua confirmação. Verifique a atividade do Assistente inteligente.')
      const result = publicationStatusFromResponse(data, createdPost.id, platforms)
      if (result) {
        finishAiPublication(index, result)
      } else {
        updatePost(index, { publishStatus: 'processing' })
        monitorAiPublication(index, createdPost.id, eventCursor, platforms)
      }
    } catch (error) {
      const message = error.message || 'Não foi possível concluir a publicação. Tente novamente.'
      updatePost(index, { imageError: message, publishStatus: 'error' })
      setPublicationProgress('')
      setPublicationDialog(current => current ? { ...current, status: { type: 'error', message } } : current)
      notify(message, 'error')
    } finally {
      setPublishingIndex(null)
    }
  }

  async function loadAnalyticsInsights() {
    const days = analyticsDays
    setAnalyticsLoading(true); setAnalyticsError('')
    try {
      const data = await apiFetch(`/api/ai/analytics-insights?days=${days}`)
      setAnalyticsInsights(data.insights || null)
      setAnalyzedDays(days)
    } catch (e) { setAnalyticsError(messageOf(e, 'Não foi possível analisar os resultados agora.')) } finally { setAnalyticsLoading(false) }
  }

  async function clearActivityLogs() {
    if (!activityLogs.length || clearingLogs) return
    const ok = await confirm({
      title: 'Limpar o histórico de atividade do Assistente inteligente?',
      description: 'Os registros desta lista serão apagados.',
      confirmLabel: 'Limpar histórico',
    })
    if (!ok) return
    setClearingLogs(true)
    try {
      await apiFetch('/api/ai/activity-log', { method: 'DELETE' })
      setActivityLogs([])
      notify('Histórico de atividade limpo.')
    } catch (e) {
      notify(messageOf(e, 'Não foi possível limpar o histórico.'), 'error')
    } finally { setClearingLogs(false) }
  }

  function formatMetric(value) {
    return new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0)
  }

  function formatRate(value) {
    return `${Number(value || 0).toFixed(2).replace('.', ',')}%`
  }

  function imageButtonLabel(post, index) {
    if (imageLoadingIndex === index) return post.visualFormat === 'carousel' ? `Gerando carrossel ${imageLoadingProgress?.current || 0}/${imageLoadingProgress?.total || post.carouselCount}…` : 'Gerando imagem…'
    if (post.visualFormat === 'carousel') return post.carouselImages?.length ? 'Gerar outro carrossel' : 'Gerar carrossel'
    return post.imageUrl ? 'Gerar outra imagem' : 'Gerar imagem'
  }

  function confirmLabel(post) {
    if (post?.visualFormat === 'carousel') return post.carouselImages?.length ? 'Publicar carrossel' : 'Gerar carrossel e publicar'
    return post?.imageUrl ? 'Publicar agora' : 'Gerar imagem e publicar'
  }

  function publishButtonLabel(post, index) {
    if (publishingIndex === index) return post.visualFormat === 'carousel' ? 'Gerando e publicando carrossel…' : post.imageUrl ? 'Publicando…' : 'Gerando e publicando…'
    if (post.publishStatus === 'published') return 'Publicado'
    return confirmLabel(post)
  }

  function onTabKeyDown(event) {
    const keys = PAGE_TABS.map(item => item.key)
    const index = keys.indexOf(tab)
    const next = event.key === 'ArrowRight' ? keys[(index + 1) % keys.length]
      : event.key === 'ArrowLeft' ? keys[(index - 1 + keys.length) % keys.length]
        : event.key === 'Home' ? keys[0]
          : event.key === 'End' ? keys[keys.length - 1]
            : null
    if (!next) return
    event.preventDefault()
    setTab(next)
    document.getElementById(`as-tab-${next}`)?.focus()
  }

  const busyIndex = imageLoadingIndex ?? publishingIndex
  const busyMessage = imageLoadingIndex !== null
    ? `Gerando ${posts[imageLoadingIndex]?.visualFormat === 'carousel' ? 'o carrossel' : 'a imagem'} da ideia ${String(imageLoadingIndex + 1).padStart(2, '0')}. As outras ideias ficam disponíveis quando terminar.`
    : publishingIndex !== null
      ? `Publicando a ideia ${String(publishingIndex + 1).padStart(2, '0')}. As outras ideias ficam disponíveis quando terminar.`
      : ''
  const instructionLevel = instruction.length > INSTRUCTION_MAX_LENGTH ? 'over' : instruction.length > INSTRUCTION_MAX_LENGTH * 0.9 ? 'near' : undefined
  const modalPost = publishModalIndex !== null ? posts[publishModalIndex] : null
  const modalAccounts = accountsForPlatform(publishPlatform)
  const quotaUsedPct = imageQuota ? Math.min(100, Math.round((Number(imageQuota.used) / Math.max(Number(imageQuota.limit), 1)) * 100)) : 0
  const insights = analyticsInsights
  const profiles = insights?.profileComparison || []
  const niches = insights?.nicheComparisons || []
  const recommendations = insights?.recommendations || []
  const comparisons = insights?.performanceAnalysis?.comparisons || []

  const errorAlert = error && <div className="ds-alert" data-tone="danger" role="alert"><Icon name="alertCircle" className="ds-alert__icon" /><p className="ds-alert__text">{error}</p></div>

  const createPanel = <div className="as-create">
    <form className="as-compose" onSubmit={generate} noValidate>
      {/* Opções curtas; a explicação do carrossel só aparece quando ele é escolhido. */}
      <fieldset className="as-look">
        <legend className="ds-label">Formato visual</legend>
        <div className="as-look__row">
          <div className="as-look__opts">
            <label className="as-choice" data-checked={visualFormat === 'single'}>
              <input type="radio" name="ai-visual-format" value="single" checked={visualFormat === 'single'} onChange={() => setVisualFormat('single')} />
              <Icon name="image" size={16} />Imagem única
            </label>
            <label className="as-choice" data-checked={visualFormat === 'carousel'}>
              <input type="radio" name="ai-visual-format" value="carousel" checked={visualFormat === 'carousel'} onChange={() => setVisualFormat('carousel')} />
              <Icon name="copy" size={16} />Carrossel de fotos
            </label>
          </div>
          {visualFormat === 'carousel' && <Select id="as-slides" className="as-slides" value={carouselCount} onChange={count => setCarouselCount(Number(count))} aria-label="Quantidade de slides" options={SLIDE_COUNTS} />}
        </div>
        <p className="ds-hint">{visualFormat === 'carousel'
          ? 'De 2 a 8 fotos, para Instagram ou TikTok. Cada slide usa uma imagem do limite do mês.'
          : 'Uma arte para acompanhar a publicação. Pedir “carrossel” na instrução também gera um carrossel.'}</p>
        {imageQuota && <div className="as-quota" aria-live="polite">
          <p><span>Imagens do mês</span><strong className="ds-num">{imageQuota.remaining} de {imageQuota.limit} disponíveis</strong></p>
          <div className="ds-progress" aria-hidden="true"><span className="ds-progress__bar" style={{ '--value': `${quotaUsedPct}%` }} /></div>
          {imageQuota.planName && <p className="ds-meta">Limite do plano {imageQuota.planName}.</p>}
        </div>}
      </fieldset>

      {/* O pedido e o botão que o transforma em ideias formam uma peça só. */}
      <div className="ds-field">
        <div className="ds-field__top">
          <label className="ds-label" htmlFor="as-instruction">O que você quer publicar?</label>
          <span className="ds-counter" data-level={instructionLevel}>{instruction.length}/{INSTRUCTION_MAX_LENGTH}</span>
        </div>
        <div className="as-prompt" data-invalid={instructionError ? 'true' : undefined}>
          <textarea
            id="as-instruction"
            className="ds-textarea as-instruction"
            value={instruction}
            onChange={event => { setInstruction(event.target.value); if (instructionError) setInstructionError('') }}
            onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }}
            placeholder="Ex.: crie 3 ideias para divulgar minha cafeteria"
            maxLength={INSTRUCTION_MAX_LENGTH}
            aria-invalid={instructionError ? 'true' : undefined}
            aria-describedby="as-instruction-help"
          />
          <div className="as-prompt__bar">
            {instructionError
              ? <p className="ds-fieldmsg" data-tone="danger" id="as-instruction-help"><Icon name="alertCircle" />{instructionError}</p>
              : <p className="ds-hint" id="as-instruction-help">{ideaWorkBusy ? 'Espere a imagem ou a publicação em andamento terminar para gerar novas ideias.' : 'Informe o tema, o público e o objetivo. Quanto mais contexto, mais úteis serão as sugestões.'}</p>}
            <button type="submit" className="ds-btn ds-btn--primary as-compose__submit" disabled={loading || loadingMore || ideaWorkBusy}>
              {loading ? <><span className="ds-spinner" aria-hidden="true" />Gerando ideias…</> : <><Icon name="sparkle" />{posts.length ? 'Gerar novas ideias' : 'Gerar ideias'}</>}
            </button>
          </div>
        </div>
        {posts.length > 0 && <p className="ds-hint">Novas ideias substituem as sugestões atuais. Para somar, use “Gerar mais ideias”.</p>}
        <details className="ds-disclosure as-limits">
          <summary>Limites de conteúdo<Icon name="chevronDown" size={16} className="ds-disclosure__chev" /></summary>
          <p className="ds-disclosure__body">O sistema não atende temas médicos, jurídicos, adultos ou análises financeiras aprofundadas.</p>
        </details>
      </div>

      {errorSource === 'generate' && errorAlert}
    </form>

    <section className="as-results" aria-labelledby="as-results-title" aria-busy={loading || undefined}>
      <header className="as-results__head">
        <div>
          <h2 className="as-results__title" id="as-results-title" tabIndex={-1}>Sugestões {posts.length > 0 && <span className="ds-badge" data-tone="outline"><span className="ds-num">{posts.length}</span> {posts.length === 1 ? 'ideia' : 'ideias'}</span>}</h2>
          <p className="ds-head__desc">{posts.length ? 'Revise o texto, gere uma imagem única ou um carrossel e publique a ideia escolhida.' : 'As ideias aparecem aqui, prontas para revisar.'}</p>
        </div>
      </header>
      <p className="ds-sr-only" role="status">{loading ? 'Gerando ideias…' : ''}</p>
      {busyMessage && <p className="as-busy" role="status"><span className="ds-spinner" aria-hidden="true" />{busyMessage}</p>}

      {loading && !posts.length
        ? <div className="as-ideas">{[1, 2, 3].map(item => <div className="as-idea" key={item}><span className="ds-skel ds-skel--text" /><span className="ds-skel ds-skel--text" /><span className="ds-skel as-skel" /></div>)}</div>
        : posts.length
          ? <ol className="as-ideas" aria-busy={loading || undefined}>
              {posts.map((post, index) => {
                const editing = editingIndex === index
                const status = PUBLISH_STATUS[post.publishStatus]
                const isCarousel = post.visualFormat === 'carousel'
                const number = String(index + 1).padStart(2, '0')
                return <li className="as-idea" key={post.id || index} data-busy={busyIndex === index || undefined}>
                  <div className="as-idea__head">
                    <span className="as-idea__num" aria-hidden="true">{number}</span>
                    <h3 className="ds-sr-only">Ideia {number}</h3>
                    <span className="ds-badge" data-tone="outline"><Icon name={isCarousel ? 'copy' : 'image'} size={14} />{isCarousel ? `Carrossel · ${post.carouselCount} slides` : 'Imagem única'}</span>
                    {status && <span className="ds-status ds-status--soft" data-status={status.status}>{status.label}</span>}
                    <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm as-idea__edit" onClick={() => setEditingIndex(editing ? null : index)} aria-pressed={editing}>
                      <Icon name={editing ? 'check' : 'compose'} size={16} />{editing ? 'Concluir edição' : 'Editar texto'}
                    </button>
                  </div>

                  {editing
                    ? <textarea className="ds-textarea as-idea__editor" value={post.text} onChange={event => setPosts(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item))} aria-label={`Editar sugestão ${index + 1}`} autoFocus />
                    : <p className="as-idea__text">{post.text}</p>}

                  {post.carouselImages?.length > 0
                    ? <figure className="as-media">
                        <div className="as-strip">{post.carouselImages.map((image, imageIndex) => <span className="as-strip__slide" key={`${image}-${imageIndex}`}><img src={image} alt={`Slide ${imageIndex + 1} do carrossel da ideia ${index + 1}`} /><span className="as-strip__num" aria-hidden="true">{imageIndex + 1}</span></span>)}</div>
                        <figcaption className="ds-meta">Carrossel com {post.carouselImages.length} slides gerado pelo sistema inteligente.</figcaption>
                      </figure>
                    : post.imageUrl && <figure className="as-media">
                        <img className="as-media__single" src={post.imageUrl} alt={`Imagem gerada para a ideia ${index + 1}`} />
                        <figcaption className="ds-meta">Imagem gerada pelo sistema inteligente.</figcaption>
                      </figure>}

                  {post.imageError && <div className="ds-alert" data-tone={post.publishStatus === 'partial' ? 'warning' : 'danger'} role="alert"><Icon name={post.publishStatus === 'partial' ? 'alertTriangle' : 'alertCircle'} className="ds-alert__icon" /><p className="ds-alert__text">{post.imageError}</p></div>}

                  <div className="as-idea__foot">
                    <button type="button" className="ds-btn ds-btn--secondary" onClick={() => generateImage(index)} disabled={imageLoadingIndex !== null || publishingIndex !== null}>
                      {imageLoadingIndex === index ? <span className="ds-spinner" aria-hidden="true" /> : <Icon name={isCarousel ? 'copy' : 'image'} />}{imageButtonLabel(post, index)}
                    </button>
                    <button type="button" className="ds-btn ds-btn--primary" onClick={() => openPublishPlatformModal(index)} disabled={publishingIndex !== null || imageLoadingIndex !== null || post.publishStatus === 'published'}>
                      {publishingIndex === index ? <span className="ds-spinner" aria-hidden="true" /> : <Icon name={post.publishStatus === 'published' ? 'checkCircle' : 'send'} />}{publishButtonLabel(post, index)}
                    </button>
                  </div>
                </li>
              })}
            </ol>
          : <div className="as-howto">
              <ol className="as-steps">
                <li><span className="as-steps__num" aria-hidden="true">1</span><div><strong>Descreva a ideia</strong><p>Tema, público e objetivo. O sistema devolve três sugestões de legenda.</p></div></li>
                <li><span className="as-steps__num" aria-hidden="true">2</span><div><strong>Revise e crie a arte</strong><p>Edite o texto e gere uma imagem única ou um carrossel para cada ideia.</p></div></li>
                <li><span className="as-steps__num" aria-hidden="true">3</span><div><strong>Publique na hora</strong><p>Escolha a rede. Você confirma antes do envio e acompanha o resultado aqui.</p></div></li>
              </ol>
            </div>}

      {posts.length > 0 && <div className="as-more">
        {errorSource === 'more' && errorAlert}
        <button type="button" className="ds-btn ds-btn--secondary" onClick={generateMore} disabled={loadingMore || loading}>
          {loadingMore ? <><span className="ds-spinner" aria-hidden="true" />Gerando mais ideias…</> : <><Icon name="plus" />Gerar mais ideias sobre este assunto</>}
        </button>
      </div>}
    </section>
  </div>

  const performancePanel = <div className="as-perf">
    <div className="ds-filterbar as-perf__bar">
      <div className="ds-field as-perf__period">
        <label className="ds-label" htmlFor="as-period">Período</label>
        <Select id="as-period" value={analyticsDays} onChange={days => setAnalyticsDays(Number(days))} sheetTitle="Período" options={ANALYTICS_PERIODS.map(days => ({ value: days, label: `Últimos ${days} dias` }))} />
      </div>
      <button type="button" className="ds-btn ds-btn--primary" onClick={loadAnalyticsInsights} disabled={analyticsLoading}>
        {analyticsLoading ? <><span className="ds-spinner" aria-hidden="true" />Analisando…</> : <><Icon name="sparkle" />{insights ? 'Analisar de novo' : 'Analisar resultados'}</>}
      </button>
      {insights && analyzedDays && analyzedDays !== analyticsDays && !analyticsLoading && <p className="ds-hint as-perf__stale"><Icon name="info" size={16} />A análise abaixo é dos últimos {analyzedDays} dias. Clique em “Analisar de novo” para ver {analyticsDays} dias.</p>}
    </div>

    {analyticsError && <div className="ds-alert" data-tone="danger" role="alert"><Icon name="alertCircle" className="ds-alert__icon" /><p className="ds-alert__text">{analyticsError}</p></div>}

    {!insights && analyticsLoading && <div aria-busy="true"><span className="ds-skel as-perf__skel" /><span className="ds-skel as-perf__skel" /></div>}

    {!insights && !analyticsLoading && !analyticsError && <div className="ds-empty ds-empty--center">
      <span className="ds-icontile ds-icontile--lg" aria-hidden="true"><Icon name="clock" /></span>
      <h3 className="ds-empty__title">Descubra o melhor momento para publicar</h3>
      <p className="ds-empty__text">Escolha o período e deixe o sistema inteligente transformar seus dados em decisões práticas: melhor horário, perfis em alta e próximas ações.</p>
    </div>}

    {insights && <div className="as-perf__body" aria-busy={analyticsLoading || undefined}>
      <div className="as-lead"><Icon name="sparkle" /><p>{insights.summary}</p></div>

      <div className="ds-stats as-perf__stats" style={{ '--cols': 2 }}>
        <div className="ds-stat">
          <p className="ds-stat__label">Melhor horário</p>
          {insights.bestTime
            ? <><p className="ds-stat__value ds-stat__value--md">{insights.bestTime.hour}h <span className="ds-stat__unit">· {insights.bestTime.period}</span></p><p className="ds-stat__caption">{insights.bestTime.day} no {insights.bestTime.platformLabel} · {formatMetric(insights.bestTime.averageInteractions)} de interação média · {insights.bestTime.postCount || 0} publicação(ões)</p></>
            : <><p className="ds-stat__value ds-stat__value--md">Dados insuficientes</p><p className="ds-stat__caption">Publique mais vezes para identificar um padrão.</p></>}
        </div>
        <div className="ds-stat">
          <p className="ds-stat__label">Período do dia</p>
          <p className="ds-stat__value ds-stat__value--md">{insights.bestPeriod || 'Ainda não identificado'}</p>
          <p className="ds-stat__caption">{insights.bestPeriod ? 'É o período com melhor sinal no histórico analisado.' : 'Ainda não há horários suficientes para comparar.'}</p>
        </div>
      </div>

      {recommendations.length > 0 && <section className="as-next" aria-labelledby="as-next-title">
        <h3 className="as-perf__title" id="as-next-title">Próximas ações</h3>
        <ol className="as-next__list">{recommendations.map((recommendation, index) => <li key={index}><span className="as-steps__num" aria-hidden="true">{index + 1}</span><p>{recommendation}</p></li>)}</ol>
      </section>}

      <div className="as-perf__cols">
        <section className="as-perf__col" aria-labelledby="as-profiles-title">
          <div className="as-perf__colhead"><h3 className="as-perf__title" id="as-profiles-title">Quem está se saindo melhor?</h3><span className="ds-meta">{profiles.length} perfil(is)</span></div>
          {profiles.length
            ? <ol className="as-rank">{profiles.map((profile, index) => <li key={profile.id}>
                <span className="as-rank__pos ds-num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <NetworkGlyph network={profile.platform} size={18} />
                <span className="as-rank__who"><strong>{profile.name}</strong><small>{profile.platformLabel} · {profile.niche}</small></span>
                <span className="as-rank__val"><strong className="ds-num">{formatRate(profile.engagementRate)}</strong><small>{formatMetric(profile.interactions)} interações</small></span>
              </li>)}</ol>
            : <p className="ds-hint">Nenhum perfil com métricas disponíveis neste período.</p>}
        </section>
        <section className="as-perf__col" aria-labelledby="as-niches-title">
          <div className="as-perf__colhead"><h3 className="as-perf__title" id="as-niches-title">Referências por nicho</h3></div>
          {niches.length
            ? <ul className="as-niches">{niches.map(item => <li key={item.niche}>
                <span className="ds-eyebrow">{item.niche}</span>
                <strong>{item.winner?.name || 'Sem vencedor'}</strong>
                <small>{item.winner ? `${formatRate(item.winner.engagementRate)} de interação · ${item.winner.platformLabel}` : 'Sem dados suficientes'}</small>
              </li>)}</ul>
            : <p className="ds-hint">Ainda não foi possível identificar um nicho com segurança.</p>}
        </section>
      </div>

      {comparisons.length > 0 && <section className="as-why" aria-labelledby="ai-performance-analysis-title">
        <div className="as-perf__colhead"><h3 className="as-perf__title" id="ai-performance-analysis-title">Por que um post foi melhor que outro?</h3><span className="ds-badge" data-tone="outline">Correlação, não causalidade</span></div>
        {comparisons.map((item, index) => <details className="ds-disclosure as-why__item" key={item.platform} open={index === 0}>
          <summary>
            <span className="as-why__net"><NetworkGlyph network={item.platform} size={18} /><strong>{item.platformLabel}</strong></span>
            <span className="ds-meta">{item.sampleSize} publicação(ões) · confiança {item.confidence}</span>
            <Icon name="chevronDown" size={16} className="ds-disclosure__chev" />
          </summary>
          <div className="ds-disclosure__body as-why__body">
            <p>{item.diagnosis}</p>
            <dl className="as-why__tips">
              <div><dt>Solução recomendada</dt><dd>{item.solution}</dd></div>
              <div><dt>Outra abordagem</dt><dd>{item.alternativeApproach}</dd></div>
            </dl>
          </div>
        </details>)}
      </section>}

      {insights.dataQuality && <p className="ds-hint as-perf__note">Análise baseada em {insights.dataQuality.publications} publicação(ões), {insights.dataQuality.profiles} perfil(is) e {insights.dataQuality.timeSlots} faixa(s) de horário. O nicho é estimado a partir dos textos publicados.</p>}
    </div>}
  </div>

  const activityPanel = <div className="as-log">
    <div className="as-log__head">
      <p className="ds-head__desc">As últimas 20 ações do assistente: ideias, imagens e publicações.</p>
      <div className="as-log__actions">
        <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={loadActivityLogs} disabled={logsLoading}>
          {logsLoading ? <span className="ds-spinner" aria-hidden="true" /> : <Icon name="refresh" size={16} />}Atualizar
        </button>
        <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm as-log__clear" onClick={clearActivityLogs} disabled={!activityLogs.length || clearingLogs}>
          {clearingLogs ? <span className="ds-spinner" aria-hidden="true" /> : <Icon name="trash" size={16} />}{clearingLogs ? 'Limpando…' : 'Limpar histórico'}
        </button>
      </div>
    </div>
    {logsError && <div className="ds-alert" data-tone="danger" role="alert"><Icon name="alertCircle" className="ds-alert__icon" /><p className="ds-alert__text">{logsError}</p><div className="ds-alert__actions"><button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={loadActivityLogs}>Tentar de novo</button></div></div>}
    {logsLoading && !activityLogs.length
      ? <div aria-busy="true">{[1, 2, 3].map(item => <span className="ds-skel as-log__skel" key={item} />)}</div>
      : activityLogs.length
        ? <ul className="as-log__list">{activityLogs.map(log => {
            const activity = formatAiActivity(log)
            const state = activityStatus(log.status)
            return <li className="as-log__item" key={log.id}>
              <span className="as-log__icon" data-status={state.status} aria-hidden="true"><Icon name={state.icon} size={18} /></span>
              <span className="as-log__main"><strong>{activity.title}</strong><small>{activity.details}</small></span>
              <span className="as-log__side">
                <span className="ds-status ds-status--soft" data-status={state.status}>{state.label}</span>
                <time className="ds-meta" dateTime={log.criadoEm}>{formatActivityDate(log.criadoEm)}</time>
              </span>
            </li>
          })}</ul>
        : !logsError && <div className="ds-empty ds-empty--quiet"><h3 className="ds-empty__title ds-empty__title--sm">Nenhuma atividade do assistente ainda.</h3><p className="ds-empty__text">Gere ideias ou imagens e elas aparecem aqui.</p></div>}
  </div>

  return (
    <div className="ds-page as" data-ds-root>
      <header className="ds-pagehead as-head">
        <div className="ds-pagehead__text">
          <p className="ds-eyebrow">Ideias, imagens e análises</p>
          <h1 className="ds-pagehead__title">Assistente inteligente</h1>
          <p className="ds-pagehead__lede">Ganhe tempo com ideias e legendas prontas para revisar. Gere a arte, publique na hora e descubra o melhor momento para postar.</p>
        </div>
      </header>

      <div className="ds-tabs as-tabs" role="tablist" aria-label="Seções do assistente" onKeyDown={onTabKeyDown}>
        {PAGE_TABS.map(item => <button
          key={item.key}
          type="button"
          role="tab"
          id={`as-tab-${item.key}`}
          className="ds-tab"
          aria-selected={tab === item.key}
          aria-controls={`as-panel-${item.key}`}
          tabIndex={tab === item.key ? 0 : -1}
          onClick={() => setTab(item.key)}
        >
          <Icon name={item.icon} size={16} />{item.label}
          {item.key === 'criar' && posts.length > 0 && <span className="as-tabs__count ds-num">{posts.length}</span>}
          {item.key === 'atividade' && activityLogs.length > 0 && <span className="as-tabs__count ds-num">{activityLogs.length}</span>}
        </button>)}
      </div>

      <div className="as-pane" role="tabpanel" id={`as-panel-${tab}`} aria-labelledby={`as-tab-${tab}`}>
        {tab === 'criar' ? createPanel : tab === 'desempenho' ? performancePanel : activityPanel}
      </div>

      {/* Folha do DS: prende o foco, fecha no Escape e no fundo, trava a rolagem da página e devolve o foco ao botão. */}
      {modalPost && <Sheet
        open
        onClose={closePublishPlatformModal}
        eyebrow={`Publicar agora · ideia ${String(publishModalIndex + 1).padStart(2, '0')}`}
        title="Escolha a rede social"
        description="A publicação sai na hora, na rede escolhida. Antes do envio você confirma mais uma vez."
        className="as-publish"
        footer={<>
          <button type="button" className="ds-btn ds-btn--quiet" onClick={closePublishPlatformModal}>Cancelar</button>
          <button type="button" className="ds-btn ds-btn--primary" onClick={confirmPublishPlatform} disabled={!isPublishPlatformAvailable(publishPlatform, modalPost) || (publishPlatform === 'tiktok' && !tiktokPrivacyLevel)}>
            <Icon name="send" />{confirmLabel(modalPost)}
          </button>
        </>}
      >
          <div className="as-publish__body">
            <div className="as-nets" role="radiogroup" aria-label="Rede social para publicação">
              {PUBLISH_PLATFORMS.map(option => {
                const unavailable = !isPublishPlatformAvailable(option.id, modalPost)
                return <label key={option.id} className="as-net" data-checked={publishPlatform === option.id} data-disabled={unavailable || undefined}>
                  <input type="radio" name="ai-publish-platform" value={option.id} checked={publishPlatform === option.id} onChange={() => setPublishPlatform(option.id)} disabled={unavailable} data-autofocus={publishPlatform === option.id && !unavailable ? true : undefined} />
                  <NetworkGlyph network={option.id} size={22} />
                  <span className="as-net__text"><strong>{option.label}</strong><small>{platformNote(option, modalPost)}</small></span>
                  <Icon name="checkCircle" size={18} className="as-net__check" />
                </label>
              })}
            </div>

            {isPublishPlatformAvailable(publishPlatform, modalPost) && (accountsLoadError
              ? <div className="ds-alert" data-tone="warning"><Icon name="alertTriangle" className="ds-alert__icon" /><p className="ds-alert__text">Não foi possível verificar suas contas agora. A publicação vai para todas as contas ativas desta rede.</p></div>
              : accountsLoaded && modalAccounts.length > 0 && <div className="as-dest">
                  <p className="ds-label">{modalAccounts.length === 1 ? 'Conta que vai receber' : `As ${modalAccounts.length} contas que vão receber`}</p>
                  <ul className="as-dest__list">{modalAccounts.map(account => <li key={account.id}><NetworkGlyph network={account.platform} size={14} />{accountLabel(account)}</li>)}</ul>
                  {modalAccounts.length > 1 && <p className="ds-hint">A publicação vai para todas as contas conectadas desta rede.</p>}
                </div>)}

            {modalPost.visualFormat === 'carousel' && <p className="ds-hint as-publish__note"><Icon name="info" size={16} />Carrosséis são publicados como uma única publicação no Instagram ou TikTok, mantendo a ordem dos slides.</p>}

            {publishPlatform === 'tiktok' && <div className="ds-field">
              <label className="ds-label" htmlFor="as-tiktok">Privacidade do TikTok</label>
              <Select id="as-tiktok" value={tiktokPrivacyLevel} onChange={setTiktokPrivacyLevel} aria-invalid={!tiktokPrivacyLevel || undefined} placeholder="Selecione..." sheetTitle="Privacidade do TikTok" options={TIKTOK_PRIVACY} />
              {!tiktokPrivacyLevel && <p className="ds-fieldmsg" data-tone="danger"><Icon name="alertCircle" />Escolha quem pode ver o vídeo para publicar no TikTok.</p>}
            </div>}
          </div>
      </Sheet>}

      {publicationDialog && <PublicationStatusModal status={publicationDialog.status} platforms={publicationDialog.platforms} progress={publicationProgress} onClose={() => setPublicationDialog(null)} />}
      {confirmDialog}
    </div>
  )
}
