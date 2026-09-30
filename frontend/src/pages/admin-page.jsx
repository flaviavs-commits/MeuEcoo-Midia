import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { PLANS } from '../lib/plans.js'
import { useApiResource } from '../hooks/use-api-resource.js'
import { ThemeSelector } from '../components/ui/theme-selector.jsx'
import { CopyrightNotice } from '../components/ui/copyright-notice.jsx'
import { Icon } from '../components/ui/icon.jsx'

const roleLabels = { admin: 'Administrador', user: 'Usuário' }
const planOptions = Object.values(PLANS)
const reconciliationDaysOptions = [7, 15, 30]

// Mesmo formatador de profile-page.jsx (não exportado de lá para não acoplar
// as duas páginas por um utilitário de 1 linha).
function formatCurrency(amountCents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(amountCents || 0) / 100)
}

function reducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

// Erro é anunciado na hora (alert); sucesso entra como status, sem interromper.
// O aviso fica no topo do conteúdo: quando nasce de uma ação lá embaixo (ex.:
// vincular o último pagamento da lista), rola só o necessário para ele aparecer.
function Notice({ notice, onDismiss }) {
  const ref = useRef(null)
  useEffect(() => {
    if (notice) ref.current?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [notice])
  if (!notice) return null
  const error = notice.type === 'error'
  return <div ref={ref} className="ds-alert adm-notice" data-tone={error ? 'danger' : 'success'} role={error ? 'alert' : 'status'}>
    <Icon name={error ? 'alertCircle' : 'checkCircle'} className="ds-alert__icon" />
    <p className="ds-alert__text">{notice.text}</p>
    <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-btn--sm ds-alert__close" onClick={onDismiss} aria-label="Fechar aviso"><Icon name="close" size={16} /></button>
  </div>
}

// Abas do painel — cada entrega desta reformulação (10/09/2026, decisão
// registrada no IA.md) adiciona uma aba nova: usuários e conciliação já
// existiam antes desta entrega; histórico e dashboard chegam nas próximas.
const TABS = [
  ['usuarios', 'Usuários'],
  ['conciliacao', 'Conciliação'],
  ['historico', 'Histórico'],
  ['dashboard', 'Dashboard'],
]
const TAB_ICONS = { usuarios: 'users', conciliacao: 'refresh', historico: 'activity', dashboard: 'chart' }

const LOG_TYPE_LABELS = { err: 'Erro', ok: 'Sucesso', info: 'Informação' }
const LOG_TYPE_STATUS = { err: 'failed', ok: 'ok', info: 'muted' }

function tabFromLocation(search = window.location.search) {
  const tab = new URLSearchParams(search).get('tab')
  return TABS.some(([key]) => key === tab) ? tab : TABS[0][0]
}

// Resolve um e-mail para uma conta via GET /api/admin/users/search — não
// existe um diretório de clientes no painel (listUsers só devolve a própria
// conta do admin, por design: "O painel administrativo mostra somente a
// própria conta" em server.js). O admin já precisa saber o e-mail exato de
// quem procura (veio de um contato do cliente, ou do relatório de
// conciliação, que traz o e-mail real informado à Stripe).
function useUserSearch(initialEmail = '') {
  const [email, setEmail] = useState(initialEmail)
  const [user, setUser] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const search = useCallback(async searchEmail => {
    const target = (searchEmail ?? email).trim()
    if (!target) return
    setBusy(true)
    setError(null)
    try {
      const result = await apiFetch(`/api/admin/users/search?email=${encodeURIComponent(target)}`)
      setUser(result.user)
    } catch (err) {
      setUser(null)
      setError(err instanceof ApiError ? err.message : 'Não foi possível buscar esse usuário.')
    } finally { setBusy(false) }
  }, [email])

  return { email, setEmail, user, setUser, busy, error, search }
}

function SectionHead({ title, description, children }) {
  return <div className="adm-sec__head">
    <div className="adm-sec__text"><h2 className="adm-sec__title">{title}</h2>{description && <p className="ds-head__desc">{description}</p>}</div>
    {children && <div className="adm-sec__tools">{children}</div>}
  </div>
}

// Ferramenta independente (não presa a uma linha de tabela, já que a tabela
// de usuários só lista a própria conta): busca um cliente pelo e-mail e gera
// o Payment Link do plano escolhido já com o client_reference_id dele, para
// o time mandar manualmente quando precisar (ex.: cliente que não conseguiu
// concluir pelo checkout dentro do app). Cada geração fica auditada no log
// do admin autor.
function GeneratePlanLinkTool({ onError }) {
  const lookup = useUserSearch()
  const [plan, setPlan] = useState(planOptions[0]?.id || '')
  const [state, setState] = useState({ busy: false, url: null, copied: false })

  const generate = async () => {
    if (!lookup.user) return onError('Busque o cliente pelo e-mail antes de gerar o link.')
    setState({ busy: true, url: null, copied: false })
    try {
      const result = await apiFetch(`/api/admin/users/${lookup.user.id}/plan-link/${plan}`)
      setState({ busy: false, url: result.url, copied: false })
    } catch (error) {
      setState({ busy: false, url: null, copied: false })
      onError(error instanceof ApiError ? error.message : 'Não foi possível gerar o link.')
    }
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(state.url); setState(current => ({ ...current, copied: true })) }
    catch { onError('Não foi possível copiar o link — copie manualmente.') }
  }

  return <section className="adm-sec adm-well">
    <SectionHead title="Gerar link de pagamento para um cliente" description="Busque o cliente pelo e-mail exato, escolha o plano e envie o link gerado. Cada link fica registrado no seu histórico." />
    <form className="adm-steps" onSubmit={event => { event.preventDefault(); lookup.search() }}>
      <div className="adm-step">
        <span className="adm-step__num" aria-hidden="true">1</span>
        <label className="ds-inputwrap adm-step__grow">
          <Icon name="mail" />
          <input className="ds-input" type="email" value={lookup.email} onChange={event => { lookup.setEmail(event.target.value); lookup.setUser(null) }} placeholder="E-mail do cliente" aria-label="E-mail do cliente para gerar link de pagamento" />
        </label>
        <button type="submit" className="ds-btn ds-btn--secondary" disabled={lookup.busy || !lookup.email.trim()}>{lookup.busy ? '…' : 'Buscar'}</button>
      </div>
      {lookup.error && <p className="ds-fieldmsg" data-tone="danger" role="alert"><Icon name="alertCircle" />{lookup.error}</p>}
      {lookup.user && <>
        <p className="adm-found"><Icon name="checkCircle" size={16} /><span>Cliente encontrado: <strong>{lookup.user.fullName || lookup.user.email}</strong> ({lookup.user.email})</span></p>
        <div className="adm-step">
          <span className="adm-step__num" aria-hidden="true">2</span>
          <span className="ds-select adm-step__grow">
            <select className="ds-select__control" value={plan} onChange={event => setPlan(event.target.value)} disabled={state.busy} aria-label={`Plano do link de pagamento para ${lookup.user.email}`}>{planOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
            <Icon name="chevronDown" className="ds-select__chev" />
          </span>
          <button type="button" className="ds-btn ds-btn--primary" onClick={generate} disabled={state.busy}>{state.busy ? '…' : 'Gerar link'}</button>
        </div>
      </>}
      {state.url && <div className="adm-step">
        <span className="adm-step__num" aria-hidden="true">3</span>
        <code className="adm-url adm-step__grow">{state.url}</code>
        <button type="button" className="ds-btn ds-btn--secondary" onClick={copy}><Icon name={state.copied ? 'check' : 'copy'} size={16} />{state.copied ? 'Copiado!' : 'Copiar link'}</button>
      </div>}
    </form>
  </section>
}

// Vincula uma sessão paga (linha do relatório de conciliação) a uma conta e
// plano escolhidos pelo admin — a Stripe já confirmou o pagamento, então essa
// ação só resolve qual conta recebe o quê, sem tocar direto no banco. Busca
// automaticamente pelo e-mail que a Stripe informou (item.customerEmail),
// quando existir — o admin ainda pode trocar antes de confirmar.
function LinkPaymentAction({ item, onLinked, onError }) {
  const lookup = useUserSearch(item.customerEmail || '')
  const [plan, setPlan] = useState(item.suggestedPlan || planOptions[0]?.id || '')
  const [busy, setBusy] = useState(false)
  // A falha fica na própria linha, ao lado do botão: numa lista longa (ou no
  // celular) o aviso do topo da página ficaria fora da tela.
  const [linkError, setLinkError] = useState(null)
  const buscaAutomatica = useRef(false)

  useEffect(() => {
    if (buscaAutomatica.current || !item.customerEmail) return
    buscaAutomatica.current = true
    lookup.search(item.customerEmail)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.customerEmail])

  const link = async () => {
    if (!lookup.user) return onError('Busque o cliente pelo e-mail antes de vincular.')
    setBusy(true)
    setLinkError(null)
    try {
      await apiFetch(`/api/admin/billing/reconciliation/${item.sessionId}/link`, {
        method: 'POST',
        body: JSON.stringify({ userId: lookup.user.id, plan }),
      })
      onLinked(item.sessionId, { email: lookup.user.email, plan, amountCents: item.amountCents })
    } catch (error) {
      setLinkError(error instanceof ApiError ? error.message : 'Não foi possível vincular esse pagamento.')
    } finally { setBusy(false) }
  }

  // Enter no campo de e-mail busca, como no gerador de link.
  return <div className="adm-link">
    <form className="adm-link__line" onSubmit={event => { event.preventDefault(); setLinkError(null); lookup.search() }}>
      <input className="ds-input" type="email" value={lookup.email} onChange={event => { lookup.setEmail(event.target.value); lookup.setUser(null) }} placeholder="E-mail do cliente" aria-label={`E-mail do cliente para vincular a sessão ${item.sessionId}`} />
      <button type="submit" className="ds-btn ds-btn--secondary ds-btn--sm" disabled={lookup.busy || busy || !lookup.email.trim()}>{lookup.busy ? '…' : 'Buscar'}</button>
    </form>
    <div className="adm-link__line">
      <span className="ds-select">
        <select className="ds-select__control" value={plan} onChange={event => setPlan(event.target.value)} disabled={busy} aria-label={`Plano para vincular a sessão ${item.sessionId}`}>{planOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
        <Icon name="chevronDown" className="ds-select__chev" />
      </span>
      <button type="button" className="ds-btn ds-btn--primary ds-btn--sm" onClick={link} disabled={busy || lookup.busy || !lookup.user}>{busy ? '…' : 'Vincular'}</button>
    </div>
    {linkError && <span className="adm-link__msg" data-tone="danger" role="alert"><Icon name="alertCircle" size={14} />{linkError}</span>}
    {lookup.error && <span className="adm-link__msg" data-tone="danger">{lookup.error}</span>}
    {lookup.user && <span className="adm-link__msg" data-tone="success"><Icon name="checkCircle" size={14} />{lookup.user.email}</span>}
  </div>
}

// Relatório de conciliação: cruza a Stripe com o banco e mostra os pagamentos
// confirmados sem cobrança correspondente. O alerta imediato por e-mail para
// todo admin já é disparado no backend (billingService.logUnlinkedPayment);
// esta seção é onde o admin resolve o que o alerta apontou.
function ReconciliationSection({ onError, onSuccess }) {
  const [days, setDays] = useState(7)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  // Se a carga falha, o relatório anterior sai da tela: ele pode ser de outro
  // período, e uma lista vazia diria "nenhum pagamento pendente" sem saber.
  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try { setReport(await apiFetch(`/api/admin/billing/reconciliation?days=${days}`)) }
    catch (error) {
      setReport(null)
      setLoadError(error instanceof ApiError ? error.message : 'Não foi possível carregar a conciliação.')
    }
    finally { setLoading(false) }
  }, [days])

  useEffect(() => { load() }, [load])

  const handleLinked = (sessionId, detail) => {
    setReport(current => current ? { ...current, unmatched: current.unmatched.filter(item => item.sessionId !== sessionId) } : current)
    if (detail) onSuccess(`Pagamento de ${formatCurrency(detail.amountCents)} vinculado a ${detail.email} no plano ${PLANS[detail.plan]?.name || detail.plan}.`)
  }

  return <section className="adm-sec">
    <SectionHead title="Pagamentos não conciliados" description="Sessões pagas na Stripe sem cobrança correspondente no sistema. Confira o e-mail e o plano antes de vincular.">
      <label className="adm-inline"><span className="ds-label">Período</span>
        <span className="ds-select">
          <select className="ds-select__control" value={days} onChange={event => setDays(Number(event.target.value))} disabled={loading}>{reconciliationDaysOptions.map(option => <option key={option} value={option}>Últimos {option} dias</option>)}</select>
          <Icon name="chevronDown" className="ds-select__chev" />
        </span>
      </label>
      <button type="button" className="ds-btn ds-btn--secondary" onClick={load} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</button>
    </SectionHead>
    {report?.truncated && <div className="ds-alert" data-tone="warning" role="status"><Icon name="alertTriangle" className="ds-alert__icon" /><p className="ds-alert__text">A lista foi cortada em {report.checked} sessões — reduza o período para ver tudo.</p></div>}
    {loadError && !loading
      ? <LoadFailure message={loadError} onRetry={load} />
      : <div className="ds-scrollx adm-tablewrap">
          <table className="ds-datatable ds-datatable--stack adm-datatable adm-rec">
            <thead><tr><th>Data</th><th className="ds-cellnum">Valor</th><th>E-mail do comprador</th><th>Referência</th><th>Plano sugerido</th><th>Vincular</th></tr></thead>
            <tbody>{loading
              ? <tr><td colSpan="6" className="adm-empty">Carregando…</td></tr>
              : !report?.unmatched?.length
                ? <tr><td colSpan="6" className="adm-empty">Nenhum pagamento sem conciliação nos últimos {days} dias.</td></tr>
                : report.unmatched.map(item => <tr key={item.sessionId}>
                    <td className="adm-nowrap" data-label="Data">{new Date(item.createdAt).toLocaleString('pt-BR')}</td>
                    <td className="ds-cellnum" data-label="Valor">{formatCurrency(item.amountCents)}</td>
                    <td className="adm-rec__mail" data-label="E-mail do comprador">{item.customerEmail || '—'}</td>
                    <td className="adm-mono adm-rec__ref" data-label="Referência">{item.clientReferenceId || '—'}</td>
                    <td className="adm-rec__plan" data-label="Plano sugerido">{item.suggestedPlan ? PLANS[item.suggestedPlan]?.name : '—'}</td>
                    <td className="adm-cellwide"><LinkPaymentAction item={item} onLinked={handleLinked} onError={onError} /></td>
                  </tr>)}</tbody>
          </table>
        </div>}
  </section>
}

