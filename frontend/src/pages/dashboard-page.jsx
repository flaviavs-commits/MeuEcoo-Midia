import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import { OnboardingChecklist } from '../components/ui/onboarding-checklist.jsx'
import { Icon, NetworkGlyph } from '../components/ui/icon.jsx'
import { OverflowMenu } from '../components/ui/overflow-menu.jsx'
import { useConfirm } from '../components/ui/confirm-dialog.jsx'
import { composerDraftFromPost, mediaItemsOf, mediaSelectionOf, openInComposer } from '../lib/composer-handoff.js'
import { useServerDown } from '../components/layout/connection-banner.jsx'

const DASHBOARD_PLATFORMS = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['youtube', 'YouTube'], ['tiktok', 'TikTok']]
const SUMMARY_DAYS = 7
// A lista geral de posts vem paginada (100 por vez, dos mais antigos para os mais novos) e inclui os
// excluídos: com mais de 100 posts, os próximos agendamentos sumiam e as falhas ficavam de fora. O
// Início busca cada status que usa, e marca "+" quando há mais do que a primeira página.
const DASHBOARD_STATUSES = ['scheduled', 'error', 'partial', 'published']
const ANALYTICS_RETRY_BASE_MS = 5000
const ANALYTICS_RETRY_MAX_MS = 60000
const PLATFORM_LABELS = Object.fromEntries(DASHBOARD_PLATFORMS)
const DEFAULT_API_MESSAGE = 'Não foi possível concluir a operação'

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
const FAILURE_STATUSES = ['error', 'erro', 'failed', 'partial']

