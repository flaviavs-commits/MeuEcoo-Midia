import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import { OnboardingChecklist } from '../components/ui/onboarding-checklist.jsx'
import { Icon, NetworkGlyph } from '../components/ui/icon.jsx'
import { OverflowMenu } from '../components/ui/overflow-menu.jsx'
import { ColumnChart } from '../components/ui/column-chart.jsx'

const STATUS_LABELS = { scheduled: 'Agendada', agendado: 'Agendada', published: 'Publicada', publicado: 'Publicado', failed: 'Falhou', erro: 'Falhou', error: 'Falhou', partial: 'Parcial', processing: 'Processando' }
const SCHEDULER_AUTOSAVE_KEY = 'meu-ecoo:scheduler-autosave'
const ACTIVITY_FILTER_KEY = 'meu-ecoo:dashboard-activity-filter'
const DASHBOARD_PLATFORMS = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['youtube', 'YouTube'], ['tiktok', 'TikTok']]
const PERFORMANCE_PLATFORM_FILTERS = [['all', 'Todas as redes'], ...DASHBOARD_PLATFORMS]
const PERFORMANCE_PERIODS = [7, 15, 30]
const ANALYTICS_RETRY_BASE_MS = 5000
const ANALYTICS_RETRY_MAX_MS = 60000
const PLATFORM_LABELS = Object.fromEntries(DASHBOARD_PLATFORMS)

function formatPostDate(value) {
  if (!value) return 'Sem data definida'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Sem data definida' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function postDateValue(post) {
  return post.scheduledAt || post.scheduled_at || post.data_agendamento || post.publishedAt || post.published_at || ''
}

function postPlatforms(post) {
  return post.platforms || post.plataformas || (post.platform ? [post.platform] : [])
}

function metricValue(metrics, name) {
  const value = metrics?.[name]
  const normalized = value && typeof value === 'object' ? value.total : value
  const number = Number(normalized)
  return Number.isFinite(number) ? number : 0
}

function engagementValue(metrics) {
  return ['likes', 'comments', 'shares', 'saves'].reduce((total, name) => total + metricValue(metrics, name), 0)
}

function compactNumber(value) {
  const number = Number(value || 0)
  if (number >= 1000000) return `${(number / 1000000).toFixed(1).replace('.0', '').replace('.', ',')} mi`
  if (number >= 1000) return `${(number / 1000).toFixed(1).replace('.0', '').replace('.', ',')} mil`
  return String(number)
}