// Falha ao carregar uma seção: diz o que houve e oferece tentar de novo, em vez
// de uma tabela vazia que pareceria "nada a mostrar".
function LoadFailure({ message, onRetry, busy = false }) {
  return <div className="ds-alert" data-tone="danger" role="alert">
    <Icon name="alertCircle" className="ds-alert__icon" />
    <p className="ds-alert__text">{message}</p>
    <div className="ds-alert__actions"><button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={onRetry} disabled={busy}>Tentar de novo</button></div>
  </div>
}

// A tabela mostra só a própria conta do admin (listUsers/listarTodos é
// intencionalmente restrito — ver comentário em useUserSearch). A ação de
// gerar link para um CLIENTE fica separada, como ferramenta de busca por
// e-mail, porque não existe cliente nenhum nesta tabela para "escolher".
function UsersSection({ currentUser, users, loading, loadError, onRetry, updating, onError, onToggleRole, onToggleActive }) {
  return <>
    <GeneratePlanLinkTool onError={onError} />
    <section className="adm-sec">
      <SectionHead title="Sua conta" description="O painel mostra só a sua própria conta. Clientes são encontrados pela busca por e-mail." />
      {loadError && !loading ? <LoadFailure message={loadError} onRetry={onRetry} /> : <div className="ds-scrollx adm-tablewrap">
        <table className="ds-datatable ds-datatable--stack adm-datatable">
          <thead><tr><th>E-mail</th><th>Nome</th><th>Papel</th><th>Situação</th><th className="ds-cellnum">Contas</th><th>Ações</th></tr></thead>
          <tbody>{loading ? <tr><td colSpan="6" className="adm-empty">Carregando…</td></tr> : users.length === 0 ? <tr><td colSpan="6" className="adm-empty">Nenhum usuário encontrado.</td></tr> : users.map(user => {
            const isMe = user.id === currentUser?.id
            const isSuperAdmin = user.role === 'super_admin'
            const roleBusy = updating === `role-${user.id}`
            const activeBusy = updating === `ativo-${user.id}`
            return <tr key={user.id}>
              <td data-label="E-mail">{user.email}</td>
              <td data-label="Nome">{user.fullName || '—'}</td>
              <td data-label="Papel"><span className="ds-badge" data-tone={user.role === 'user' ? 'outline' : 'gold'}>{roleLabels[user.role] || user.role}</span></td>
              <td data-label="Situação"><span className="ds-status ds-status--soft" data-status={user.ativo ? 'ok' : 'failed'}>{user.ativo ? 'Ativo' : 'Desativado'}</span></td>
              <td className="ds-cellnum" data-label="Contas">{user.totalContas}</td>
              <td className="adm-cellwide"><div className="adm-actions">
                <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" disabled={isSuperAdmin || currentUser?.role !== 'super_admin' || roleBusy} onClick={() => onToggleRole(user)}>{roleBusy ? '…' : user.role === 'admin' ? 'Tornar usuário' : 'Tornar admin'}</button>
                <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm" disabled={isMe || activeBusy || (user.role !== 'user' && currentUser?.role !== 'super_admin')} onClick={() => onToggleActive(user)}>{activeBusy ? '…' : user.ativo ? 'Desativar' : 'Ativar'}</button>
              </div></td>
            </tr>
          })}</tbody>
        </table>
      </div>}
    </section>
  </>
}