function todayLabel() {
  const text = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  return text.charAt(0).toUpperCase() + text.slice(1)
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

function shortText(text, limit = 60) {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  return value.length > limit ? `${value.slice(0, limit - 1).trimEnd()}…` : value
}

function listNames(names) {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : names[0] || ''
}

// Os ícones são decorativos; o nome das redes vai em texto para o leitor de tela.
function NetGlyphs({ platforms, size = 14 }) {
  if (!platforms.length) return <span className="ds-meta">Rede não informada</span>
  return <span className="dash-inline">
    {platforms.map(platform => <NetworkGlyph network={platform} size={size} key={platform} />)}
    <span className="ds-sr-only">{listNames(platforms.map(platform => PLATFORM_LABELS[platform] || platform))}</span>
  </span>
}

// Mensagem de erro seguida de outra frase: garante o ponto final entre as duas.
function sentence(text) {
  const value = String(text || '').trim()
  return !value || /[.!?…]$/.test(value) ? value : `${value}.`
}

function statFigure(loading, error, value) {
  if (loading) return { text: '—', state: undefined }
  if (error) return { text: '—', state: 'unavailable' }
  return { text: String(value), state: undefined }
}

// Cada parte do Início abre com um ícone e a área a que pertence (Calendário, Relatórios…),
// num painel próprio, para ficar bem separada das outras.
function SectionHead({ icon, area, tone = 'neutral', titleId, title, description, actions, focusable = false }) {
  return <div className="ds-head dash-sechead">
    <span className="dash-sechead__icon" data-tone={tone} aria-hidden="true"><Icon name={icon} size={20} /></span>
    <div className="ds-head__text">
      <p className="dash-sechead__area">{area}</p>
      <h2 className="ds-head__title" id={titleId} tabIndex={focusable ? -1 : undefined}>{title}</h2>
      {description && <p className="ds-head__desc">{description}</p>}
    </div>
    {actions && <div className="ds-head__actions">{actions}</div>}
  </div>
}

// O Início é um resumo: números da conta, o que precisa de atenção, o que vem a seguir e
// três números dos últimos 7 dias. Gráficos e leituras ficam em Relatórios, o histórico em
// Atividades e as conexões em Contas.
const ATTENTION_PREVIEW = 3
const UPCOMING_LIMIT = 5

export function DashboardPage({ onNavigate }) {
  const [data, setData] = useState({ posts: [], accounts: [] })
  const [postsError, setPostsError] = useState('')
  const [accountsError, setAccountsError] = useState('')
  const [analytics, setAnalytics] = useState(null)
  const [analyticsError, setAnalyticsError] = useState('')
  const [postsLoading, setPostsLoading] = useState(true)
  const [postsTruncated, setPostsTruncated] = useState({})
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [analyticsRetry, setAnalyticsRetry] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const [showAllAlerts, setShowAllAlerts] = useState(false)
  const [deletingPostId, setDeletingPostId] = useState(null)
  const [alertError, setAlertError] = useState('')
  const { confirm, confirmDialog } = useConfirm()
  const serverDown = useServerDown()
  // Depois de excluir um alerta, o foco vai para o alerta seguinte (ou o anterior, ou o próximo título),
  // em vez de cair no início da página junto com o botão que sumiu.
  const [focusAfterRemoval, setFocusAfterRemoval] = useState(null)
  const attentionListRef = useRef(null)

  useEffect(() => {
    let active = true
    setPostsLoading(true)
    setAccountsLoading(true)
    setPostsError('')
    setAccountsError('')
    Promise.all(DASHBOARD_STATUSES.map(status => apiFetch(`/api/posts?status=${status}&limit=100`)))
      .then(results => {
        if (!active) return
        const byId = new Map()
        results.forEach(result => (Array.isArray(result?.posts) ? result.posts : []).forEach(post => byId.set(post.id, post)))
        setData(current => ({ ...current, posts: [...byId.values()] }))
        setPostsTruncated(Object.fromEntries(DASHBOARD_STATUSES.map((status, index) => [status, Boolean(results[index]?.hasMore)])))
      })
      .catch(error => { if (active) setPostsError(error.message) })
      .finally(() => { if (active) setPostsLoading(false) })
    apiFetch('/api/accounts')
      .then(accounts => { if (active) setData(current => ({ ...current, accounts: Array.isArray(accounts?.data) ? accounts.data : Array.isArray(accounts?.accounts) ? accounts.accounts : [] })) })
      .catch(error => { if (active) setAccountsError(error.message) })
      .finally(() => { if (active) setAccountsLoading(false) })
    return () => { active = false }
  }, [reloadKey])

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
      apiFetch(`/api/posts/analytics?days=${SUMMARY_DAYS}`, { timeoutMs: 45_000 })
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
  }, [analyticsRetry])

  const isScheduled = post => post.status === 'scheduled' || post.status === 'agendado'
  const hasDate = post => !Number.isNaN(new Date(postDateValue(post)).getTime())
  const scheduled = data.posts.filter(isScheduled).length
  const reviewAlerts = data.posts
    .filter(post => FAILURE_STATUSES.includes(post.status))
    .map(post => ({ post, diagnosis: failureDiagnosis(post) }))
    .filter(({ diagnosis }) => diagnosis.retryable)
  const shownAlerts = showAllAlerts ? reviewAlerts : reviewAlerts.slice(0, ATTENTION_PREVIEW)
  const datedUpcoming = data.posts
    .filter(post => isScheduled(post) && hasDate(post))
    .sort((a, b) => new Date(postDateValue(a)) - new Date(postDateValue(b)))
  const undatedUpcoming = data.posts.filter(post => isScheduled(post) && !hasDate(post))
  const upcoming = [...datedUpcoming, ...undatedUpcoming].slice(0, UPCOMING_LIMIT)
  const hiddenUpcoming = datedUpcoming.length + undatedUpcoming.length - upcoming.length
  const scheduledWithoutDate = undatedUpcoming.length
  const dashboardError = postsError || accountsError
  const connectedPlatforms = new Set(data.accounts.map(account => account.platform).filter(Boolean)).size
  const analyticsRows = Array.isArray(analytics?.metrics) ? analytics.metrics.filter(row => row.metrics) : []
  const totalViews = analyticsRows.reduce((total, row) => total + metricValue(row.metrics, 'views'), 0)
  const totalEngagement = analyticsRows.reduce((total, row) => total + engagementValue(row.metrics), 0)
  const engagementRate = totalViews > 0 ? (totalEngagement / totalViews) * 100 : 0
  const onboardingIncomplete = !accountsLoading && !postsLoading && !postsError && !accountsError && (data.accounts.length === 0 || data.posts.length === 0 || !data.posts.some(post => ['published', 'publicado', 'scheduled', 'agendado'].includes(post.status)))
  const isEmptyWorkspace = !accountsLoading && !postsLoading && !postsError && !accountsError && data.accounts.length === 0 && data.posts.length === 0

  function reloadAll() {
    setReloadKey(key => key + 1)
    setAnalyticsRetry(key => key + 1)
  }

  function reviewFailure(post) {
    const opened = openInComposer({
      draft: composerDraftFromPost(post, { publishNow: true, sourceFailureId: post.id }),
      media: mediaItemsOf(post).map(item => mediaSelectionOf(item)),
    })
    if (!opened) { setAlertError('O navegador não deixou guardar o rascunho. Libere espaço do site e tente de novo.'); return }
    onNavigate('agendador')
  }

  async function deleteFailure(post) {
    const label = postTitle(post)
    const ok = await confirm({
      title: 'Excluir esta publicação com falha?',
      description: 'Ela será excluída de vez e não poderá ser reenviada.',
      details: label,
      confirmLabel: 'Excluir',
    })
    if (!ok) return
    const index = shownAlerts.findIndex(item => item.post.id === post.id)
    setDeletingPostId(post.id)
    setAlertError('')
    try {
      await apiFetch(`/api/posts/${post.id}`, { method: 'DELETE' })
      setData(current => ({ ...current, posts: current.posts.filter(item => item.id !== post.id) }))
      setFocusAfterRemoval(Math.max(index, 0))
    } catch (error) {
      setAlertError(error.message)
    } finally {
      setDeletingPostId(null)
    }
  }

  useEffect(() => {
    if (focusAfterRemoval == null) return
    const items = attentionListRef.current ? [...attentionListRef.current.children] : []
    const target = items[focusAfterRemoval] || items[focusAfterRemoval - 1]
    const control = target?.querySelector('button')
    if (control) control.focus()
    else document.getElementById(attentionListRef.current ? 'dash-atencao-title' : 'dash-next-title')?.focus()
    setFocusAfterRemoval(null)
  }, [focusAfterRemoval])

  const failedCount = data.posts.filter(post => FAILURE_STATUSES.includes(post.status)).length
  const anyTruncated = Object.values(postsTruncated).some(Boolean)
  const publicationsFigure = statFigure(postsLoading, postsError, `${data.posts.length}${anyTruncated ? '+' : ''}`)
  const scheduledFigure = statFigure(postsLoading, postsError, `${scheduled}${postsTruncated.scheduled ? '+' : ''}`)
  const failuresFigure = statFigure(postsLoading, postsError, `${failedCount}${postsTruncated.error || postsTruncated.partial ? '+' : ''}`)
  const accountsFigure = statFigure(accountsLoading, accountsError, data.accounts.length)
  const attentionCount = reviewAlerts.length + (scheduledWithoutDate ? 1 : 0)

  return <div className="ds-page dash" data-ds-root>
    <header className="ds-pagehead">
      <div className="ds-pagehead__text">
        <p className="ds-eyebrow">{todayLabel()}</p>
        <h1 className="ds-pagehead__title">Início</h1>
        <p className="ds-pagehead__lede">O que vem a seguir e o que precisa da sua atenção.</p>
      </div>
    </header>

    {dashboardError && !serverDown && <div className="ds-alert dash-banner" data-tone="danger" role="alert">
      <Icon name="alertCircle" className="ds-alert__icon" />
      <p className="ds-alert__title">Parte das informações não carregou</p>
      <p className="ds-alert__text">{dashboardError}</p>
      <div className="ds-alert__actions"><button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={reloadAll} disabled={postsLoading || accountsLoading}><Icon name="refresh" size={16} />Tentar novamente</button></div>
    </div>}

    {isEmptyWorkspace
      ? <OnboardingChecklist variant="empty" accounts={data.accounts} posts={data.posts} onNavigate={onNavigate} />
      : <>
        {onboardingIncomplete && <OnboardingChecklist accounts={data.accounts} posts={data.posts} onNavigate={onNavigate} />}

        <section className="dash-panel dash-status" aria-labelledby="dash-status-title" aria-busy={postsLoading || accountsLoading}>
          <SectionHead icon="user" area="Visão geral" titleId="dash-status-title" title="Resumo da conta" />
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
                {postsLoading ? 'Carregando…' : postsError ? 'Indisponível agora' : reviewAlerts.length ? <a className="ds-link" href="#dash-atencao">Revisar abaixo</a> : failedCount ? <button type="button" className="ds-link dash-linkbtn" onClick={() => onNavigate('atividade')}>Ver em Atividades</button> : 'Nenhuma falha registrada'}
              </p>
            </div>
            <div className="ds-stat">
              <p className="ds-stat__label">Contas conectadas</p>
              <p className="ds-stat__value" data-state={accountsFigure.state}>{accountsFigure.text}</p>
              <p className="ds-stat__caption">{accountsLoading ? 'Carregando…' : accountsError ? 'Indisponível agora' : `${connectedPlatforms} de ${DASHBOARD_PLATFORMS.length} redes`}</p>
            </div>
          </div>
        </section>

        {attentionCount > 0 && <section className="dash-panel dash-attn" data-tone="danger" id="dash-atencao" aria-labelledby="dash-atencao-title">
          <SectionHead icon="alertTriangle" area="Atenção" tone="danger" titleId="dash-atencao-title" focusable
            title={<>Precisa de atenção <span className="ds-badge" data-tone="danger">{attentionCount} {attentionCount === 1 ? 'item' : 'itens'}</span></>} />
          <ul className="ds-list" ref={attentionListRef}>
            {shownAlerts.map(({ post, diagnosis }) => {
              const deleting = deletingPostId === post.id
              const platforms = postPlatforms(post)
              return <li className="ds-list-item dash-attn__item" key={post.id} aria-busy={deleting || undefined}>
                <span className="dash-attn__mark" aria-hidden="true"><Icon name="alertCircle" /></span>
                <div className="ds-list-item__body">
                  <p className="ds-list-item__title dash-attn__title" title={postTitle(post)}>{postTitle(post)}</p>
                  <p className="ds-list-item__meta dash-attn__meta">
                    <NetGlyphs platforms={platforms} />
                    <span className="ds-num">{formatPostDate(postDateValue(post))}</span>
                    <span className="ds-badge" data-tone={diagnosis.className === 'is-network' ? 'info' : 'danger'}>{diagnosis.label}</span>
                  </p>
                  <p className="dash-attn__reason" title={diagnosis.reason}>{diagnosis.reason}</p>
                  {deleting && <p className="ds-meta dash-inline dash-attn__busy" role="status"><span className="ds-spinner" aria-hidden="true" />Excluindo…</p>}
                </div>
                <div className="ds-list-item__trail">
                  <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={() => reviewFailure(post)} disabled={deleting}>
                    <Icon name="compose" size={16} />Revisar no editor
                  </button>
                  <OverflowMenu label={`Mais ações para “${shortText(postTitle(post))}”`} sheetTitle="Mais ações" items={[{ label: 'Excluir alerta', icon: 'trash', danger: true, disabled: deleting, onSelect: () => deleteFailure(post) }]} />
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
          {reviewAlerts.length > ATTENTION_PREVIEW && <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm dash-attn__more" onClick={() => setShowAllAlerts(current => !current)} aria-expanded={showAllAlerts}>
            {showAllAlerts ? 'Mostrar menos' : `Mostrar mais ${reviewAlerts.length - ATTENTION_PREVIEW}`}<Icon name={showAllAlerts ? 'chevronUp' : 'chevronDown'} size={16} />
          </button>}
          <p className="dash-attn__note" role="status">{alertError ? `Não foi possível excluir o alerta. ${alertError === DEFAULT_API_MESSAGE ? 'Tente de novo.' : sentence(alertError)}` : ''}</p>
        </section>}

        <section className="dash-panel dash-next" aria-labelledby="dash-next-title">
          <SectionHead icon="calendar" area="Calendário" tone="gold" titleId="dash-next-title" focusable title="Próximos agendamentos"
            actions={<button type="button" className="ds-go" onClick={() => onNavigate('calendario')}>Ver calendário<Icon name="arrow" /></button>} />
          {postsLoading
            ? <div aria-busy="true">
              <p className="ds-sr-only" aria-live="polite">Carregando publicações...</p>
              <div className="dash-next__list">{[1, 2, 3].map(item => <div className="dash-next__item" key={item}><span className="ds-skel" style={{ width: 48, height: 52, borderRadius: 10 }} /><span className="dash-next__body"><span className="ds-skel" style={{ width: '40%' }} /><span className="ds-skel" style={{ width: '80%' }} /></span></div>)}</div>
            </div>
            : postsError
              ? <p className="ds-alert ds-alert--quiet" aria-live="polite">Não foi possível carregar a agenda. Os agendamentos continuam valendo.</p>
              : upcoming.length
                ? <>
                  <ol className="dash-next__list">
                    {upcoming.map(post => {
                      const dated = hasDate(post)
                      const date = new Date(postDateValue(post))
                      const day = dated ? String(date.getDate()).padStart(2, '0') : '—'
                      const time = dated ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
                      const text = postText(post) || 'Publicação sem texto'
                      return <li className="dash-next__item" key={post.id}>
                        <span className="dash-date" aria-hidden="true"><span className="dash-date__day">{day}</span><span className="dash-date__month">{dated ? MONTHS[date.getMonth()] : 'sem data'}</span></span>
                        <div className="dash-next__body">
                          <p className="ds-meta dash-next__when">
                            <span className="ds-num">{dated ? `${WEEKDAYS[date.getDay()]}, ${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · ${time}` : 'Sem horário definido'}</span>
                            <NetGlyphs platforms={postPlatforms(post)} />
                          </p>
                          <p className="dash-next__title" title={text}>{text}</p>
                        </div>
                      </li>
                    })}
                  </ol>
                  {hiddenUpcoming > 0 && <p className="ds-meta dash-next__more">E mais {hiddenUpcoming} {hiddenUpcoming === 1 ? 'agendamento' : 'agendamentos'} no calendário.</p>}
                </>
                : <div className="ds-empty ds-empty--quiet">
                  <p className="ds-empty__text">Nenhum agendamento próximo. Crie uma publicação para manter suas redes ativas.</p>
                  <div className="ds-empty__actions"><button type="button" className="ds-go" onClick={() => onNavigate('agendador')}>Agendar agora<Icon name="arrow" /></button></div>
                </div>}
        </section>

        <section className="dash-panel dash-week" aria-labelledby="dash-week-title" aria-busy={analyticsLoading || undefined}>
          <SectionHead icon="chart" area="Relatórios" tone="info" titleId="dash-week-title" title={`Últimos ${SUMMARY_DAYS} dias`}
            description="Publicações com métricas disponíveis nas redes conectadas."
            actions={<button type="button" className="ds-go" onClick={() => onNavigate('analytics')}>Abrir Relatórios<Icon name="arrow" /></button>} />
          {analyticsLoading && !analytics
            ? <div className="dash-week__figs"><p className="ds-sr-only" aria-live="polite">Carregando métricas…</p>{[1, 2, 3].map(item => <span className="ds-skel" key={item} style={{ height: 52 }} />)}</div>
            : analyticsError && !analytics
              ? <div className="dash-week__state">
                <p>{sentence(analyticsError)} Uma nova tentativa acontece automaticamente.</p>
                <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={() => setAnalyticsRetry(key => key + 1)}><Icon name="refresh" size={16} />Tentar agora</button>
              </div>
              : analyticsRows.length
                ? <dl className="dash-week__figs">
                  <div><dt>Visualizações</dt><dd className="ds-num">{compactNumber(totalViews)}</dd></div>
                  <div><dt>Interações</dt><dd className="ds-num">{compactNumber(totalEngagement)}</dd></div>
                  <div><dt>Taxa de interação</dt><dd className="ds-num">{engagementRate.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</dd></div>
                </dl>
                : <p className="ds-hint dash-week__state">Nenhuma publicação com métricas nos últimos {SUMMARY_DAYS} dias.</p>}
        </section>
      </>}
    {confirmDialog}
  </div>
}