function failureDiagnosis(post) {
  const message = String(post.errorMessage || post.error_message || '').trim()
  const normalized = message.toLowerCase()
  const isTransientNetworkFailure = /respondeu\s+(408|425|429|500|502|503|504|529)|(?:http|status|c[oó]digo)\s*[=:]?\s*(408|425|429|500|502|503|504|529)\b|rate.?limit|too many requests|timeout|timed out|econnreset|etimedout|enotfound|fetch failed|network|networkerror|conex[aã]o.*(?:interromp|falh|indispon)|temporariamente indispon[ií]vel|service unavailable|gateway timeout|zernio.*(?:indispon|falh)/.test(normalized)
  if (isTransientNetworkFailure) {
    const reason = /rate.?limit|too many requests|\b429\b/.test(normalized)
      ? 'A rede social limitou temporariamente as publicações desta conta.'
      : /timeout|timed out|econnreset|etimedout|enotfound|fetch failed|network|networkerror|conex[aã]o/.test(normalized)
        ? 'A conexão com a rede social foi interrompida antes da confirmação.'
        : 'A rede social está temporariamente instável ou indisponível.'
    return {
      label: 'Falha temporária',
      className: 'is-network',
      retryable: true,
      reason,
      nextStep: 'Revise o conteúdo se quiser e publique novamente quando a conexão ou a rede voltar ao normal.'
    }
  }
  if (/token|autoriz|permiss|access|\b401\b|\b403\b|reconect/.test(normalized)) {
    return {
      label: 'Conta precisa de atenção',
      className: 'is-system',
      retryable: false,
      reason: 'A conta não autorizou esta publicação ou perdeu o acesso à rede social.',
      nextStep: 'Reconecte ou renove a conta em Integrações antes de tentar publicar novamente.'
    }
  }
  if (/exception|stack|cannot read|undefined|internal|database|sql|programa|servidor/.test(normalized)) {
    return {
      label: 'Possível falha do sistema',
      className: 'is-system',
      retryable: false,
      reason: message || 'O processamento interno não conseguiu concluir a publicação.',
      nextStep: 'Aguarde e tente novamente mais tarde. Se persistir, envie este registro ao suporte.'
    }
  }
  if (/imagem|image|vídeo|video|mídia|media|formato|tamanho|caract|caption|texto|obrigat|conteúdo|content|already\s+(?:scheduled|published|posted)|already.*(?:publish|schedule)|exact\s+content|same\s+content|duplicate|duplicad|já\s+(?:está|foi)\s+(?:agendad|publicad)|conteúdo\s+duplicado/.test(normalized)) {
    return {
      label: 'Conteúdo ou configuração',
      className: 'is-content',
      retryable: true,
      reason: message || 'O conteúdo ou alguma configuração não atende aos requisitos da rede.',
      nextStep: 'Abra o editor, corrija mídia, texto ou configurações específicas da plataforma e publique novamente.'
    }
  }
  return {
    label: 'Origem não conclusiva',
    className: 'is-unknown',
    retryable: false,
    reason: message || 'A publicação foi marcada como falha, mas não há detalhes suficientes no registro.',
    nextStep: 'Confira Integrações e o histórico da publicação. O editor só fica disponível quando a falha puder ser corrigida no conteúdo.'
  }
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const STATUS_TONES = { scheduled: 'scheduled', agendado: 'scheduled', published: 'published', publicado: 'published', failed: 'failed', erro: 'failed', error: 'failed', partial: 'partial', processing: 'processing' }
const STATUS_ICONS = { scheduled: 'clock', published: 'checkCircle', failed: 'alertCircle', partial: 'halfCircle', processing: 'processing' }
const FAILURE_STATUSES = ['error', 'erro', 'failed', 'partial']

function todayLabel() {
  const text = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function readActivityFilter() {
  try {
    return localStorage.getItem(ACTIVITY_FILTER_KEY) || 'all'
  } catch {
    return 'all'
  }
}

// Meu Post saves text per network (textByPlatform) and usually leaves "text" empty.
function postText(post) {
  if (post.text || post.title) return post.text || post.title
  const byPlatform = post.textByPlatform && typeof post.textByPlatform === 'object' ? Object.values(post.textByPlatform) : []
  return byPlatform.find(value => typeof value === 'string' && value.trim()) || ''
}

function postTitle(post) {
  return postText(post) || `Publicação #${post.id}`
}

function NetGlyphs({ platforms, size = 14 }) {
  if (!platforms.length) return <span className="ds-meta">Rede não informada</span>
  return <span className="dash-inline" aria-label={platforms.map(platform => PLATFORM_LABELS[platform] || platform).join(', ')}>
    {platforms.map(platform => <NetworkGlyph network={platform} size={size} key={platform} />)}
  </span>
}

function statFigure(loading, error, value) {
  if (loading) return { text: '—', state: undefined }
  if (error) return { text: '—', state: 'unavailable' }
  return { text: String(value), state: undefined }
}

function bestObservedHour(rows) {
  const byHour = {}
  rows.forEach(row => {
    const date = new Date(row.publishedAt)
    if (Number.isNaN(date.getTime())) return
    const hour = date.getHours()
    byHour[hour] = (byHour[hour] || 0) + engagementValue(row.metrics)
  })
  const best = Object.entries(byHour).sort(([, a], [, b]) => b - a)[0]
  if (!best || !best[1]) return null
  const hour = Number(best[0])
  return `${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00`
}

function bestProviderTime(accountAnalytics, platform = 'all') {
  const slots = (accountAnalytics?.bestTimeToPost || [])
    .filter(item => platform === 'all' || [item.platform, item.network, item.data?.platform].includes(platform))
    .flatMap(item => item.data?.slots || [])
  const best = [...slots].sort((a, b) => Number(b.avg_engagement || 0) - Number(a.avg_engagement || 0))[0]
  if (!best || best.hour == null) return null
  const days = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
  return `${days[Number(best.day_of_week)] || 'melhor dia'}, ${String(best.hour).padStart(2, '0')}h (UTC)`
}

export function DashboardPage({ onNavigate }) {
  const [data, setData] = useState({ posts: [], accounts: [] })
  const [postsError, setPostsError] = useState('')
  const [accountsError, setAccountsError] = useState('')
  const [analytics, setAnalytics] = useState(null)
  const [analyticsPeriodDays, setAnalyticsPeriodDays] = useState(7)
  const [analyticsPlatform, setAnalyticsPlatform] = useState('all')
  const [analyticsError, setAnalyticsError] = useState('')
  const [postsLoading, setPostsLoading] = useState(true)
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [analyticsRetry, setAnalyticsRetry] = useState(0)
  const [activityFilter, setActivityFilter] = useState(readActivityFilter)
  const [activitySearch, setActivitySearch] = useState('')
  const [deletingPostId, setDeletingPostId] = useState(null)
  const [alertError, setAlertError] = useState('')

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVITY_FILTER_KEY, activityFilter)
    } catch {
      // O filtro continua valendo nesta sessão mesmo sem storage.
    }
  }, [activityFilter])

  useEffect(() => {
    let active = true
    setPostsLoading(true)
    setAccountsLoading(true)
    apiFetch('/api/posts')
      .then(posts => { if (active) setData(current => ({ ...current, posts: posts.posts || posts || [] })) })
      .catch(error => { if (active) setPostsError(error.message) })
      .finally(() => { if (active) setPostsLoading(false) })
    apiFetch('/api/accounts')
      .then(accounts => { if (active) setData(current => ({ ...current, accounts: accounts.accounts || accounts.data || accounts || [] })) })
      .catch(error => { if (active) setAccountsError(error.message) })
      .finally(() => { if (active) setAccountsLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    let retryTimer = null
    let retryAttempt = 0
    setAnalyticsLoading(true)
    setAnalyticsError('')

    function loadAnalytics() {
      // Esse endpoint agrega métricas ao vivo de várias contas/plataformas
      // (Zernio + APIs nativas), podendo levar bem mais que o timeout padrão
      // de 15s da apiFetch em contas com várias publicações no período.
      apiFetch(`/api/posts/analytics?days=${analyticsPeriodDays}`, { timeoutMs: 45_000 })
        .then(result => {
          if (!active) return
          retryAttempt = 0
          setAnalytics(result)
          setAnalyticsError('')
        })
        .catch(error => {
          if (!active) return
          setAnalyticsError(error.message)
          retryAttempt += 1
          const delay = Math.min(ANALYTICS_RETRY_MAX_MS, ANALYTICS_RETRY_BASE_MS * (2 ** Math.min(retryAttempt - 1, 4)))
          retryTimer = window.setTimeout(loadAnalytics, delay)
        })
        .finally(() => { if (active) setAnalyticsLoading(false) })
    }

    loadAnalytics()
    return () => {
      active = false
      if (retryTimer) window.clearTimeout(retryTimer)
    }
  }, [analyticsPeriodDays, analyticsRetry])

  const scheduled = data.posts.filter(p => p.status === 'scheduled' || p.status === 'agendado').length
  const reviewAlerts = data.posts
    .filter(post => ['error', 'erro', 'failed', 'partial'].includes(post.status))
    .map(post => ({ post, diagnosis: failureDiagnosis(post) }))
    .filter(({ diagnosis }) => diagnosis.retryable)
    .slice(0, 4)
  const upcoming = data.posts
    .filter(post => post.status === 'scheduled' || post.status === 'agendado')
    .filter(post => !Number.isNaN(new Date(postDateValue(post)).getTime()))
    .sort((a, b) => new Date(postDateValue(a)) - new Date(postDateValue(b)))
    .slice(0, 4)
  const scheduledWithoutDate = data.posts.filter(post => (post.status === 'scheduled' || post.status === 'agendado') && Number.isNaN(new Date(postDateValue(post)).getTime())).length
  const dashboardError = postsError || accountsError
  const connectedPlatforms = new Set(data.accounts.map(account => account.platform).filter(Boolean)).size
  const analyticsRows = Array.isArray(analytics?.metrics) ? analytics.metrics.filter(row => row.metrics) : []
  const selectedAnalyticsRows = analyticsPlatform === 'all'
    ? analyticsRows
    : analyticsRows.filter(row => row.platform === analyticsPlatform)
  const selectedPlatformLabel = PERFORMANCE_PLATFORM_FILTERS.find(([platform]) => platform === analyticsPlatform)?.[1] || 'Todas as redes'
  // O cartão e o gráfico representam o mesmo recorte: publicações com
  // métricas disponíveis, filtradas pela rede e pelo período selecionados.
  // Totais de conta têm outra semântica (alcance/insights do perfil) e não
  // podem substituir a soma das publicações sem deixar o cartão diferente
  // das barras exibidas logo abaixo.
  const totalViews = selectedAnalyticsRows.reduce((total, row) => total + metricValue(row.metrics, 'views'), 0)
  const totalEngagement = selectedAnalyticsRows.reduce((total, row) => total + engagementValue(row.metrics), 0)
  const engagementRate = totalViews > 0 ? (totalEngagement / totalViews) * 100 : 0
  const topEngagementPosts = useMemo(() => [...selectedAnalyticsRows]
    .sort((a, b) => engagementValue(b.metrics) - engagementValue(a.metrics))
    .slice(0, 3), [selectedAnalyticsRows])
  const trend = useMemo(() => {
    const byDay = {}
    selectedAnalyticsRows.forEach(row => {
      const date = new Date(row.publishedAt)
      if (Number.isNaN(date.getTime())) return
      const key = date.toISOString().slice(0, 10)
      byDay[key] = byDay[key] || { views: 0, engagement: 0 }
      byDay[key].views += metricValue(row.metrics, 'views')
      byDay[key].engagement += engagementValue(row.metrics)
    })
    return Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).slice(-7).map(([date, values]) => ({ date, ...values }))
  }, [selectedAnalyticsRows])
  const bestHour = bestProviderTime(analytics?.accountAnalytics, analyticsPlatform) || bestObservedHour(topEngagementPosts)
  const bestPost = topEngagementPosts[0]
  const maxTrendValue = Math.max(...trend.map(item => Math.max(item.views, item.engagement)), 1)
  const analyticsInsight = bestPost
    ? `O conteúdo com mais interações no recorte gerou ${compactNumber(engagementValue(bestPost.metrics))} interações. Use esse tema ou formato como referência para a próxima criação.`
    : 'Publique e conecte suas contas para que o Dashboard possa transformar desempenho real em recomendações.'
  const timeInsight = bestHour
    ? `Nos conteúdos com mais interação, o horário observado foi ${bestHour}. Teste essa janela em novos posts e compare o resultado.`
    : 'Ainda não há dados suficientes para sugerir um horário de postagem com segurança.'
  const onboardingIncomplete = !accountsLoading && !postsLoading && !postsError && !accountsError && (data.accounts.length === 0 || data.posts.length === 0 || !data.posts.some(post => ['published', 'publicado', 'scheduled', 'agendado'].includes(post.status)))
  const isEmptyWorkspace = !accountsLoading && !postsLoading && !postsError && !accountsError && data.accounts.length === 0 && data.posts.length === 0
  const recentPosts = useMemo(() => {
    const query = activitySearch.trim().toLowerCase()
    return data.posts
      .filter(post => post.status !== 'cancelled')
      .filter(post => activityFilter === 'all' || (activityFilter === 'published' ? ['published', 'publicado'].includes(post.status) : activityFilter === 'scheduled' ? ['scheduled', 'agendado'].includes(post.status) : ['error', 'erro', 'failed', 'partial'].includes(post.status)))
      .filter(post => !query || postText(post).toLowerCase().includes(query))
      .sort((a, b) => new Date(b.publishedAt || b.scheduledAt || b.scheduled_at || 0) - new Date(a.publishedAt || a.scheduledAt || a.scheduled_at || 0))
      .slice(0, 8)
  }, [data.posts, activityFilter, activitySearch])

  function reviewFailure(post) {
    const selected = Array.isArray(post.platforms) && post.platforms.length ? post.platforms : ['instagram']
    const textByPlatform = post.textByPlatform && typeof post.textByPlatform === 'object'
      ? post.textByPlatform
      : Object.fromEntries(selected.map(platform => [platform, post.text || '']))
    const titleByPlatform = post.titleByPlatform && typeof post.titleByPlatform === 'object' ? post.titleByPlatform : {}
    const mediaItems = Array.isArray(post.mediaItems) ? post.mediaItems : []
    const media = mediaItems[0]
    const mediaPath = media?.path || media?.url || post.mediaPath
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
      titleByPlatform,
      selected,
      publishNow: true,
      date: '',
      youtubeTitle: post.youtubeTitle || '',
      youtubeVisibility: post.youtubeVisibility || 'public',
      youtubeMadeForKids: post.youtubeMadeForKids == null ? '' : String(post.youtubeMadeForKids),
      youtubeCategoryId: post.youtubeCategoryId || '',
      youtubeFormat: post.youtubeFormat || '',
      igFormat: post.igFormat || 'post',
      tiktokPrivacyLevel: post.tiktokPrivacyLevel || 'PUBLIC_TO_EVERYONE',
      tiktokDisableComment: Boolean(post.tiktokDisableComment),
      tiktokDisableDuet: Boolean(post.tiktokDisableDuet),
      tiktokDisableStitch: Boolean(post.tiktokDisableStitch),
      sourceFailureId: post.id,
      savedAt: new Date().toISOString()
    }))
    onNavigate('agendador')
  }

  function openFailure(post) {
    if (failureDiagnosis(post).retryable) return reviewFailure(post)
    onNavigate('atividade')
  }

  async function deleteFailure(post) {
    const label = postTitle(post)
    if (!window.confirm(`Excluir esta publicação com falha?\n\n${label}\n\nEla será removida da lista do dashboard e não poderá ser reenviada.`)) return
    setDeletingPostId(post.id)
    setAlertError('')
    try {
      await apiFetch(`/api/posts/${post.id}`, { method: 'DELETE' })
      setData(current => ({ ...current, posts: current.posts.filter(item => item.id !== post.id) }))
    } catch (error) {
      setAlertError(error.message)
    } finally {
      setDeletingPostId(null)
    }
  }

  const failedCount = data.posts.filter(post => FAILURE_STATUSES.includes(post.status)).length
  const publicationsFigure = statFigure(postsLoading, postsError, data.posts.length)
  const scheduledFigure = statFigure(postsLoading, postsError, scheduled)
  const failuresFigure = statFigure(postsLoading, postsError, failedCount)
  const accountsFigure = statFigure(accountsLoading, accountsError, data.accounts.length)
  const performanceRefreshing = analyticsLoading && Boolean(analytics)
  const trendDay = date => new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const attentionCount = reviewAlerts.length + (scheduledWithoutDate ? 1 : 0)

  return <div className="ds-page dash" data-ds-root>
    <header className="ds-pagehead">
      <div className="ds-pagehead__text">
        <p className="ds-eyebrow">{todayLabel()}</p>
        <h1 className="ds-pagehead__title">Início</h1>
        <p className="ds-pagehead__lede">Tenha uma visão rápida das publicações, agendamentos e redes conectadas.</p>
      </div>
    </header>

    {dashboardError && <div className="ds-alert dash-banner" data-tone="danger" role="alert">
      <Icon name="alertCircle" className="ds-alert__icon" />
      <p className="ds-alert__title">Parte das informações não carregou</p>
      <p className="ds-alert__text">{dashboardError}</p>
    </div>}

    {isEmptyWorkspace
      ? <OnboardingChecklist variant="empty" accounts={data.accounts} posts={data.posts} onNavigate={onNavigate} />
      : <>
        {onboardingIncomplete && <OnboardingChecklist accounts={data.accounts} posts={data.posts} onNavigate={onNavigate} />}

        <section className="dash-status" aria-label="Resumo da conta" aria-busy={postsLoading || accountsLoading}>
          <div className="ds-stats">
            <div className="ds-stat">
              <p className="ds-stat__label">Publicações</p>
              <p className="ds-stat__value" data-state={publicationsFigure.state}>{publicationsFigure.text}</p>
              <p className="ds-stat__caption">{postsError ? 'Indisponível agora' : 'Total criado na conta'}</p>
            </div>
            <div className="ds-stat">
              <p className="ds-stat__label">Agendadas</p>
              <p className="ds-stat__value" data-state={scheduledFigure.state}>{scheduledFigure.text}</p>
              {scheduledWithoutDate
                ? <p className="ds-stat__caption dash-status__warn"><Icon name="clock" size={14} />{scheduledWithoutDate} sem horário definido</p>
                : <p className="ds-stat__caption">{postsError ? 'Indisponível agora' : 'Prontas para publicação'}</p>}
            </div>
            <div className="ds-stat">
              <p className="ds-stat__label">Falhas</p>
              <p className="ds-stat__value" data-state={failuresFigure.state} data-tone={failedCount && !postsError ? 'danger' : undefined}>{failuresFigure.text}</p>
              <p className="ds-stat__caption">
                {postsError ? 'Indisponível agora' : reviewAlerts.length ? <a className="ds-link" href="#dash-atencao">Revisar abaixo</a> : failedCount ? 'Detalhes nas publicações recentes' : 'Nenhuma falha registrada'}
              </p>
            </div>
            <div className="ds-stat">
              <p className="ds-stat__label">Contas conectadas</p>
              <p className="ds-stat__value" data-state={accountsFigure.state}>{accountsFigure.text}</p>
              <p className="ds-stat__caption">{accountsError ? 'Indisponível agora' : `${connectedPlatforms} de ${DASHBOARD_PLATFORMS.length} redes`}</p>
            </div>
          </div>
        </section>

        {attentionCount > 0 && <section className="ds-block dash-attn" id="dash-atencao" aria-labelledby="dash-atencao-title">
          <div className="ds-head">
            <div className="ds-head__text">
              <h2 className="ds-head__title" id="dash-atencao-title">Precisa de atenção <span className="ds-badge" data-tone="danger">{attentionCount} {attentionCount === 1 ? 'item' : 'itens'}</span></h2>
              <p className="ds-head__desc">Publicações que podem não ter sido concluídas e agendamentos sem horário.</p>
            </div>
          </div>
          <ul className="ds-list">
            {reviewAlerts.map(({ post, diagnosis }) => {
              const deleting = deletingPostId === post.id
              const platforms = postPlatforms(post)
              return <li className="ds-list-item ds-list-item--top dash-attn__item" key={post.id}>
                <span className="dash-attn__mark" aria-hidden="true"><Icon name="alertCircle" /></span>
                <div className="ds-list-item__body">
                  <p className="ds-list-item__title ds-list-item__title--wrap">{postTitle(post)}</p>
                  <p className="ds-list-item__meta"><NetGlyphs platforms={platforms} /><span className="ds-num">{formatPostDate(postDateValue(post))}</span></p>
                  <p className="dash-attn__reason">
                    <span className="ds-badge" data-tone={diagnosis.className === 'is-network' ? 'info' : 'danger'}>{diagnosis.label}</span>
                    <span>{diagnosis.reason}</span>
                  </p>
                  <details className="ds-disclosure dash-attn__how">
                    <summary>Como resolver<Icon name="chevronDown" size={16} className="ds-disclosure__chev" /></summary>
                    <p className="ds-disclosure__body">{diagnosis.nextStep}</p>
                  </details>
                </div>
                <div className="ds-list-item__trail">
                  <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={() => reviewFailure(post)} disabled={deleting}>
                    <Icon name="compose" size={16} />Revisar no editor
                  </button>
                  {deleting
                    ? <span className="ds-meta dash-inline" aria-live="polite"><span className="ds-spinner" aria-hidden="true" />Excluindo...</span>
                    : <OverflowMenu label={`Mais ações para ${postTitle(post)}`} items={[{ label: 'Excluir alerta', icon: 'trash', danger: true, onSelect: () => deleteFailure(post) }]} />}
                </div>
              </li>
            })}
            {scheduledWithoutDate > 0 && <li className="ds-list-item dash-attn__item">
              <span className="dash-attn__mark" data-tone="warning" aria-hidden="true"><Icon name="clock" /></span>
              <div className="ds-list-item__body">
                <p className="ds-list-item__title ds-list-item__title--wrap">{scheduledWithoutDate === 1 ? '1 publicação agendada está' : `${scheduledWithoutDate} publicações agendadas estão`} sem horário definido.</p>
              </div>
              <div className="ds-list-item__trail"><button type="button" className="ds-go" onClick={() => onNavigate('calendario')}>Corrigir agenda<Icon name="arrow" /></button></div>
            </li>}
          </ul>
          {alertError && <p className="dash-attn__note" role="status">Não foi possível excluir o alerta: {alertError}</p>}
        </section>}

        <section className="ds-block dash-perf" aria-labelledby="dash-perf-title">
          <div className="ds-head">
            <div className="ds-head__text">
              <h2 className="ds-head__title" id="dash-perf-title">Desempenho</h2>
              <p className="ds-head__desc">Métricas dos últimos {analyticsPeriodDays} dias, das publicações com métricas disponíveis nas redes conectadas.</p>
            </div>
            <div className="ds-head__actions"><button type="button" className="ds-go" onClick={() => onNavigate('analytics')}>Abrir Relatórios<Icon name="arrow" /></button></div>
          </div>
          <div className="ds-filterbar dash-perf__filters">
            <div className="ds-netswitch" role="group" aria-label="Filtrar desempenho por rede social">
              {PERFORMANCE_PLATFORM_FILTERS.map(([platform, label]) => <button type="button" className="ds-netswitch__opt" aria-pressed={analyticsPlatform === platform} key={platform} onClick={() => setAnalyticsPlatform(platform)}>
                <NetworkGlyph network={platform} size={16} />{label}
              </button>)}
            </div>
            <div className="ds-filterbar__end">
              {performanceRefreshing && <span className="ds-meta dash-perf__updating" aria-live="polite"><span className="ds-spinner" aria-hidden="true" />Atualizando...</span>}
              <div className="ds-seg" role="group" aria-label="Período do desempenho">
                {PERFORMANCE_PERIODS.map(days => <button type="button" className="ds-seg__opt" aria-pressed={analyticsPeriodDays === days} key={days} onClick={() => setAnalyticsPeriodDays(days)}>{days} dias</button>)}
              </div>
            </div>
          </div>

          {analyticsLoading && !analytics
            ? <div className="dash-perf__body" aria-busy="true">
              <div className="dash-perf__main">
                <div className="ds-stats" style={{ '--cols': 3 }}>{[52, 44, 38].map(width => <div className="ds-stat" key={width}><span className="ds-skel" style={{ width: '52%' }} /><span className="ds-skel ds-skel--figure" style={{ width: `${width}%` }} /></div>)}</div>
                <span className="ds-skel ds-skel--block" style={{ height: 150, marginTop: 28 }} />
                <p className="ds-sr-only" aria-live="polite">Carregando métricas...</p>
              </div>
              <div className="dash-perf__aside"><span className="ds-skel" style={{ width: '30%' }} />{[1, 2, 3].map(item => <span className="ds-skel" key={item} style={{ height: 40 }} />)}</div>
            </div>
            : analyticsError && !analytics
              ? <div className="ds-alert" data-tone="warning" role="status">
                <Icon name="alertTriangle" className="ds-alert__icon" />
                <p className="ds-alert__title">Métricas indisponíveis no momento</p>
                <p className="ds-alert__text">{analyticsError} Uma nova tentativa acontece automaticamente.</p>
                <div className="ds-alert__actions">
                  <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={() => setAnalyticsRetry(value => value + 1)}><Icon name="refresh" size={16} />Tentar novamente</button>
                  <button type="button" className="ds-go" onClick={() => onNavigate('analytics')}>Abrir Relatórios<Icon name="arrow" /></button>
                </div>
              </div>
              : <>
                {analyticsError && <div className="ds-alert dash-banner" data-tone="warning" role="status">
                  <Icon name="alertTriangle" className="ds-alert__icon" />
                  <p className="ds-alert__text">Não foi possível atualizar agora. Exibindo o último resultado válido.</p>
                  <div className="ds-alert__actions"><button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={() => setAnalyticsRetry(value => value + 1)}><Icon name="refresh" size={16} />Tentar novamente</button></div>
                </div>}
                <div className="dash-perf__body">
                  <div className="dash-perf__main" aria-busy={performanceRefreshing}>
                    <div className="ds-stats" style={{ '--cols': 3 }}>
                      <div className="ds-stat"><p className="ds-stat__label">Visualizações</p><p className="ds-stat__value">{compactNumber(totalViews)}</p></div>
                      <div className="ds-stat"><p className="ds-stat__label">Interações</p><p className="ds-stat__value" data-tone="gold">{compactNumber(totalEngagement)}</p></div>
                      <div className="ds-stat"><p className="ds-stat__label">Taxa de interação</p><p className="ds-stat__value">{engagementRate.toFixed(1).replace('.', ',')}<span className="ds-stat__unit">%</span></p></div>
                    </div>
                    {trend.length
                      ? <>
                        <div className="dash-perf__charts">
                          <ColumnChart
                            title="Visualizações por dia de publicação"
                            data={trend.map(item => ({ key: item.date, label: trendDay(item.date), value: item.views }))}
                            format={compactNumber}
                            height={96}
                            ariaLabel={`Visualizações por dia de publicação de ${selectedPlatformLabel.toLowerCase()}. Os valores estão na tabela logo abaixo.`}
                          />
                          <ColumnChart
                            title="Interações por dia de publicação"
                            data={trend.map(item => ({ key: item.date, label: trendDay(item.date), value: item.engagement }))}
                            format={compactNumber}
                            height={96}
                            tone="2"
                            ariaLabel={`Interações por dia de publicação de ${selectedPlatformLabel.toLowerCase()}. Os valores estão na tabela logo abaixo.`}
                          />
                        </div>
                        <details className="ds-disclosure dash-perf__values">
                          <summary><Icon name="activity" size={18} />Ver valores por dia<Icon name="chevronDown" size={18} className="ds-disclosure__chev" /></summary>
                          <div className="ds-disclosure__body ds-scrollx">
                            <table className="ds-datatable">
                              <thead><tr><th scope="col">Dia</th><th scope="col" className="ds-cellnum">Visualizações</th><th scope="col" className="ds-cellnum">Interações</th></tr></thead>
                              <tbody>{trend.map(item => <tr key={item.date}><td>{trendDay(item.date)}</td><td className="ds-cellnum">{item.views.toLocaleString('pt-BR')}</td><td className="ds-cellnum">{item.engagement.toLocaleString('pt-BR')}</td></tr>)}</tbody>
                            </table>
                          </div>
                        </details>
                      </>
                      : <p className="ds-meta dash-perf__state">Ainda não há série suficiente para desenhar o gráfico.</p>}
                  </div>
                  <aside className="dash-perf__aside" aria-label="Destaques do período">
                    <h3 className="dash-kicker">Destaques</h3>
                    {topEngagementPosts.length
                      ? <ol className="dash-top">
                        {topEngagementPosts.map((post, index) => <li className="dash-top__item" key={`${post.postId}-${post.platform}`}>
                          <span className="dash-top__rank">0{index + 1}</span>
                          <div className="dash-top__body">
                            <p className="dash-top__title">{post.text || post.youtubeTitle || 'Publicação sem descrição'}</p>
                            <p className="ds-meta dash-inline"><NetworkGlyph network={post.platform} size={14} />{PLATFORM_LABELS[post.platform] || post.platform} · {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('pt-BR') : 'Data não informada'}</p>
                          </div>
                          <p className="dash-top__metric"><strong>{compactNumber(engagementValue(post.metrics))}</strong><span>interações</span></p>
                        </li>)}
                      </ol>
                      : <p className="ds-meta">As publicações com mais interações no recorte aparecem aqui.</p>}
                    {topEngagementPosts.length > 0 && <p className="ds-meta">O ranking considera curtidas, comentários, compartilhamentos e salvamentos registrados.</p>}
                  </aside>
                </div>
              </>}

          <div className="dash-reads">
            <h3 className="dash-kicker">Leituras do período</h3>
            <dl className="dash-notes dash-reads__list">
              <div><dt>Conteúdo</dt><dd>{analyticsInsight}</dd></div>
              <div><dt>Horário de postagem</dt><dd>{timeInsight}</dd></div>
              <div><dt>Próximo teste</dt><dd>Crie uma variação com o sistema inteligente usando a publicação de melhor desempenho como referência.<br /><button type="button" className="ds-go" onClick={() => onNavigate('ai')}>Criar uma variação<Icon name="arrow" /></button></dd></div>
            </dl>
          </div>
        </section>

        <div className="ds-split dash-lower">
          <section className="ds-block dash-recent" aria-labelledby="dash-recent-title">
            <div className="ds-head">
              <div className="ds-head__text">
                <h2 className="ds-head__title" id="dash-recent-title">Publicações recentes</h2>
                <p className="ds-head__desc">Acompanhe o que foi publicado e o que está em andamento.</p>
              </div>
              <div className="ds-head__actions"><button type="button" className="ds-go" onClick={() => onNavigate('atividade')}>Ver em Atividades<Icon name="arrow" /></button></div>
            </div>
            <div className="ds-filterbar dash-recent__filters">
              <label className="ds-inputwrap dash-recent__search">
                <Icon name="search" />
                <span className="ds-sr-only">Buscar publicação no Início</span>
                <input className="ds-input" type="search" value={activitySearch} onChange={event => setActivitySearch(event.target.value)} placeholder="Buscar publicação..." />
              </label>
              <div className="ds-seg" role="group" aria-label="Filtrar publicações">
                {[['all', 'Todas'], ['published', 'Publicadas'], ['scheduled', 'Agendadas'], ['failed', 'Falhas']].map(([key, label]) => <button type="button" className="ds-seg__opt" aria-pressed={activityFilter === key} key={key} onClick={() => setActivityFilter(key)}>{label}</button>)}
              </div>
            </div>
            {postsError
              ? <p className="ds-alert ds-alert--quiet" aria-live="polite">Não foi possível carregar as publicações.</p>
              : postsLoading
                ? <div aria-busy="true">
                  <p className="ds-sr-only" aria-live="polite">Carregando publicações...</p>
                  {[1, 2, 3, 4].map(item => <div className="dash-skelrow" key={item}><span className="ds-skel" style={{ width: 44, height: 20 }} /><span className="ds-skel" style={{ flex: 1 }} /><span className="ds-skel" style={{ width: 80 }} /></div>)}
                </div>
                : recentPosts.length
                  ? <ul className="ds-list dash-recent__list">
                    {recentPosts.map(post => {
                      const isFailure = FAILURE_STATUSES.includes(post.status)
                      const isScheduled = post.status === 'scheduled' || post.status === 'agendado'
                      const canRetry = isFailure && failureDiagnosis(post).retryable
                      const tone = STATUS_TONES[post.status] || 'muted'
                      return <li className="ds-list-item" key={post.id}>
                        <span className="ds-list-item__lead dash-recent__nets"><NetGlyphs platforms={postPlatforms(post)} size={16} /></span>
                        <div className="ds-list-item__body">
                          <p className="ds-list-item__title">{postText(post) || 'Publicação sem texto'}</p>
                          <p className="ds-list-item__meta"><span className="ds-num">{formatPostDate(postDateValue(post))}</span></p>
                        </div>
                        <div className="ds-list-item__trail">
                          <span className="ds-status" data-status={tone}><Icon name={STATUS_ICONS[tone] || 'info'} />{STATUS_LABELS[post.status] || post.status || 'Sem status'}</span>
                          <button
                            type="button"
                            className="dash-recent__act"
                            data-emphasis={canRetry ? 'true' : undefined}
                            onClick={() => isScheduled ? onNavigate('calendario') : isFailure ? openFailure(post) : onNavigate('atividade')}
                          >
                            {isScheduled ? 'Calendário' : isFailure ? (canRetry ? 'Revisar no editor' : 'Ver detalhes') : 'Detalhes'}
                          </button>
                        </div>
                      </li>
                    })}
                  </ul>
                  : <p className="ds-empty ds-empty--quiet ds-meta">{activitySearch || activityFilter !== 'all' ? 'Nenhuma publicação encontrada para este filtro.' : 'Nenhuma publicação encontrada.'}</p>}
          </section>

          <div className="dash-lower__aside">
            <section className="ds-block dash-next" aria-labelledby="dash-next-title">
              <div className="ds-head">
                <div className="ds-head__text"><h2 className="ds-head__title" id="dash-next-title">Próximos agendamentos</h2></div>
                <div className="ds-head__actions"><button type="button" className="ds-go" onClick={() => onNavigate('calendario')}>Ver calendário<Icon name="arrow" /></button></div>
              </div>
              {postsLoading
                ? <div aria-busy="true"><p className="ds-sr-only" aria-live="polite">Carregando agenda...</p>{[1, 2, 3].map(item => <div className="dash-skelrow" key={item}><span className="ds-skel" style={{ width: 48, height: 52, borderRadius: 10 }} /><span className="ds-skel" style={{ flex: 1 }} /></div>)}</div>
                : upcoming.length
                  ? <ul className="ds-list">
                    {upcoming.map(post => {
                      const date = new Date(postDateValue(post))
                      const day = String(date.getDate()).padStart(2, '0')
                      const month = String(date.getMonth() + 1).padStart(2, '0')
                      const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                      return <li className="ds-list-item ds-list-item--top dash-next__item" key={post.id}>
                        <span className="dash-date" aria-hidden="true"><span className="dash-date__day">{day}</span><span className="dash-date__month">{MONTHS[date.getMonth()]}</span></span>
                        <div className="ds-list-item__body">
                          <p className="ds-meta"><span className="ds-num">{WEEKDAYS[date.getDay()]}, {day}/{month} · {time}</span><NetGlyphs platforms={postPlatforms(post)} /></p>
                          <p className="ds-list-item__title ds-list-item__title--wrap">{postText(post) || 'Publicação sem texto'}</p>
                        </div>
                      </li>
                    })}
                  </ul>
                  : <div className="ds-empty ds-empty--quiet">
                    <p className="ds-empty__text">{scheduledWithoutDate ? 'Nenhum agendamento com data definida.' : 'Nenhum agendamento próximo. Crie uma publicação para manter suas redes ativas.'}</p>
                    <div className="ds-empty__actions"><button type="button" className="ds-go" onClick={() => onNavigate(scheduledWithoutDate ? 'calendario' : 'agendador')}>{scheduledWithoutDate ? 'Corrigir agenda' : 'Criar post'}<Icon name="arrow" /></button></div>
                  </div>}
            </section>

            <section className="ds-block dash-nets" aria-labelledby="dash-nets-title">
              <div className="ds-head">
                <div className="ds-head__text"><h2 className="ds-head__title" id="dash-nets-title">Redes conectadas</h2></div>
                <div className="ds-head__actions"><button type="button" className="ds-go" onClick={() => onNavigate('integracoes')}>Abrir Contas<Icon name="arrow" /></button></div>
              </div>
              {accountsLoading
                ? <div aria-busy="true"><p className="ds-sr-only" aria-live="polite">Carregando conexões...</p>{[1, 2, 3, 4].map(item => <div className="dash-skelrow" key={item}><span className="ds-skel ds-skel--circle" style={{ width: 36, height: 36 }} /><span className="ds-skel" style={{ flex: 1 }} /></div>)}</div>
                : accountsError
                  ? <p className="ds-alert ds-alert--quiet" aria-live="polite">Não foi possível verificar o status das contas.</p>
                  : <ul className="ds-list ds-list--interactive">
                    {DASHBOARD_PLATFORMS.map(([platform, label]) => {
                      const platformAccounts = data.accounts.filter(item => item.platform === platform)
                      const count = platformAccounts.length
                      const names = platformAccounts.map(account => account.handle || account.name).filter(Boolean).join(', ')
                      return <li key={platform}>
                        <button type="button" className="ds-list-item dash-nets__item" onClick={() => onNavigate('integracoes')}>
                          <span className="dash-nets__glyph"><NetworkGlyph network={platform} size={20} /></span>
                          <span className="ds-list-item__body">
                            <span className="ds-list-item__title">{label}</span>
                            <span className="ds-list-item__meta"><span>{count ? (count > 1 ? `${count} contas${names ? ` · ${names}` : ''}` : names || '1 conta') : 'Nenhuma conta'}</span></span>
                          </span>
                          <span className="ds-list-item__trail">
                            {count
                              ? <span className="ds-status" data-status="ok"><Icon name="checkCircle" />Conectada</span>
                              : <span className="ds-status" data-status="muted"><Icon name="plus" />Conectar conta</span>}
                          </span>
                        </button>
                      </li>
                    })}
                  </ul>}
            </section>
          </div>
        </div>
      </>}
  </div>
}
