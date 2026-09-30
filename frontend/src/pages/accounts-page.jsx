import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { useApiResource } from '../hooks/use-api-resource.js'
import { Icon, NetworkGlyph } from '../components/ui/icon.jsx'
import { useToast } from '../components/ui/toast.jsx'
import { getPlan } from '../lib/plans.js'

const providers = [
  { platform: 'facebook', provider: 'meta', label: 'Facebook', description: 'Páginas do Facebook', placeholder: 'Cole o link da Página do Facebook' },
  { platform: 'instagram', provider: 'instagram', label: 'Instagram', description: 'Contas profissionais', placeholder: 'Cole o link do perfil profissional' },
  { platform: 'youtube', provider: 'google', label: 'YouTube', description: 'Canais de vídeo', placeholder: 'Cole o link do canal' },
  { platform: 'tiktok', provider: 'tiktok', label: 'TikTok', description: 'Contas de criador', placeholder: 'Cole o link do perfil' },
]
const DEFAULT_API_MESSAGE = 'Não foi possível concluir a operação'
const TOKEN_TONES = { valid: 'ok', expiring: 'warning', expired: 'failed', error: 'failed', missing: 'muted' }

const TOKEN_STATUS_LABELS = { valid: 'Token válido', expiring: 'Token expirando', expired: 'Token expirado', error: 'Erro no token' }
const HEALTH_LABELS = { up: 'API operacional', down: 'API indisponível', unknown: 'Saúde não verificada' }

function accountTokenStatus(account) {
  const statuses = (account.tokens || []).map(token => token.status).filter(Boolean)
  if (statuses.includes('expired') || statuses.includes('error')) return 'error'
  if (statuses.includes('expiring')) return 'expiring'
  return statuses.length ? 'valid' : 'missing'
}

