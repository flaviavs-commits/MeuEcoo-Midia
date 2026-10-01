import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { useApiResource } from '../hooks/use-api-resource.js'
import { Icon, NetworkGlyph } from '../components/ui/icon.jsx'
import { useToast } from '../components/ui/toast.jsx'
import { Select } from '../components/ui/select.jsx'
import { useConfirm } from '../components/ui/confirm-dialog.jsx'
import { FilterGroup, FilterOption, FilterSheet, FiltersButton } from '../components/ui/filters.jsx'
import { useIsPhone } from '../lib/breakpoints.js'
import { getPlan } from '../lib/plans.js'

const providers = [
  { platform: 'facebook', provider: 'meta', label: 'Facebook', description: 'Páginas do Facebook', placeholder: 'Cole o link da Página do Facebook' },
  { platform: 'instagram', provider: 'instagram', label: 'Instagram', description: 'Contas profissionais', placeholder: 'Cole o link do perfil profissional' },
  { platform: 'youtube', provider: 'google', label: 'YouTube', description: 'Canais de vídeo', placeholder: 'Cole o link do canal' },
  { platform: 'tiktok', provider: 'tiktok', label: 'TikTok', description: 'Contas de criador', placeholder: 'Cole o link do perfil' },
]
const DEFAULT_API_MESSAGE = 'Não foi possível concluir a operação'
// Estado do token de cada conta: palavra + ícone, nunca só a cor.
const TOKEN_TONES = { valid: 'ok', expiring: 'warning', expired: 'failed', error: 'failed', missing: 'warning' }
const TOKEN_ICONS = { valid: 'checkCircle', expiring: 'clock', expired: 'alertCircle', error: 'alertCircle', missing: 'alertTriangle' }
const TOKEN_STATUS_LABELS = { valid: 'Token válido', expiring: 'Token expirando', expired: 'Token expirado', error: 'Erro no token', missing: 'Sem token' }
const HEALTH_LABELS = { up: 'API operacional', down: 'API indisponível', unknown: 'Saúde não verificada' }
const STATUS_FILTERS = [['all', 'Todos os status'], ['healthy', 'Saudáveis'], ['attention', 'Precisam de atenção']]
const NOTICE_ICONS = { success: 'checkCircle', warning: 'alertTriangle', danger: 'alertCircle', info: 'info' }
// Domínios oficiais de cada rede, para reconhecer de qual rede é o link colado.
const NETWORK_HOSTS = [
  ['instagram', /(^|\.)instagram\.com$/],
  ['facebook', /(^|\.)(facebook\.com|fb\.com|fb\.me)$/],
  ['youtube', /(^|\.)(youtube\.com|youtu\.be)$/],
  ['tiktok', /(^|\.)tiktok\.com$/],
]

function accountTokenStatus(account) {
  const statuses = (account.tokens || []).map(token => token.status).filter(Boolean)
  if (statuses.includes('expired') || statuses.includes('error')) return 'error'
  if (statuses.includes('expiring')) return 'expiring'
  return statuses.length ? 'valid' : 'missing'
}

// O texto separa "expirado" de "erro"; a ação pedida é a mesma nos dois casos (reconectar).
function tokenDisplayStatus(account) {
  const status = accountTokenStatus(account)
  return status === 'error' && (account.tokens || []).some(token => token.status === 'expired') ? 'expired' : status
}

function tokenDetail(account, status) {
  const expiry = (account.tokens || []).map(token => token.expiresAt).find(Boolean)
  const date = expiry ? new Date(expiry) : null
  const day = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('pt-BR') : ''
  if (status === 'valid') return day ? `Válido até ${day}` : ''
  if (status === 'expiring') return day ? `Expira em ${day}` : 'Reconecte para renovar'
  if (status === 'expired' && day) return `Expirou em ${day}`
  return 'Reconecte a conta'
}

function accountProfileUrl(account) {
  const value = account.profileUrl || account.profile_url || account.handle || ''
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}

// "https://www.instagram.com/meuecoomidia/" aparece como "instagram.com/meuecoomidia"; o endereço completo fica no title.
function displayUrl(url) {
  return url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')
}

function shortDate(value) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('pt-BR') : ''
}