function AdminTabs({ tab, onChange }) {
  return <nav className="adm-tabs" aria-label="Seções do painel admin">{TABS.map(([key, label]) => <button key={key} type="button" className="adm-tab" aria-current={tab === key ? 'page' : undefined} onClick={() => onChange(key)}><Icon name={TAB_ICONS[key]} size={16} />{label}</button>)}</nav>
}

// Histórico de ações administrativas: reaproveita /api/logs, o mesmo
// endpoint já usado pela Central de Atividades do app principal
// (activity-page.jsx) — escopado ao próprio admin autenticado, preservando a
// garantia de que ninguém vê dado de outra conta fora dos dois pontos já
// auditados explicitamente (link de pagamento, vínculo manual). As ações de
// papel/situação passaram a gerar log em 10/09/2026 especificamente para
// esta seção não nascer vazia.
function HistorySection() {
  const [type, setType] = useState('all')
  const [search, setSearch] = useState('')
  const loadLogs = useCallback(() => apiFetch('/api/logs?limit=200').then(data => data.logs || []), [])
  const { value: logs, loading, error, reload } = useApiResource(loadLogs, [])

  const visibleLogs = useMemo(() => {
    const query = search.trim().toLowerCase()
    return logs.filter(log => (type === 'all' || log.type === type) && (!query || String(log.message).toLowerCase().includes(query)))
  }, [logs, search, type])

  return <section className="adm-sec">
    <SectionHead title="Histórico de ações administrativas" description="Eventos da sua conta, incluindo links gerados, buscas e vínculos de pagamento.">
      <label className="ds-inputwrap adm-search"><Icon name="search" /><input className="ds-input" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar…" aria-label="Buscar no histórico" /></label>
      <span className="ds-select adm-type">
        <select className="ds-select__control" value={type} onChange={event => setType(event.target.value)} aria-label="Filtrar tipo de atividade"><option value="all">Todos os tipos</option>{Object.entries(LOG_TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <Icon name="chevronDown" className="ds-select__chev" />
      </span>
      <button type="button" className="ds-btn ds-btn--secondary" onClick={() => reload().catch(() => {})} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</button>
    </SectionHead>
    {error && <LoadFailure message={error} onRetry={() => reload().catch(() => {})} busy={loading} />}
    {/* Sem nenhum registro carregado, a falha basta: "nenhuma ação registrada"
        afirmaria algo que a tela não chegou a saber. */}
    {!(error && !loading && !logs.length) && <div className="ds-scrollx adm-tablewrap">
      <table className="ds-datatable ds-datatable--stack adm-datatable adm-log">
        <thead><tr><th>Quando</th><th>Tipo</th><th>Ação</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan="3" className="adm-empty">Carregando…</td></tr> : !visibleLogs.length ? <tr><td colSpan="3" className="adm-empty">{search || type !== 'all' ? 'Nenhuma ação corresponde aos filtros.' : 'Nenhuma ação administrativa registrada ainda.'}</td></tr> : visibleLogs.map(log => <tr key={log.id}>
          <td className="adm-nowrap" data-label="Quando">{log.timestamp ? new Date(log.timestamp).toLocaleString('pt-BR') : '—'}</td>
          <td className="adm-log__type" data-label="Tipo"><span className="ds-status ds-status--soft" data-status={LOG_TYPE_STATUS[log.type] || 'muted'}>{LOG_TYPE_LABELS[log.type] || 'Atividade'}</span></td>
          <td className="adm-wrap adm-cellwide" data-label="Ação">{log.message}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>
}

// Dashboard: GET /api/admin/dashboard devolve só contagens agregadas, sem
// nenhum dado individual (nome, e-mail, id) — exceção documentada e
// deliberada à política de "sem diretório global", decidida em 10/09/2026
// (Trilha B, pergunta feita explicitamente antes de implementar; ver IA.md e
// usersRepository.obterMetricasAgregadas).
function DashboardSection({ onOpenReconciliation }) {
  const loadMetrics = useCallback(() => apiFetch('/api/admin/dashboard'), [])
  const { value: metrics, loading, error, reload } = useApiResource(loadMetrics, null)

  const planEntries = metrics ? Object.entries(metrics.porPlano).sort(([, a], [, b]) => b - a) : []

  return <section className="adm-sec">
    <SectionHead title="Dashboard" description="Somente contagens agregadas; nenhum dado individual aparece aqui.">
      <button type="button" className="ds-btn ds-btn--secondary" onClick={() => reload().catch(() => {})} disabled={loading}>{loading ? 'Atualizando…' : 'Atualizar'}</button>
    </SectionHead>
    {error && <LoadFailure message={error} onRetry={() => reload().catch(() => {})} busy={loading} />}
    {loading ? <p className="adm-empty">Carregando…</p> : metrics && <>
      <div className="ds-stats adm-stats" style={{ '--cols': 4 }}>
        <div className="ds-stat"><p className="ds-stat__value">{metrics.totalUsuarios}</p><p className="ds-stat__label">Usuários no total</p></div>
        <div className="ds-stat"><p className="ds-stat__value">{metrics.ativos}</p><p className="ds-stat__label">Contas ativas</p></div>
        <div className="ds-stat"><p className="ds-stat__value">{metrics.desativados}</p><p className="ds-stat__label">Contas desativadas</p></div>
        <div className="ds-stat adm-stat--warn" data-attention={Number(metrics.pagamentosNaoConciliados) > 0 || undefined}>
          <p className="ds-stat__value">{metrics.pagamentosNaoConciliados}</p>
          <p className="ds-stat__label">Pagamentos não conciliados (7 dias)</p>
          {Number(metrics.pagamentosNaoConciliados) > 0 && <button type="button" className="ds-go" onClick={onOpenReconciliation}>Abrir conciliação<Icon name="arrow" size={16} /></button>}
        </div>
      </div>
      {planEntries.length > 0 && <div className="adm-plans">
        <h3 className="adm-plans__title">Assinantes por plano</h3>
        <ul className="adm-plans__list">{planEntries.map(([plan, total]) => <li key={plan}><span className="adm-plans__name">{PLANS[plan]?.name || plan}</span><strong className="ds-num">{total}</strong></li>)}</ul>
      </div>}
    </>}
  </section>
}

export function AdminPage() {
  const [currentUser, setCurrentUser] = useState(null)
  const [users, setUsers] = useState([])
  const [notice, setNotice] = useState(null)
  const [loading, setLoading] = useState(true)
  // Falha ao carregar a lista fica separada do aviso das ações: antes, o
  // recarregamento depois de uma ação apagava a mensagem de sucesso dela.
  const [usersError, setUsersError] = useState(null)
  const [denied, setDenied] = useState(false)
  const [updating, setUpdating] = useState(null)
  const [tab, setTab] = useState(() => tabFromLocation())

  useEffect(() => {
    const previous = document.title
    document.title = 'Administração · Meu Ecoo Mídia'
    return () => { document.title = previous }
  }, [])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const [me, result] = await Promise.all([apiFetch('/api/me'), apiFetch('/api/admin/users')])
      setCurrentUser(me)
      setUsers(result.data || [])
      setUsersError(null)
    } catch (error) {
      // 403: a conta não é admin. As abas só repetiriam o mesmo erro.
      if (error instanceof ApiError && error.status === 403) setDenied(true)
      setUsersError(error instanceof ApiError ? error.message : 'Não foi possível carregar os usuários.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  useEffect(() => {
    const onPopState = () => setTab(tabFromLocation())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const changeTab = nextTab => {
    if (nextTab === tab) return
    const url = new URL(window.location.href)
    url.searchParams.set('tab', nextTab)
    window.history.pushState({}, '', url)
    setTab(nextTab)
  }

  const update = async (id, action, payload, successMessage) => {
    setUpdating(`${action}-${id}`)
    try {
      await apiFetch(`/api/admin/users/${id}/${action}`, { method: 'POST', body: JSON.stringify(payload) })
      setNotice({ type: 'success', text: successMessage })
      await loadUsers()
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof ApiError ? error.message : 'Não foi possível concluir a ação.' })
    } finally { setUpdating(null) }
  }

  const toggleRole = user => update(user.id, 'role', { role: user.role === 'admin' ? 'user' : 'admin' }, 'Papel atualizado.')
  const toggleActive = user => update(user.id, 'ativo', { ativo: !user.ativo }, 'Situação atualizada.')
  const onError = text => setNotice({ type: 'error', text })
  const onSuccess = text => setNotice({ type: 'success', text })

  return <div className="adm" data-ds-root>
    <header className="adm-top">
      <div className="adm-top__inner">
        <a className="adm-logo" href="/app/dashboard" aria-label="Meu Ecoo Mídia - ir para o dashboard"><img src="/logo.png" alt="Meu Ecoo Mídia" /></a>
        <span className="adm-top__divider" aria-hidden="true" />
        <span className="adm-top__label"><Icon name="lock" size={16} />Área administrativa</span>
        <div className="adm-top__end">
          <ThemeSelector variant="toggle" />
          <a href="/app.html" className="ds-btn ds-btn--quiet ds-btn--sm adm-back"><Icon name="arrowLeft" size={16} />Voltar ao painel</a>
        </div>
      </div>
    </header>

    <main className="adm-main">
      <header className="ds-pagehead adm-head">
        <div className="ds-pagehead__text">
          <p className="ds-eyebrow">Gestão do sistema</p>
          <h1 className="ds-pagehead__title">Administração</h1>
          <p className="ds-pagehead__lede">Links de pagamento, conciliação com a Stripe, seu histórico e os números gerais do sistema.</p>
        </div>
      </header>
      {denied
        ? <section className="ds-empty ds-empty--center adm-denied" aria-labelledby="adm-denied-title">
            <span className="ds-icontile ds-icontile--lg" aria-hidden="true"><Icon name="lock" /></span>
            <h2 className="ds-empty__title ds-empty__title--sm" id="adm-denied-title">Esta área é só para administradores</h2>
            <p className="ds-empty__text">Sua conta não tem acesso ao painel administrativo. Se precisar dele, fale com quem administra o Meu Ecoo Mídia.</p>
            <div className="ds-empty__actions"><a href="/app.html" className="ds-btn ds-btn--primary"><Icon name="arrowLeft" size={16} />Voltar ao painel</a></div>
          </section>
        : <>
            <AdminTabs tab={tab} onChange={changeTab} />
            <Notice notice={notice} onDismiss={() => setNotice(null)} />
            <div className="adm-body">
              {tab === 'usuarios' && <UsersSection currentUser={currentUser} users={users} loading={loading} loadError={usersError} onRetry={loadUsers} updating={updating} onError={onError} onToggleRole={toggleRole} onToggleActive={toggleActive} />}
              {tab === 'conciliacao' && (loading ? <div aria-busy="true"><span className="ds-skel adm-skel" /></div> : <ReconciliationSection onError={onError} onSuccess={onSuccess} />)}
              {tab === 'historico' && <HistorySection />}
              {tab === 'dashboard' && <DashboardSection onOpenReconciliation={() => changeTab('conciliacao')} />}
            </div>
          </>}
    </main>
    <footer className="adm-foot"><CopyrightNotice /></footer>
  </div>
}