function tokenExpiryText(account) {
  const expiry = (account.tokens || []).map(token => token.expiresAt).find(Boolean)
  if (!expiry) return ''
  const date = new Date(expiry)
  return Number.isNaN(date.getTime()) ? '' : `até ${date.toLocaleDateString('pt-BR')}`
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

export function AccountsPage({ onNavigate, user }) {
  const [hasLoaded, setHasLoaded] = useState(false)
  const load = useCallback(() => apiFetch('/api/accounts').then(data => data.data || []), [])
  const { value: accounts, loading, error, setError, reload } = useApiResource(load, [])
  const [platform, setPlatform] = useState('facebook')
  const [accountName, setAccountName] = useState('')
  const [accountSearch, setAccountSearch] = useState('')
  const [accountStatusFilter, setAccountStatusFilter] = useState('all')
  const [connecting, setConnecting] = useState(false)
  const [disconnectingId, setDisconnectingId] = useState(null)
  const [connectionNotice, setConnectionNotice] = useState('')
  const [platformHealth, setPlatformHealth] = useState({})
  const [healthLoading, setHealthLoading] = useState(true)
  const accountInputRef = useRef(null)
  const notify = useToast()
  const plan = getPlan(user?.plan)
  const connectionLimit = user?.planUnrestricted ? Infinity : (plan.maxConnections || providers.length)
  const allowedPlatforms = new Set(user?.planUnrestricted || !Array.isArray(user?.allowedPlatforms) || !user.allowedPlatforms.length
    ? providers.map(item => item.platform)
    : user.allowedPlatforms)
  const accountsByPlatform = platformName => accounts.filter(account => account.platform === platformName)
  // A lista mostra todas as contas; a busca cobre nome, identificador e rede.
  const visibleAccounts = accounts.filter(account => {
    const query = accountSearch.trim().toLowerCase()
    const label = `${account.name || ''} ${account.handle || ''} ${account.platform || ''}`.toLowerCase()
    const tokenStatus = accountTokenStatus(account)
    const matchesSearch = !query || label.includes(query)
    const matchesStatus = accountStatusFilter === 'all'
      || (accountStatusFilter === 'healthy' && tokenStatus === 'valid')
      || (accountStatusFilter === 'attention' && ['error', 'expiring', 'missing'].includes(tokenStatus))
    return matchesSearch && matchesStatus
  })
  const attentionAccounts = accounts.filter(account => ['error', 'expiring', 'missing'].includes(accountTokenStatus(account))).length
  const connectedPlatforms = new Set(accounts.map(account => account.platform)).size
  const healthyApis = providers.filter(provider => platformHealth[provider.platform] === 'up').length

  useEffect(() => { if (!loading) setHasLoaded(true) }, [loading])
  const firstLoad = loading && !hasLoaded

  useEffect(() => {
    if (allowedPlatforms.has(platform)) return
    const firstAllowed = providers.find(item => allowedPlatforms.has(item.platform))
    if (firstAllowed) setPlatform(firstAllowed.platform)
  }, [platform, user?.allowedPlatforms, user?.planUnrestricted])

  const loadHealth = useCallback(() => apiFetch('/api/platform-health').then(data => setPlatformHealth(data.platforms || {})).catch(() => setPlatformHealth({})).finally(() => setHealthLoading(false)), [])

  useEffect(() => {
    const refreshAfterAuthorization = () => { reload().catch(() => {}); loadHealth() }
    window.addEventListener('focus', refreshAfterAuthorization)
    loadHealth()
    return () => window.removeEventListener('focus', refreshAfterAuthorization)
  }, [reload, loadHealth])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === 'true') {
      setConnectionNotice('Conta conectada e sincronizada com sucesso.')
      notify('Conta sincronizada com sucesso.')
    } else if (params.get('error')) {
      setConnectionNotice('A autorização não foi concluída. Nenhuma conta foi sincronizada.')
    }
    if (params.has('connected') || params.has('error')) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [notify])

  async function connect() {
    const name = accountName.trim()

    if (!name) {
      const message = 'Informe o link da Página para continuar.'
      setError(message)
      notify(message, 'error')
      accountInputRef.current?.focus()
      return
    }

    const selected = providers.find(item => item.platform === platform)
    if (!selected || !allowedPlatforms.has(platform)) {
      const message = 'Essa rede social não está disponível nas redes escolhidas para o seu plano.'
      setError(message)
      notify(message, 'error')
      return
    }
    const selectedAccounts = accountsByPlatform(platform)
    const needsReconnect = selectedAccounts.some(account => accountTokenStatus(account) !== 'valid')
    if (accounts.length >= connectionLimit && !needsReconnect) {
      const message = `Seu plano permite até ${connectionLimit} contas conectadas.`
      setError(message)
      notify(message, 'error')
      return
    }
    const popup = window.open('', `oauth_${Date.now()}`, 'width=640,height=720')
    setConnecting(true)
    setError('')
    try {
      const params = new URLSearchParams({ accountName: name, platform, returnTo: window.location.pathname })
      const data = await apiFetch(`/auth/${selected.provider}?${params}`)
      let opened = Boolean(popup && !popup.closed)
      if (opened) popup.location.href = data.authUrl
      else opened = Boolean(window.open(data.authUrl, '_blank', 'width=640,height=720'))
      if (!opened) {
        const message = 'O navegador bloqueou a janela de autorização. Permita pop-ups para este site e tente novamente.'
        setError(message)
        notify(message, 'error')
        return
      }
      setAccountName('')
      setConnectionNotice('A autorização foi aberta em outra janela. Ao concluir, volte para cá e a conta será atualizada automaticamente.')
      notify('Janela de autorização aberta.')
    } catch (e) {
      if (popup && !popup.closed) popup.close()
      // O início do OAuth responde { error, detail }; o apiFetch só lê
      // erro/message/mensagem, então a mensagem real do servidor é recuperada aqui.
      const serverDetail = e instanceof ApiError ? e.body?.detail || e.body?.error : ''
      const message = e instanceof ApiError
        ? (e.message === DEFAULT_API_MESSAGE && typeof serverDetail === 'string' && serverDetail ? serverDetail : e.message)
        : 'Não foi possível iniciar a conexão.'
      setError(message)
      notify(message, 'error')
    } finally {
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

  async function remove(id) {
    if (!window.confirm('Deseja realmente desconectar esta conta?')) return
    setDisconnectingId(id)
    try { await apiFetch(`/api/accounts/${id}`, { method: 'DELETE' }); await reload(); await loadHealth(); notify('Conta desconectada.') }
    catch (e) { setError(e.message); notify(e.message, 'error') }
    finally { setDisconnectingId(null) }
  }

  const selectedProvider = providers.find(item => item.platform === platform)
  const filtersActive = Boolean(accountSearch) || accountStatusFilter !== 'all'

  return <div className="ds-page acc" data-ds-root>
    <header className="ds-pagehead acc-head">
      <div className="ds-pagehead__text">
        <p className="ds-eyebrow">Integrações</p>
        <h1 className="ds-pagehead__title">Contas</h1>
        <p className="ds-pagehead__lede">Conecte as redes que o Meu Ecoo usa para publicar, responder comentários e medir resultados.</p>
      </div>
    </header>

    <section className="acc-glance" aria-label="Resumo das integrações">
      <div className="ds-stats" style={{ '--cols': 4 }}>
        <div className="ds-stat"><p className="ds-stat__label">Contas conectadas</p><p className="ds-stat__value ds-stat__value--md">{firstLoad ? '—' : <>{accounts.length}{Number.isFinite(connectionLimit) && <span className="ds-stat__unit">/{connectionLimit}</span>}</>}</p><p className="ds-stat__caption">{firstLoad ? 'Carregando…' : `${connectedPlatforms} ${connectedPlatforms === 1 ? 'rede em uso' : 'redes em uso'}`}</p></div>
        <div className="ds-stat"><p className="ds-stat__label">Precisam de atenção</p><p className="ds-stat__value ds-stat__value--md" data-tone={attentionAccounts ? 'danger' : undefined}>{firstLoad ? '—' : attentionAccounts}</p><p className="ds-stat__caption">Token com erro, expirando ou ausente</p></div>
        <div className="ds-stat"><p className="ds-stat__label">APIs disponíveis</p><p className="ds-stat__value ds-stat__value--md">{healthLoading ? '—' : <>{healthyApis}<span className="ds-stat__unit">/{providers.length}</span></>}</p><p className="ds-stat__caption">{healthLoading ? 'Verificando agora' : 'Última verificação concluída'}</p></div>
        <div className="ds-stat"><p className="ds-stat__label">Plataformas do plano</p><p className="ds-stat__value ds-stat__value--md">{allowedPlatforms.size}</p><p className="ds-stat__caption">{user?.planUnrestricted ? 'Acesso administrativo' : plan.name}</p></div>
      </div>
    </section>

    <div className="acc-nets" aria-label="Status das plataformas">
      {providers.map(provider => {
        const connected = accountsByPlatform(provider.platform)
        const tokenStatuses = connected.map(account => accountTokenStatus(account))
        const tokenStatus = tokenStatuses.includes('error') ? 'error' : tokenStatuses.includes('expiring') ? 'expiring' : tokenStatuses.includes('valid') ? 'valid' : 'missing'
        const healthStatus = platformHealth[provider.platform] || 'unknown'
        const platformAllowed = allowedPlatforms.has(provider.platform)
        const canReconnect = connected.some(account => accountTokenStatus(account) !== 'valid')
        const canAdd = platformAllowed && (accounts.length < connectionLimit || canReconnect)
        const actionLabel = !platformAllowed ? 'Indisponível' : !canAdd ? 'Limite atingido' : connected.length && tokenStatus !== 'valid' ? 'Reconectar' : connected.length ? 'Adicionar outra' : 'Conectar'
        const statusTone = !platformAllowed ? 'muted' : !connected.length ? 'muted' : tokenStatus === 'error' ? 'failed' : tokenStatus === 'expiring' ? 'warning' : 'ok'
        return <article className="acc-net" data-connected={connected.length > 0 || undefined} data-locked={!platformAllowed || undefined} key={provider.platform}>
          <div className="acc-net__head">
            <span className="ds-icontile acc-net__icon" aria-hidden="true"><NetworkGlyph network={provider.platform} size={22} /></span>
            <div className="acc-net__title">
              <h3>{provider.label}</h3>
              <p className="ds-meta">{provider.description}</p>
            </div>
          </div>
          <p className="ds-status acc-net__status" data-status={statusTone}>
            <Icon name={statusTone === 'ok' ? 'checkCircle' : statusTone === 'failed' ? 'alertCircle' : statusTone === 'warning' ? 'alertTriangle' : 'plug'} />
            {firstLoad ? 'Carregando…' : !platformAllowed ? 'Não incluída no seu plano' : connected.length ? `${connected.length} conta${connected.length > 1 ? 's' : ''} conectada${connected.length > 1 ? 's' : ''}` : 'Nenhuma conta conectada'}
          </p>
          <p className="ds-meta acc-net__health" data-health={healthStatus}>
            <span className="acc-net__dot" aria-hidden="true" />{healthLoading ? 'Verificando API…' : HEALTH_LABELS[healthStatus] || HEALTH_LABELS.unknown}{tokenStatus === 'error' ? ' · Requer reconexão' : tokenStatus === 'expiring' ? ' · Token expirando' : ''}
          </p>
          <div className="acc-net__foot">
            <button type="button" className={`ds-btn ds-btn--sm ${canAdd && connected.length && tokenStatus !== 'valid' ? 'ds-btn--primary' : 'ds-btn--secondary'}`} disabled={!canAdd || firstLoad} onClick={() => openAddAccount(provider, connected, tokenStatus)}>{actionLabel}</button>
            {!platformAllowed && onNavigate && <button type="button" className="ds-go acc-net__plans" onClick={() => onNavigate('perfil')}>Ver planos<Icon name="arrow" size={16} /></button>}
          </div>
        </article>
      })}
    </div>

    <section className="ds-block acc-manage" aria-labelledby="acc-manage-title">
      <div className="ds-head">
        <div className="ds-head__text">
          <h2 className="ds-head__title" id="acc-manage-title">Adicionar ou remover conta</h2>
          <p className="ds-head__desc">Conecte uma nova conta pelo link dela ou desconecte uma conta que não usa mais.</p>
        </div>
      </div>

      <div className="acc-connect" id="account-action-panel">
        <div className="acc-connect__fields">
          <div className="ds-field">
            <label className="ds-label" htmlFor="acc-platform">Rede</label>
            <span className="ds-select">
              <select id="acc-platform" className="ds-select__control" value={platform} onChange={event => setPlatform(event.target.value)} aria-label="Plataforma">
                {providers.filter(item => allowedPlatforms.has(item.platform)).map(item => <option key={item.platform} value={item.platform}>{item.label}</option>)}
              </select>
              <Icon name="chevronDown" className="ds-select__chev" />
            </span>
          </div>
          <div className="ds-field acc-connect__link">
            <label className="ds-label" htmlFor="acc-link">Link da Página</label>
            <input id="acc-link" ref={accountInputRef} className="ds-input" value={accountName} onChange={event => setAccountName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') connect() }} placeholder={selectedProvider?.placeholder || 'Cole o link da Página'} aria-label="Link da Página" required />
          </div>
          <button type="button" onClick={connect} disabled={connecting} className="ds-btn ds-btn--primary acc-connect__go">{connecting ? <><span className="ds-spinner" aria-hidden="true" />Abrindo…</> : 'Conectar'}</button>
        </div>
        <p className="ds-hint">
          {platform === 'facebook'
            ? 'No Facebook, conecte somente uma Página que você administra. Depois da autorização, escolha a Página correspondente.'
            : `Depois de colar o link, a autorização do ${selectedProvider?.label || 'provedor'} abre em outra janela.`}
        </p>
        {error && <div className="ds-alert" data-tone="danger" role="alert"><Icon name="alertCircle" className="ds-alert__icon" /><p className="ds-alert__text">{error}</p></div>}
        {connectionNotice && <div className="ds-alert" data-tone="success" role="status">
          <Icon name="checkCircle" className="ds-alert__icon" />
          <p className="ds-alert__text">{connectionNotice}</p>
          <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-btn--sm ds-alert__close" onClick={() => setConnectionNotice('')} aria-label="Dispensar aviso"><Icon name="close" size={16} /></button>
        </div>}
      </div>

      <div className="acc-list">
        <div className="acc-list__head">
          <h3 className="acc-list__title">Contas autorizadas <span className="ds-badge" data-tone="outline">{accounts.length}</span></h3>
          <div className="ds-filterbar">
            <label className="ds-inputwrap acc-list__search">
              <Icon name="search" />
              <input className="ds-input" type="search" value={accountSearch} onChange={event => setAccountSearch(event.target.value)} placeholder="Buscar por nome ou rede..." aria-label="Buscar conta" />
            </label>
            <span className="ds-select acc-list__status">
              <select className="ds-select__control" value={accountStatusFilter} onChange={event => setAccountStatusFilter(event.target.value)} aria-label="Filtrar status das contas">
                <option value="all">Todos os status</option>
                <option value="healthy">Saudáveis</option>
                <option value="attention">Precisam de atenção</option>
              </select>
              <Icon name="chevronDown" className="ds-select__chev" />
            </span>
          </div>
        </div>

        {firstLoad
          ? <div aria-busy="true"><p className="ds-sr-only" aria-live="polite">Carregando contas...</p>{[1, 2].map(item => <span className="ds-skel acc-skel" key={item} />)}</div>
          : visibleAccounts.length
            ? <div className="ds-scrollx"><table className="ds-datatable acc-table">
                <thead><tr><th scope="col">Conta</th><th scope="col">Rede</th><th scope="col">Token</th><th scope="col"><span className="ds-sr-only">Ações</span></th></tr></thead>
                <tbody>{visibleAccounts.map(account => {
                  const tokenStatus = accountTokenStatus(account)
                  const profileUrl = accountProfileUrl(account)
                  const label = account.name || account.handle || account.platform
                  const expiry = tokenExpiryText(account)
                  const sync = account.lastSyncAt || account.last_sync_at
                  return <tr key={account.id} data-warning={tokenStatus === 'error' || undefined}>
                    <th scope="row">
                      <span className="acc-table__name">
                        {profileUrl && label === profileUrl
                          ? <a href={profileUrl} target="_blank" rel="noreferrer" className="acc-table__link">{label}<Icon name="external" size={14} /></a>
                          : <strong>{label}</strong>}
                        {profileUrl && label !== profileUrl && <a href={profileUrl} target="_blank" rel="noreferrer" className="acc-table__link ds-meta">{profileUrl}<Icon name="external" size={14} /></a>}
                        {!profileUrl && account.name && account.handle && <span className="ds-meta">{account.handle}</span>}
                        {sync && <span className="ds-meta">Última sincronização: {new Date(sync).toLocaleString('pt-BR')}</span>}
                      </span>
                    </th>
                    <td><span className="acc-table__net"><NetworkGlyph network={account.platform} size={16} />{providers.find(item => item.platform === account.platform)?.label || account.platform}</span></td>
                    <td>
                      <span className="ds-status" data-status={TOKEN_TONES[tokenStatus] || 'muted'}>{TOKEN_STATUS_LABELS[tokenStatus] || 'Sem token'}</span>
                      {expiry && <span className="ds-meta acc-table__expiry">{expiry}</span>}
                    </td>
                    <td className="acc-table__actions">
                      <button type="button" className="ds-btn ds-btn--danger ds-btn--sm" disabled={disconnectingId === account.id} onClick={() => remove(account.id)} aria-label={`Desconectar ${label}`}>{disconnectingId === account.id ? 'Removendo…' : 'Desconectar'}</button>
                    </td>
                  </tr>
                })}</tbody>
              </table></div>
            : <div className="ds-empty ds-empty--quiet acc-empty">
                <p className="ds-empty__title ds-empty__title--sm">{accounts.length ? 'Nenhuma conta corresponde aos filtros.' : 'Nenhuma conta conectada ainda.'}</p>
                <p className="ds-empty__text">{accounts.length ? 'Tente outra busca ou outro status.' : 'Escolha uma rede acima e cole o link da conta para conectar.'}</p>
                {accounts.length > 0 && filtersActive && <div className="ds-empty__actions"><button type="button" className="ds-go" onClick={() => { setAccountSearch(''); setAccountStatusFilter('all') }}>Limpar filtros<Icon name="arrow" /></button></div>}
              </div>}
      </div>
    </section>
  </div>
}