// Foto do perfil vinda da rede; se o endereço falhar ou expirar, ficam as iniciais.
function AccountAvatar({ src, name }) {
  const [failed, setFailed] = useState(false)
  // "instagram.com/meuecoomidia" vira "M": as iniciais saem do perfil, não do domínio.
  const text = String(name || '')
  const base = text.includes('/') ? text.split('/').filter(Boolean)[1] || text : text
  const initials = base.replace(/^@/, '').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?'
  return <span className="ds-avatar ds-avatar--40 acc-acct__avatar" aria-hidden="true">
    {src && !failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /> : initials}
  </span>
}

function networkFromLink(value) {
  const text = String(value || '').trim()
  if (!text || /\s/.test(text)) return ''
  try {
    const { hostname } = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    return NETWORK_HOSTS.find(([, pattern]) => pattern.test(hostname.toLowerCase()))?.[0] || ''
  } catch {
    return ''
  }
}

export function AccountsPage({ onNavigate, user }) {
  const [hasLoaded, setHasLoaded] = useState(false)
  const load = useCallback(() => apiFetch('/api/accounts').then(data => data.data || []), [])
  // `loadError` é só da lista; o formulário e as ações mostram as próprias mensagens, perto de onde acontecem.
  const { value: accounts, loading, error: loadError, reload } = useApiResource(load, [])
  const phone = useIsPhone()
  const [platform, setPlatform] = useState('facebook')
  const [accountName, setAccountName] = useState('')
  const [accountSearch, setAccountSearch] = useState('')
  const [accountStatusFilter, setAccountStatusFilter] = useState('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const connectingRef = useRef(false)
  const [disconnectingId, setDisconnectingId] = useState(null)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')
  const [connectionNotice, setConnectionNotice] = useState(null)
  const [platformHealth, setPlatformHealth] = useState({})
  const [healthLoading, setHealthLoading] = useState(true)
  const [healthFailed, setHealthFailed] = useState(false)
  const accountInputRef = useRef(null)
  const notify = useToast()
  const { confirm, confirmDialog } = useConfirm()
  const plan = getPlan(user?.plan)
  const connectionLimit = user?.planUnrestricted ? Infinity : (plan.maxConnections || providers.length)
  const allowedPlatforms = useMemo(() => new Set(user?.planUnrestricted || !Array.isArray(user?.allowedPlatforms) || !user.allowedPlatforms.length
    ? providers.map(item => item.platform)
    : user.allowedPlatforms), [user?.planUnrestricted, user?.allowedPlatforms])
  const accountsByPlatform = platformName => accounts.filter(account => account.platform === platformName)
  // A busca cobre nome, identificador e rede; o status separa contas saudáveis das que pedem reconexão.
  const matchesFilters = account => {
    const query = accountSearch.trim().toLowerCase()
    const label = `${account.name || ''} ${account.handle || ''} ${account.platform || ''}`.toLowerCase()
    const tokenStatus = accountTokenStatus(account)
    const matchesSearch = !query || label.includes(query)
    const matchesStatus = accountStatusFilter === 'all'
      || (accountStatusFilter === 'healthy' && tokenStatus === 'valid')
      || (accountStatusFilter === 'attention' && ['error', 'expiring', 'missing'].includes(tokenStatus))
    return matchesSearch && matchesStatus
  }
  const attentionAccounts = accounts.filter(account => ['error', 'expiring', 'missing'].includes(accountTokenStatus(account))).length
  const connectedPlatforms = new Set(accounts.map(account => account.platform)).size
  const healthyApis = providers.filter(provider => platformHealth[provider.platform] === 'up').length

  useEffect(() => { if (!loading) setHasLoaded(true) }, [loading])
  const firstLoad = loading && !hasLoaded
  // Sem uma lista carregada, números e blocos ficam em "—" em vez de afirmar "nenhuma conta".
  const unknown = firstLoad || (Boolean(loadError) && !accounts.length)

  useEffect(() => {
    if (allowedPlatforms.has(platform)) return
    const firstAllowed = providers.find(item => allowedPlatforms.has(item.platform))
    if (firstAllowed) setPlatform(firstAllowed.platform)
  }, [platform, allowedPlatforms])

  // Se a verificação falhar, o resumo diz que não verificou, em vez de "0 APIs disponíveis".
  const loadHealth = useCallback(() => apiFetch('/api/platform-health')
    .then(data => { setPlatformHealth(data.platforms || {}); setHealthFailed(false) })
    .catch(() => { setPlatformHealth({}); setHealthFailed(true) })
    .finally(() => setHealthLoading(false)), [])
  const refresh = useCallback(() => { reload().catch(() => {}); loadHealth() }, [reload, loadHealth])

  useEffect(() => {
    window.addEventListener('focus', refresh)
    loadHealth()
    return () => window.removeEventListener('focus', refresh)
  }, [refresh, loadHealth])

  // A volta da autorização recarrega a página no topo: o resultado aparece ali, não lá embaixo no formulário.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === 'true') {
      setConnectionNotice({ tone: 'success', text: 'Conta conectada e sincronizada com sucesso.', where: 'top' })
      notify('Conta sincronizada com sucesso.')
    } else if (params.get('error') === 'oauth_cancelled') {
      setConnectionNotice({ tone: 'warning', text: 'A autorização foi cancelada ou expirou. Nenhuma conta foi conectada.', where: 'top' })
    } else if (params.get('error')) {
      setConnectionNotice({ tone: 'danger', text: 'A autorização não foi concluída. Nenhuma conta foi sincronizada.', where: 'top' })
    }
    if (params.has('connected') || params.has('error')) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [notify])

  async function connect() {
    // Enter repetido ou clique duplo enquanto a janela abre não inicia uma segunda autorização.
    if (connectingRef.current) return
    const name = accountName.trim()

    if (!name) {
      const message = 'Informe o link da Página para continuar.'
      setFormError(message)
      notify(message, 'error')
      accountInputRef.current?.focus()
      return
    }

    const selected = providers.find(item => item.platform === platform)
    if (!selected || !allowedPlatforms.has(platform)) {
      const message = 'Essa rede social não está disponível nas redes escolhidas para o seu plano.'
      setFormError(message)
      notify(message, 'error')
      return
    }
    const selectedAccounts = accountsByPlatform(platform)
    const needsReconnect = selectedAccounts.some(account => accountTokenStatus(account) !== 'valid')
    if (accounts.length >= connectionLimit && !needsReconnect) {
      const message = `Seu plano permite até ${connectionLimit} contas conectadas.`
      setFormError(message)
      notify(message, 'error')
      return
    }
    connectingRef.current = true
    const popup = window.open('', `oauth_${Date.now()}`, 'width=640,height=720')
    setConnecting(true)
    setFormError('')
    try {
      const params = new URLSearchParams({ accountName: name, platform, returnTo: window.location.pathname })
      const data = await apiFetch(`/auth/${selected.provider}?${params}`)
      let opened = Boolean(popup && !popup.closed)
      if (opened) popup.location.href = data.authUrl
      else opened = Boolean(window.open(data.authUrl, '_blank', 'width=640,height=720'))
      if (!opened) {
        const message = 'O navegador bloqueou a janela de autorização. Permita pop-ups para este site e tente novamente.'
        setFormError(message)
        notify(message, 'error')
        return
      }
      setAccountName('')
      setConnectionNotice({ tone: 'info', text: 'A autorização foi aberta em outra janela. Ao concluir, volte para cá e a conta será atualizada automaticamente.', where: 'form' })
      notify('Janela de autorização aberta.')
    } catch (e) {
      if (popup && !popup.closed) popup.close()
      // O início do OAuth responde { error, detail } (ex.: 402 do limite: o motivo em `error`,
      // o que não aconteceu em `detail`). O apiFetch não lê `error`, então a frase inteira vem daqui.
      const serverDetail = e instanceof ApiError
        ? [e.body?.error, e.body?.detail].filter(value => typeof value === 'string' && value.trim()).join(' ')
        : ''
      const message = e instanceof ApiError
        ? (e.message === DEFAULT_API_MESSAGE && serverDetail ? serverDetail : e.message)
        : 'Não foi possível iniciar a conexão.'
      setFormError(message)
      notify(message, 'error')
    } finally {
      connectingRef.current = false
      setConnecting(false)
    }
  }

  function openAddAccount(provider, connected, tokenStatus) {
    setPlatform(provider.platform)
    // Reconexão: preenche a conta que realmente precisa ser reconectada.
    const toReconnect = connected.find(account => accountTokenStatus(account) !== 'valid') || connected[0]
    setAccountName(connected.length && tokenStatus !== 'valid'
      ? toReconnect?.handle || toReconnect?.name || ''
      : '')
    requestAnimationFrame(() => {
      accountInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      accountInputRef.current?.focus()
    })
  }

  async function remove(id, name) {
    const ok = await confirm({
      title: `Desconectar ${name}?`,
      description: 'Para voltar a publicar nesta conta, será preciso conectá-la de novo.',
      confirmLabel: 'Desconectar',
      tone: 'danger',
      icon: 'plug',
    })
    if (!ok) return
    setDisconnectingId(id)
    setActionError('')
    try {
      await apiFetch(`/api/accounts/${id}`, { method: 'DELETE' })
      notify('Conta desconectada.')
      // A desconexão já valeu: se a lista não recarregar, o aviso de carga da página cuida disso.
      reload().catch(() => {})
      loadHealth().catch(() => {})
    }
    catch (e) { setActionError(e.message); notify(e.message, 'error') }
    finally { setDisconnectingId(null) }
  }

  const selectedProvider = providers.find(item => item.platform === platform)
  const filtersActive = Boolean(accountSearch.trim()) || accountStatusFilter !== 'all'
  const filteredCount = accounts.filter(matchesFilters).length
  const clearFilters = () => { setAccountSearch(''); setAccountStatusFilter('all') }
  const linkNetwork = networkFromLink(accountName)
  const suggestedProvider = linkNetwork && linkNetwork !== platform && allowedPlatforms.has(linkNetwork)
    ? providers.find(item => item.platform === linkNetwork)
    : null

  const notice = where => connectionNotice?.where === where && <div className="ds-alert acc-notice" data-tone={connectionNotice.tone} role="status">
    <Icon name={NOTICE_ICONS[connectionNotice.tone] || 'info'} className="ds-alert__icon" />
    <p className="ds-alert__text">{connectionNotice.text}</p>
    <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-btn--sm ds-alert__close" onClick={() => setConnectionNotice(null)} aria-label="Dispensar aviso"><Icon name="close" size={16} /></button>
  </div>

  return <div className="ds-page acc" data-ds-root>
    <header className="ds-pagehead acc-head">
      <div className="ds-pagehead__text">
        <p className="ds-eyebrow">Integrações</p>
        <h1 className="ds-pagehead__title">Contas</h1>
        <p className="ds-pagehead__lede">Conecte as redes que o Meu Ecoo usa para publicar, responder comentários e medir resultados.</p>
      </div>
    </header>

    {notice('top')}

    <section className="acc-glance" aria-label="Resumo das integrações">
      <div className="ds-stats" style={{ '--cols': 4 }}>
        <div className="ds-stat"><p className="ds-stat__label">Contas conectadas</p><p className="ds-stat__value ds-stat__value--md">{unknown ? '—' : <>{accounts.length}{Number.isFinite(connectionLimit) && <span className="ds-stat__unit">/{connectionLimit}</span>}</>}</p><p className="ds-stat__caption">{firstLoad ? 'Carregando…' : unknown ? 'Indisponível agora' : `${connectedPlatforms} ${connectedPlatforms === 1 ? 'rede em uso' : 'redes em uso'}`}</p></div>
        <div className="ds-stat"><p className="ds-stat__label">Precisam de atenção</p><p className="ds-stat__value ds-stat__value--md" data-tone={!unknown && attentionAccounts ? 'danger' : undefined}>{unknown ? '—' : attentionAccounts}</p><p className="ds-stat__caption">Token com erro, expirando ou ausente</p></div>
        <div className="ds-stat"><p className="ds-stat__label">APIs disponíveis</p><p className="ds-stat__value ds-stat__value--md">{healthLoading || healthFailed ? '—' : <>{healthyApis}<span className="ds-stat__unit">/{providers.length}</span></>}</p><p className="ds-stat__caption">{healthLoading ? 'Verificando agora' : healthFailed ? 'Não foi possível verificar' : 'Última verificação concluída'}</p></div>
        <div className="ds-stat"><p className="ds-stat__label">Plataformas do plano</p><p className="ds-stat__value ds-stat__value--md">{allowedPlatforms.size}</p><p className="ds-stat__caption">{user?.planUnrestricted ? 'Acesso administrativo' : plan.name}</p></div>
      </div>
    </section>

    <section className="acc-nets" aria-labelledby="acc-nets-title">
      <div className="acc-nets__head">
        <h2 className="acc-nets__title" id="acc-nets-title">Suas redes</h2>
        {accounts.length > 0 && (phone
          ? <div className="ds-searchrow acc-filters">
              <label className="ds-inputwrap">
                <Icon name="search" />
                <input className="ds-input" type="search" value={accountSearch} onChange={event => setAccountSearch(event.target.value)} placeholder="Buscar conta..." aria-label="Buscar conta" />
              </label>
              <FiltersButton count={accountStatusFilter === 'all' ? 0 : 1} open={filtersOpen} onClick={() => setFiltersOpen(true)} />
            </div>
          : <div className="ds-filterbar acc-filters">
              <label className="ds-inputwrap acc-filters__search">
                <Icon name="search" />
                <input className="ds-input" type="search" value={accountSearch} onChange={event => setAccountSearch(event.target.value)} placeholder="Buscar por nome ou rede..." aria-label="Buscar conta" />
              </label>
              <Select className="acc-filters__status" value={accountStatusFilter} onChange={setAccountStatusFilter} aria-label="Filtrar status das contas" options={STATUS_FILTERS.map(([value, label]) => ({ value, label }))} />
            </div>)}
      </div>

      {loadError && <div className="ds-alert acc-alert" data-tone={accounts.length ? 'warning' : 'danger'} role="alert">
        <Icon name={accounts.length ? 'alertTriangle' : 'alertCircle'} className="ds-alert__icon" />
        <p className="ds-alert__title">{accounts.length ? 'Não foi possível atualizar suas contas' : 'Não foi possível carregar suas contas'}</p>
        <p className="ds-alert__text">{accounts.length ? 'Mostrando a última versão carregada.' : 'Nada mudou nas suas contas; só não conseguimos mostrá-las agora.'}</p>
        <div className="ds-alert__actions"><button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" disabled={loading} onClick={refresh}><Icon name="refresh" size={16} />{loading ? 'Tentando…' : 'Tentar de novo'}</button></div>
      </div>}

      {actionError && <div className="ds-alert acc-alert" data-tone="danger" role="alert">
        <Icon name="alertCircle" className="ds-alert__icon" />
        <p className="ds-alert__text">{actionError}</p>
        <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-btn--sm ds-alert__close" onClick={() => setActionError('')} aria-label="Dispensar aviso"><Icon name="close" size={16} /></button>
      </div>}

      {filtersActive && accounts.length > 0 && <p className="acc-filternote" role="status">
        <span><strong className="ds-num">{filteredCount}</strong> {filteredCount === 1 ? 'conta corresponde' : 'contas correspondem'} aos filtros.</span>
        <button type="button" className="ds-go" onClick={clearFilters}>Limpar filtros<Icon name="arrow" size={16} /></button>
      </p>}

      <div className="acc-nets__list">
        {providers.map(provider => {
          const connected = accountsByPlatform(provider.platform)
          const shown = connected.filter(matchesFilters)
          const tokenStatuses = connected.map(account => accountTokenStatus(account))
          const tokenStatus = tokenStatuses.includes('error') ? 'error' : tokenStatuses.includes('expiring') ? 'expiring' : tokenStatuses.includes('missing') ? 'missing' : tokenStatuses.includes('valid') ? 'valid' : 'missing'
          const needAttention = tokenStatuses.filter(status => status !== 'valid').length
          const healthStatus = platformHealth[provider.platform] || 'unknown'
          const platformAllowed = allowedPlatforms.has(provider.platform)
          const canReconnect = connected.some(account => accountTokenStatus(account) !== 'valid')
          const canAdd = platformAllowed && (accounts.length < connectionLimit || canReconnect)
          const actionLabel = !platformAllowed ? 'Indisponível' : !canAdd ? 'Limite atingido' : connected.length && tokenStatus !== 'valid' ? 'Reconectar' : connected.length ? 'Adicionar outra' : 'Conectar'
          // Verde só quando todas as contas da rede têm token válido.
          const statusTone = unknown || !platformAllowed || !connected.length ? 'muted' : tokenStatus === 'error' ? 'failed' : tokenStatus === 'valid' ? 'ok' : 'warning'
          const statusIcon = { ok: 'checkCircle', failed: 'alertCircle', warning: 'alertTriangle' }[statusTone] || (platformAllowed ? 'plug' : 'lock')
          const statusText = firstLoad ? 'Carregando…'
            : unknown ? 'Contas indisponíveis agora'
            : !platformAllowed ? 'Não incluída no seu plano'
            : !connected.length ? 'Nenhuma conta conectada'
            : `${connected.length} ${connected.length === 1 ? 'conta conectada' : 'contas conectadas'}${needAttention ? ` · ${needAttention} ${needAttention === 1 ? 'precisa' : 'precisam'} de reconexão` : ''}`
          const titleId = `acc-net-${provider.platform}`
          return <article className="acc-net" data-state={statusTone} data-locked={!platformAllowed || undefined} aria-labelledby={titleId} key={provider.platform}>
            <header className="acc-net__head">
              <span className="ds-icontile ds-icontile--lg acc-net__logo" aria-hidden="true"><NetworkGlyph network={provider.platform} size={24} /></span>
              <div className="acc-net__title">
                <h3 id={titleId}>{provider.label}</h3>
                <p className="ds-meta">{provider.description}</p>
              </div>
            </header>
            <p className="ds-status acc-net__status" data-status={statusTone}><Icon name={statusIcon} />{statusText}</p>
            {!unknown && shown.length > 0 && <ul className="acc-accts" aria-label={`Contas do ${provider.label}`}>
              {shown.map(account => {
                const status = tokenDisplayStatus(account)
                const detail = tokenDetail(account, status)
                const profileUrl = accountProfileUrl(account)
                const label = account.name || account.handle || account.platform
                const shownName = profileUrl && label === account.handle && /^https?:\/\//i.test(label) ? displayUrl(profileUrl) : label
                const secondary = account.name
                  ? (account.handle && !/^https?:\/\//i.test(account.handle) ? account.handle : profileUrl ? displayUrl(profileUrl) : '')
                  : ''
                const synced = shortDate(account.lastSyncAt || account.last_sync_at)
                const connectedOn = shortDate(account.criado_em || account.createdAt)
                const busy = disconnectingId === account.id
                return <li className="acc-acct" data-state={status} key={account.id}>
                  <AccountAvatar src={account.avatarUrl} name={shownName} />
                  <div className="acc-acct__who">
                    {profileUrl
                      ? <a className="acc-acct__name acc-acct__link" href={profileUrl} target="_blank" rel="noopener noreferrer" title={profileUrl}>
                          <span className="acc-acct__text">{shownName}</span><Icon name="external" size={14} /><span className="ds-sr-only"> (abre em nova aba)</span>
                        </a>
                      : <strong className="acc-acct__name"><span className="acc-acct__text">{shownName}</span></strong>}
                    {secondary && <span className="ds-meta acc-acct__text">{secondary}</span>}
                    {(synced || connectedOn) && <span className="ds-meta">{synced ? `Sincronizada em ${synced}` : `Conectada em ${connectedOn}`}</span>}
                  </div>
                  <div className="acc-acct__token">
                    <span className="ds-status" data-status={TOKEN_TONES[status] || 'muted'}><Icon name={TOKEN_ICONS[status] || 'help'} />{TOKEN_STATUS_LABELS[status] || TOKEN_STATUS_LABELS.missing}</span>
                    {detail && <span className="ds-meta">{detail}</span>}
                  </div>
                  <button type="button" className="ds-btn ds-btn--danger ds-btn--sm acc-acct__drop" disabled={busy} onClick={() => remove(account.id, shownName)} aria-label={`Desconectar ${shownName}`}>
                    {busy ? <><span className="ds-spinner" aria-hidden="true" />Desconectando…</> : 'Desconectar'}
                  </button>
                </li>
              })}
            </ul>}
            {!unknown && connected.length > 0 && !shown.length && <p className="ds-meta acc-net__none">Nenhuma conta do {provider.label} corresponde aos filtros.</p>}
            <div className="acc-net__foot">
              <button type="button" className={`ds-btn ds-btn--sm ${canAdd && connected.length && tokenStatus !== 'valid' ? 'ds-btn--primary' : 'ds-btn--secondary'}`} disabled={!canAdd || unknown} onClick={() => openAddAccount(provider, connected, tokenStatus)}>{actionLabel}</button>
              {!platformAllowed && onNavigate && <button type="button" className="ds-go acc-net__plans" onClick={() => onNavigate('perfil')}>Ver planos<Icon name="arrow" size={16} /></button>}
              <p className="ds-meta acc-net__health" data-health={healthLoading ? 'unknown' : healthStatus}>
                <span className="acc-net__dot" aria-hidden="true" />{healthLoading ? 'Verificando API…' : HEALTH_LABELS[healthStatus] || HEALTH_LABELS.unknown}
              </p>
            </div>
          </article>
        })}
      </div>
    </section>

    <section className="ds-block acc-manage" aria-labelledby="acc-manage-title">
      <div className="ds-head">
        <div className="ds-head__text">
          <h2 className="ds-head__title" id="acc-manage-title">Adicionar ou remover conta</h2>
          <p className="ds-head__desc">Cole o link da conta para conectar. Para remover, use “Desconectar” na conta, dentro do bloco da rede.</p>
        </div>
      </div>

      <div className="acc-connect" id="account-action-panel">
        <div className="acc-connect__fields">
          <div className="ds-field">
            <label className="ds-label" htmlFor="acc-platform">Plataforma</label>
            <Select id="acc-platform" value={platform} onChange={setPlatform} sheetTitle="Plataforma" options={providers.filter(item => allowedPlatforms.has(item.platform)).map(item => ({ value: item.platform, label: item.label, icon: <NetworkGlyph network={item.platform} size={16} /> }))} />
          </div>
          <div className="ds-field acc-connect__link">
            <label className="ds-label" htmlFor="acc-link">Link da Página</label>
            <input id="acc-link" ref={accountInputRef} className="ds-input" value={accountName} onChange={event => { setAccountName(event.target.value); setFormError('') }} onKeyDown={event => { if (event.key === 'Enter') connect() }} placeholder={selectedProvider?.placeholder || 'Cole o link da Página'} required />
          </div>
          <button type="button" onClick={connect} disabled={connecting} className="ds-btn ds-btn--primary acc-connect__go">{connecting ? <><span className="ds-spinner" aria-hidden="true" />Abrindo…</> : 'Conectar'}</button>
        </div>
        {suggestedProvider
          ? <p className="ds-hint acc-connect__suggest" role="status">
              <NetworkGlyph network={suggestedProvider.platform} size={16} />
              <span>Este link é do {suggestedProvider.label}, mas a plataforma escolhida é {selectedProvider?.label}.</span>
              <button type="button" className="ds-go" onClick={() => setPlatform(suggestedProvider.platform)}>Usar {suggestedProvider.label}<Icon name="arrow" size={16} /></button>
            </p>
          : <p className="ds-hint">
              {platform === 'facebook'
                ? 'No Facebook, conecte somente uma Página que você administra. Depois da autorização, escolha a Página correspondente.'
                : `Depois de colar o link, a autorização do ${selectedProvider?.label || 'provedor'} abre em outra janela.`}
            </p>}
        {formError && <div className="ds-alert" data-tone="danger" role="alert"><Icon name="alertCircle" className="ds-alert__icon" /><p className="ds-alert__text">{formError}</p></div>}
        {notice('form')}
      </div>
    </section>

    {phone && <FilterSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} value={{ status: accountStatusFilter }} emptyValue={{ status: 'all' }} onApply={next => setAccountStatusFilter(next.status)} title="Filtrar contas">
      {(draft, setDraft) => <FilterGroup title="Status do token">
        {STATUS_FILTERS.map(([value, label]) => <FilterOption key={value} selected={draft.status === value} onSelect={() => setDraft({ ...draft, status: value })}>{label}</FilterOption>)}
      </FilterGroup>}
    </FilterSheet>}
    {confirmDialog}
  </div>
}
