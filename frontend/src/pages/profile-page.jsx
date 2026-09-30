import { useEffect, useState } from 'react'
import { apiFetch, logout } from '../lib/api.js'
import { useToast } from '../components/ui/toast.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { getTutorialStatus, requestTutorialOpen, TUTORIAL_STATUS_EVENT } from '../lib/tutorial.js'
import { DEFAULT_PLAN, PLANS, getMeuEcooPricing, getPlan, normalizePlan } from '../lib/plans.js'
import { PASSWORD_MAX_LENGTH, PASSWORD_RULE_LABELS, passwordRules } from '../lib/password-rules.js'

function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

const DEFAULT_NOTIFICATIONS = { email: true, published: true, failures: true, comments: true }
const PLATFORM_LABELS = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok' }
const NOTIFICATION_OPTIONS = [
  ['published', 'Publicações concluídas', 'Aviso quando um post for publicado nas redes.'],
  ['failures', 'Falhas de publicação', 'Aviso quando uma publicação não der certo.'],
  ['comments', 'Novos comentários', 'Acompanhe as interações da sua comunidade.'],
  ['email', 'Avisos importantes por e-mail', 'Receba no seu e-mail os avisos importantes da conta.'],
]
const CHARGE_NOTES = {
  paid: { tone: 'success', icon: 'checkCircle', text: 'Cobrança deste mês confirmada.' },
  processing: { tone: 'info', icon: 'clock', text: 'Pagamento em processamento. O plano será ativado após a confirmação do gateway.' },
  failed: { tone: 'danger', icon: 'alertCircle', text: 'A tentativa deste mês não foi concluída. Uma nova cobrança não será criada automaticamente.' },
  pending: { tone: 'warning', icon: 'alertTriangle', text: 'Checkout pendente. Finalize o pagamento para ativar o plano escolhido.' },
  cancelled: { tone: 'warning', icon: 'info', text: 'O checkout anterior foi cancelado. Não será criada outra cobrança neste mês.' },
}

function initials(profile) {
  const label = profile?.fullName || profile?.email || 'U'
  return label.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
}

function formatDate(value) {
  if (!value) return 'Não informado'
  return new Date(value).toLocaleDateString('pt-BR', { dateStyle: 'long' })
}

function formatCurrency(priceCents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(priceCents || 0) / 100)
}

function formFromProfile(data) {
  return {
    fullName: data.fullName || '',
    timezone: data.timezone || 'America/Sao_Paulo',
    language: data.language || 'pt-BR',
    defaultPlatform: data.defaultPlatform || '',
    notificationPreferences: { ...DEFAULT_NOTIFICATIONS, ...(data.notificationPreferences || {}) },
  }
}

function scrollToSection(id) {
  const target = document.getElementById(id)
  if (!target) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  target.querySelector('h2')?.focus({ preventScroll: true })
}

export function ProfilePage({ user, onNavigate, onUserChange }) {
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({ fullName: user?.fullName || '', timezone: 'America/Sao_Paulo', language: 'pt-BR', defaultPlatform: '', notificationPreferences: DEFAULT_NOTIFICATIONS })
  const [savedForm, setSavedForm] = useState(null)
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '', confirmation: '' })
  const [billing, setBilling] = useState(null)
  const [billingBusy, setBillingBusy] = useState(false)
  const [busyAction, setBusyAction] = useState('')
  const [meuEcooSelected, setMeuEcooSelected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [checkoutCancelled] = useState(() => new URLSearchParams(window.location.search).get('billing') === 'cancelled')
  const [tutorialStatus, setTutorialStatus] = useState(() => getTutorialStatus())

  const notify = useToast()

  useEffect(() => {
    const handleStatusChange = event => setTutorialStatus(event.detail || getTutorialStatus())
    window.addEventListener(TUTORIAL_STATUS_EVENT, handleStatusChange)
    return () => window.removeEventListener(TUTORIAL_STATUS_EVENT, handleStatusChange)
  }, [])

  function loadProfile() {
    setLoading(true)
    setLoadError('')
    return Promise.all([
      apiFetch('/api/me/profile'),
      apiFetch('/api/billing/status').catch(() => null)
    ]).then(([data, billingStatus]) => {
      setProfile(data)
      const loadedForm = formFromProfile(data)
      setForm(loadedForm)
      setSavedForm(loadedForm)
      setBilling(billingStatus)
      if (typeof data.totpEnabled === 'boolean') onUserChange?.({ totpEnabled: data.totpEnabled })
      if (billingStatus?.currentPlan) {
        const planPatch = { plan: billingStatus.currentPlan, planActive: billingStatus.planActive !== false }
        setProfile(current => ({ ...current, ...planPatch }))
        onUserChange?.(planPatch)
      }
    }).catch(caught => setLoadError(caught.message || 'Não foi possível carregar seu perfil.')).finally(() => setLoading(false))
  }

  useEffect(() => { loadProfile() }, [])

  // O retorno "cancelado" do checkout só precisa de um aviso; a URL volta a ficar limpa.
  useEffect(() => {
    if (checkoutCancelled) window.history.replaceState({}, '', window.location.pathname)
  }, [checkoutCancelled])

  useEffect(() => {
    if (!billing || new URLSearchParams(window.location.search).get('billing') !== 'success') return undefined
    window.history.replaceState({}, '', window.location.pathname)
    if (billing.charge?.status === 'paid') return undefined

    let active = true
    let attempts = 0
    let timer = null
    const poll = async () => {
      attempts += 1
      const status = await apiFetch('/api/billing/status').catch(() => null)
      if (!active) return
      if (status) {
        setBilling(status)
        if (status.currentPlan) {
          const planPatch = { plan: status.currentPlan, planActive: status.planActive !== false }
          setProfile(current => ({ ...current, ...planPatch }))
          onUserChange?.(planPatch)
        }
      }
      if (status?.charge?.status !== 'paid' && attempts < 6) timer = window.setTimeout(poll, 2000)
    }
    void poll()
    return () => {
      active = false
      if (timer) window.clearTimeout(timer)
    }
  }, [billing])

  function updateForm(key, value) {
    setForm(current => ({ ...current, [key]: value }))
  }

  function updateNotification(key, value) {
    setForm(current => ({ ...current, notificationPreferences: { ...current.notificationPreferences, [key]: value } }))
  }

  async function saveProfile(event) {
    event.preventDefault()
    if (!savedForm) return
    setSaving(true)
    setFormError('')
    try {
      const data = await apiFetch('/api/me/profile', { method: 'PATCH', body: JSON.stringify(form) })
      setProfile(current => ({ ...current, ...data }))
      const nextForm = { ...form, notificationPreferences: data.notificationPreferences || form.notificationPreferences }
      setForm(nextForm)
      setSavedForm(nextForm)
      onUserChange?.({ fullName: data.fullName, notificationPreferences: nextForm.notificationPreferences })
      notify('Perfil e preferências salvos.')
    } catch (caught) {
      setFormError(caught.message)
      notify(caught.message, 'error')
    } finally { setSaving(false) }
  }

  async function changePassword(event) {
    event.preventDefault()
    if (password.newPassword !== password.confirmation) return setPasswordError('A confirmação da nova senha não confere.')
    if (password.newPassword && !Object.values(passwordRules(password.newPassword)).every(Boolean)) return setPasswordError('A senha precisa ter de 8 a 72 caracteres, uma maiúscula, um número e um caractere especial.')
    setPasswordSaving(true)
    setPasswordError('')
    try {
      await apiFetch('/api/me/password', { method: 'POST', body: JSON.stringify({ currentPassword: password.currentPassword, newPassword: password.newPassword }) })
      setPassword({ currentPassword: '', newPassword: '', confirmation: '' })
      notify('Senha alterada com sucesso. Entre de novo com a nova senha.')
    } catch (caught) {
      setPasswordError(caught.message)
      notify(caught.message, 'error')
    } finally { setPasswordSaving(false) }
  }

  async function changeAvatar(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return notify('Escolha uma imagem JPG, PNG, GIF ou WebP.', 'error')
    setAvatarSaving(true)
    try {
      const upload = await apiFetch('/api/posts/upload-url', { method: 'POST', body: JSON.stringify({ filename: file.name, mimetype: file.type }) })
      const response = await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
      if (!response.ok) throw new Error('Não foi possível enviar a imagem.')
      const uploaded = await response.json().catch(() => null)
      const avatarUrl = upload.mediaUrl || uploaded?.url
      if (!avatarUrl) throw new Error('O upload não retornou uma URL válida.')
      await apiFetch('/api/me/avatar', { method: 'POST', body: JSON.stringify({ avatarUrl }) })
      setProfile(current => ({ ...current, avatarUrl }))
      onUserChange?.({ avatarUrl })
      notify('Foto de perfil atualizada.')
    } catch (caught) { notify(caught.message, 'error') }
    finally { setAvatarSaving(false) }
  }

  async function removeAvatar() {
    setAvatarSaving(true)
    try {
      await apiFetch('/api/me/avatar', { method: 'POST', body: JSON.stringify({ avatarUrl: null }) })
      setProfile(current => ({ ...current, avatarUrl: null }))
      onUserChange?.({ avatarUrl: null })
      notify('Foto de perfil removida.')
    } catch (caught) { notify(caught.message, 'error') }
    finally { setAvatarSaving(false) }
  }

  async function logoutAll() {
    if (!window.confirm('Isso encerrará todas as sessões desta conta. Deseja continuar?')) return
    try {
      await apiFetch('/api/me/logout-all', { method: 'POST' })
      logout()
    } catch (caught) { notify(caught.message, 'error') }
  }

  async function choosePlan(planId) {
    const currentPlanId = normalizePlan(profile?.plan || user?.plan || DEFAULT_PLAN)
    const planActive = profile?.planActive ?? user?.planActive ?? true
    const target = PLANS[planId]
    if (!target || (planId === currentPlanId && planActive !== false)) return
    // Com assinatura ativa o servidor troca o plano na hora, com cobrança
    // proporcional; sem ela, abre o checkout.
    const immediateChange = planActive !== false && billing?.subscription?.manageable
    const confirmText = immediateChange
      ? `Trocar para o plano ${target.name} agora? A mudança vale na hora e a cobrança da sua assinatura é ajustada de forma proporcional.`
      : `A troca para o plano ${target.name} abrirá o checkout seguro e poderá gerar uma única cobrança neste mês. Continuar?`
    if (Number(target.priceCents) > 0 && !window.confirm(confirmText)) return

    setBillingBusy(true)
    setBusyAction(`plan:${planId}`)
    try {
      const result = await apiFetch('/api/billing/plan-change', { method: 'POST', body: JSON.stringify({ plan: planId, meuEcoo: planId === 'pro' && meuEcooSelected }) })
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl)
        return
      }
      if (result.plan) {
        setProfile(current => ({ ...current, plan: result.plan }))
        onUserChange?.({ plan: result.plan })
      }
      const status = await apiFetch('/api/billing/status').catch(() => null)
      if (status) setBilling(status)
      notify(result.status === 'updated' || result.status === 'paid' ? 'Plano atualizado com sucesso.' : 'Solicitação de troca registrada.')
    } catch (caught) {
      notify(caught.message || 'Não foi possível trocar o plano agora.', 'error')
    } finally {
      setBillingBusy(false)
      setBusyAction('')
    }
  }

  // Cancelamento self-service via Customer Portal (task de 10/09/2026): a
  // Stripe hospeda a própria tela de cancelar assinatura, trocar cartão e ver
  // faturas — nenhuma UI própria dessas ações é construída aqui.
  async function openBillingPortal() {
    setBillingBusy(true)
    setBusyAction('portal')
    try {
      const result = await apiFetch('/api/billing/portal', { method: 'POST' })
      window.location.assign(result.url)
    } catch (caught) {
      notify(caught.message || 'Não foi possível abrir o portal de cobrança agora.', 'error')
      setBillingBusy(false)
      setBusyAction('')
    }
  }

  if (loading && !profile) return <div className="ds-page pf" data-ds-root aria-busy="true">
    <p className="ds-sr-only" role="status">Carregando seu perfil…</p>
    <div className="pf-id"><span className="ds-skel pf-avatar" /><div className="pf-id__text"><span className="ds-skel ds-skel--text" /><span className="ds-skel ds-skel--text" /></div></div>
    {[1, 2].map(item => <span className="ds-skel pf-skel" key={item} />)}
  </div>

  const current = profile || user || {}
  const notifications = form.notificationPreferences || DEFAULT_NOTIFICATIONS
  const avatar = current.avatarUrl
  const currentPlanId = normalizePlan(current.plan || DEFAULT_PLAN)
  const currentPlan = getPlan(currentPlanId)
  const planActive = current.planActive !== false
  const proPlan = PLANS.pro
  const proDiscountPercent = Number(proPlan?.meuEcooDiscountPercent) || 0
  const meuEcooPricing = getMeuEcooPricing(proPlan)
  const chargeNote = CHARGE_NOTES[billing?.charge?.status]
  const subscription = billing?.subscription
  const periodEnd = subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null
  const periodEndLabel = periodEnd && !Number.isNaN(periodEnd.getTime()) ? periodEnd.toLocaleDateString('pt-BR', { dateStyle: 'long' }) : ''
  const dirty = Boolean(savedForm) && JSON.stringify(form) !== JSON.stringify(savedForm)
  const rules = passwordRules(password.newPassword)
  const roleLabel = current.role === 'super_admin' ? 'Super administrador' : current.role === 'admin' ? 'Administrador' : 'Usuário'
  const sections = [
    { id: 'pf-plano', label: 'Plano e cobrança', icon: 'crown' },
    { id: 'pf-dados', label: 'Dados e preferências', icon: 'user' },
    { id: 'pf-seguranca', label: 'Segurança', icon: 'shield' },
    { id: 'pf-sessoes', label: 'Sessões', icon: 'lock' },
    { id: 'pf-ajuda', label: 'Ajuda', icon: 'help' },
  ]
  // Com pagamento pendente, escolher o plano é o que libera o app: vem primeiro.
  const orderedSections = planActive ? [sections[1], sections[0], ...sections.slice(2)] : sections

  const planSection = <section className="pf-sec" id="pf-plano" aria-labelledby="pf-plano-title" key="pf-plano">
    <header className="pf-sec__head">
      <h2 className="pf-sec__title" id="pf-plano-title" tabIndex={-1}>Plano e cobrança</h2>
      <p className="ds-head__desc">Veja seu plano, troque quando quiser e cuide da assinatura.</p>
    </header>

    <div className="pf-now" data-active={planActive}>
      <span className="ds-icontile" aria-hidden="true"><Icon name="crown" /></span>
      <div className="pf-now__text">
        <p className="pf-now__name">Plano atual: {currentPlan.name}</p>
        <p className="ds-meta">{currentPlan.checkoutPrice} {currentPlan.cadence} · até {currentPlan.maxConnections} contas conectadas · {currentPlan.aiImageLimit} imagens por mês</p>
      </div>
      <span className="ds-status ds-status--soft" data-status={planActive ? 'ok' : 'warning'}>{planActive ? 'Ativo' : 'Pagamento pendente'}</span>
    </div>

    {!planActive && <div className="ds-alert" data-tone="warning">
      <Icon name="lock" className="ds-alert__icon" />
      <p className="ds-alert__title">Os módulos ficam bloqueados até o pagamento ser confirmado</p>
      <p className="ds-alert__text">Escolha um plano abaixo ou finalize o pagamento do plano atual. O perfil continua disponível enquanto isso.</p>
    </div>}
    {checkoutCancelled && <div className="ds-alert" data-tone="warning" role="status"><Icon name="info" className="ds-alert__icon" /><p className="ds-alert__text">Você saiu do checkout antes de concluir o pagamento. Escolha o plano de novo quando quiser.</p></div>}
    {chargeNote && <div className="ds-alert" data-tone={chargeNote.tone} role="status"><Icon name={chargeNote.icon} className="ds-alert__icon" /><p className="ds-alert__text">{chargeNote.text}</p></div>}

    {subscription?.manageable && <div className="pf-manage">
      <p>Cancele sua assinatura, troque o cartão ou veja suas faturas a qualquer momento.{subscription.cancelAtPeriodEnd && ` Sua assinatura já está marcada para cancelar ao fim do período atual${periodEndLabel ? `, em ${periodEndLabel}` : ''}.`}</p>
      <button type="button" className="ds-btn ds-btn--secondary" onClick={openBillingPortal} disabled={billingBusy}>{busyAction === 'portal' ? 'Abrindo…' : 'Gerenciar assinatura'}</button>
    </div>}

    <div className="pf-plans" role="group" aria-label="Escolha seu plano">
      {Object.values(PLANS).map(planOption => {
        const isCurrent = currentPlanId === planOption.id
        const isProChoiceAvailable = planOption.id === 'pro' && !(isCurrent && planActive)
        const busyHere = busyAction === `plan:${planOption.id}`
        const primary = !planActive || (isCurrent && !planActive)
        return <article key={planOption.id} className="pf-offer" data-current={isCurrent || undefined} aria-labelledby={`pf-offer-${planOption.id}`}>
          <header className="pf-offer__head">
            <h3 id={`pf-offer-${planOption.id}`}>{planOption.name}</h3>
            {isCurrent && <span className="ds-badge" data-tone="gold">Seu plano</span>}
          </header>
          <p className="pf-offer__price"><span className="ds-num">{planOption.checkoutPrice}</span> <span>{planOption.cadence}</span></p>
          <p className="pf-offer__desc">{planOption.description}</p>
          {Array.isArray(planOption.features) && planOption.features.length > 0 && <ul className="pf-offer__features">
            {planOption.features.map(feature => <li key={feature}><Icon name="check" size={16} />{feature}</li>)}
          </ul>}
          {isProChoiceAvailable
            ? <fieldset className="pf-addon">
                <legend>Benefício opcional do MeuEcoo</legend>
                <label className="ds-check"><input type="checkbox" className="ds-checkbox" checked={meuEcooSelected} onChange={event => setMeuEcooSelected(event.target.checked)} /><span><strong>Adicionar por {formatCurrency(meuEcooPricing.finalPriceCents)}/mês</strong><small>Preço cheio {formatCurrency(meuEcooPricing.basePriceCents)} · {proDiscountPercent}% de desconto</small></span></label>
              </fieldset>
            : planOption.meuEcooOffer && <p className="pf-offer__addon"><Icon name="sparkle" size={16} />{planOption.meuEcooOffer}</p>}
          <button type="button" className={`ds-btn ds-btn--block ${isCurrent && planActive ? 'ds-btn--secondary' : primary ? 'ds-btn--primary' : 'ds-btn--secondary'}`} onClick={() => choosePlan(planOption.id)} disabled={billingBusy || (isCurrent && planActive)}>
            {busyHere && <span className="ds-spinner" aria-hidden="true" />}
            {isCurrent && planActive ? 'Plano atual' : isCurrent ? 'Finalizar pagamento' : busyHere ? 'Processando…' : 'Escolher plano'}
          </button>
        </article>
      })}
    </div>
    <p className="ds-hint pf-plans__help">Sem assinatura ativa, a troca abre o checkout seguro e o novo plano só é ativado após a confirmação do pagamento. Com a assinatura ativa, a troca vale na hora, com cobrança proporcional. O sistema limita a uma cobrança por usuário no mês.</p>
    <button type="button" className="ds-go" onClick={() => onNavigate?.('integracoes')}>Gerenciar contas<Icon name="arrow" size={16} /></button>
  </section>

  const dataSection = <section className="pf-sec" id="pf-dados" aria-labelledby="pf-dados-title" key="pf-dados">
    <header className="pf-sec__head">
      <h2 className="pf-sec__title" id="pf-dados-title" tabIndex={-1}>Dados e preferências</h2>
      <p className="ds-head__desc">Como você aparece no app, seu fuso e os avisos que quer receber.</p>
    </header>
    <form className="pf-well" onSubmit={saveProfile}>
      <fieldset className="pf-group">
        <legend className="pf-group__title">Dados pessoais</legend>
        <div className="pf-fields">
          <div className="ds-field">
            <label className="ds-label" htmlFor="pf-name">Nome completo</label>
            <input id="pf-name" className="ds-input" value={form.fullName} onChange={event => updateForm('fullName', event.target.value)} maxLength={255} placeholder="Como você quer ser chamado" autoComplete="name" />
          </div>
          <div className="ds-field">
            <label className="ds-label" htmlFor="pf-email">E-mail</label>
            <input id="pf-email" className="ds-input" value={current.email || ''} disabled />
          </div>
        </div>
      </fieldset>
      <fieldset className="pf-group">
        <legend className="pf-group__title">Preferências</legend>
        <div className="pf-fields pf-fields--3">
          <div className="ds-field">
            <label className="ds-label" htmlFor="pf-language">Idioma</label>
            <span className="ds-select"><select id="pf-language" className="ds-select__control" value={form.language} onChange={event => updateForm('language', event.target.value)}><option value="pt-BR">Português (Brasil)</option><option value="en-US">English (United States)</option></select><Icon name="chevronDown" className="ds-select__chev" /></span>
          </div>
          <div className="ds-field">
            <label className="ds-label" htmlFor="pf-timezone">Fuso horário</label>
            <span className="ds-select"><select id="pf-timezone" className="ds-select__control" value={form.timezone} onChange={event => updateForm('timezone', event.target.value)}><option value="America/Sao_Paulo">Brasília (GMT-3)</option><option value="America/Manaus">Manaus (GMT-4)</option><option value="America/Belem">Belém (GMT-3)</option><option value="UTC">UTC</option></select><Icon name="chevronDown" className="ds-select__chev" /></span>
          </div>
          <div className="ds-field">
            <label className="ds-label" htmlFor="pf-network">Rede padrão para publicar</label>
            <span className="ds-select"><select id="pf-network" className="ds-select__control" value={form.defaultPlatform} onChange={event => updateForm('defaultPlatform', event.target.value)}><option value="">Escolher depois</option>{Object.entries(PLATFORM_LABELS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select><Icon name="chevronDown" className="ds-select__chev" /></span>
          </div>
        </div>
      </fieldset>
      <fieldset className="pf-group">
        <legend className="pf-group__title">Notificações</legend>
        <p className="ds-hint">Escolha quais atualizações devem aparecer para você.</p>
        <ul className="pf-toggles">
          {NOTIFICATION_OPTIONS.map(([key, label, description]) => <li key={key}>
            <label className="pf-toggle" htmlFor={`pf-note-${key}`}>
              <span><strong>{label}</strong><small>{description}</small></span>
              <input id={`pf-note-${key}`} type="checkbox" role="switch" className="ds-switch" checked={Boolean(notifications[key])} onChange={event => updateNotification(key, event.target.checked)} />
            </label>
          </li>)}
        </ul>
      </fieldset>
      {formError && <div className="ds-alert" data-tone="danger" role="alert"><Icon name="alertCircle" className="ds-alert__icon" /><p className="ds-alert__text">{formError}</p></div>}
      <footer className="pf-well__foot">
        <p className="ds-meta" aria-live="polite">{!savedForm ? 'Carregue o perfil para editar.' : dirty ? 'Você tem alterações não salvas.' : 'Tudo salvo.'}</p>
        <button type="submit" className="ds-btn ds-btn--primary" disabled={saving || !savedForm}>{saving ? <><span className="ds-spinner" aria-hidden="true" />Salvando…</> : 'Salvar alterações'}</button>
      </footer>
    </form>
  </section>

  const securitySection = <section className="pf-sec" id="pf-seguranca" aria-labelledby="pf-seguranca-title" key="pf-seguranca">
    <header className="pf-sec__head">
      <h2 className="pf-sec__title" id="pf-seguranca-title" tabIndex={-1}>Segurança</h2>
      <p className="ds-head__desc">Proteja o acesso à sua conta.</p>
    </header>
    <div className="pf-well">
      <div className="pf-line">
        <span className="ds-icontile" aria-hidden="true"><Icon name="shield" /></span>
        <div className="pf-line__text">
          <p className="pf-line__title">Autenticação em 2 fatores <span className="ds-status ds-status--soft" data-status={current.totpEnabled ? 'ok' : 'warning'}>{current.totpEnabled ? 'Ativa' : 'Recomendada'}</span></p>
          <p className="ds-meta">{current.totpEnabled ? 'Sua conta pede um código extra no login.' : 'Adicione uma camada extra de proteção.'}</p>
        </div>
        <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={() => onNavigate?.('seguranca')}>{current.totpEnabled ? 'Gerenciar' : 'Configurar'}</button>
      </div>
      <details className="ds-disclosure pf-pass" open={Boolean(passwordError) || undefined}>
        <summary><span className="pf-pass__sum"><Icon name="lock" size={18} />Alterar senha</span><Icon name="chevronDown" size={16} className="ds-disclosure__chev" /></summary>
        <form className="ds-disclosure__body pf-pass__body" onSubmit={changePassword} noValidate>
          <div className="ds-field">
            <label className="ds-label" htmlFor="pf-pass-current">Senha atual</label>
            <input id="pf-pass-current" className="ds-input" type="password" value={password.currentPassword} onChange={event => setPassword(values => ({ ...values, currentPassword: event.target.value }))} autoComplete="current-password" placeholder="Digite sua senha atual" />
            {current.googleConnected && <p className="ds-hint">Se você só entra com o Google e nunca criou uma senha, deixe em branco.</p>}
          </div>
          <div className="ds-field">
            <label className="ds-label" htmlFor="pf-pass-new">Nova senha</label>
            <input id="pf-pass-new" className="ds-input" type="password" value={password.newPassword} onChange={event => setPassword(values => ({ ...values, newPassword: event.target.value }))} autoComplete="new-password" placeholder="Mínimo de 8 caracteres" maxLength={PASSWORD_MAX_LENGTH} aria-describedby="pf-pass-rules" />
            <ul className="pf-rules" id="pf-pass-rules" aria-label="Requisitos da senha">
              {Object.entries(PASSWORD_RULE_LABELS).map(([key, label]) => <li key={key} data-state={rules[key] ? 'valid' : 'pending'}><Icon name={rules[key] ? 'checkCircle' : 'halfCircle'} size={14} />{label}<span className="ds-sr-only">{rules[key] ? ': atendido' : ': pendente'}</span></li>)}
            </ul>
          </div>
          <div className="ds-field">
            <label className="ds-label" htmlFor="pf-pass-confirm">Confirmar nova senha</label>
            <input id="pf-pass-confirm" className="ds-input" type="password" value={password.confirmation} onChange={event => setPassword(values => ({ ...values, confirmation: event.target.value }))} autoComplete="new-password" placeholder="Repita a nova senha" maxLength={PASSWORD_MAX_LENGTH} aria-invalid={Boolean(password.confirmation) && password.confirmation !== password.newPassword ? 'true' : undefined} />
          </div>
          <p className="ds-hint pf-pass__note"><Icon name="info" size={16} />Depois da troca, todas as sessões são encerradas, inclusive esta. Você entra de novo com a nova senha.</p>
          {passwordError && <div className="ds-alert" data-tone="danger" role="alert"><Icon name="alertCircle" className="ds-alert__icon" /><p className="ds-alert__text">{passwordError}</p></div>}
          <div><button type="submit" className="ds-btn ds-btn--secondary" disabled={passwordSaving}>{passwordSaving ? <><span className="ds-spinner" aria-hidden="true" />Alterando…</> : 'Alterar senha'}</button></div>
        </form>
      </details>
    </div>
  </section>

  const sessionSection = <section className="pf-sec" id="pf-sessoes" aria-labelledby="pf-sessoes-title" key="pf-sessoes">
    <header className="pf-sec__head">
      <h2 className="pf-sec__title" id="pf-sessoes-title" tabIndex={-1}>Sessões</h2>
      <p className="ds-head__desc">Onde sua conta está conectada agora.</p>
    </header>
    <div className="pf-well">
      <div className="pf-line">
        <span className="ds-icontile" aria-hidden="true"><Icon name="globe" /></span>
        <div className="pf-line__text">
          <p className="pf-line__title">Navegador atual <span className="ds-status ds-status--soft" data-status="ok">Conectado</span></p>
          <p className="ds-meta">Por segurança, cada sessão fica ativa por até 8 horas. Depois disso, é só entrar de novo.</p>
        </div>
        <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm pf-danger" onClick={logout}><Icon name="logout" size={16} />Sair desta conta</button>
      </div>
      <div className="pf-line pf-line--plain">
        <div className="pf-line__text">
          <p className="pf-line__title">Outros dispositivos</p>
          <p className="ds-meta">Se você acessou a conta em outro computador, encerre todas as sessões por segurança.</p>
        </div>
        <button type="button" className="ds-btn ds-btn--danger ds-btn--sm" onClick={logoutAll}>Sair de todos os dispositivos</button>
      </div>
      <button type="button" className="ds-go pf-well__go" onClick={() => onNavigate?.('atividade')}>Abrir histórico de atividades<Icon name="arrow" size={16} /></button>
    </div>
  </section>

  const helpSection = <section className="pf-sec" id="pf-ajuda" aria-labelledby="pf-ajuda-title" key="pf-ajuda">
    <header className="pf-sec__head">
      <h2 className="pf-sec__title" id="pf-ajuda-title" tabIndex={-1}>Ajuda</h2>
      <p className="ds-head__desc">Reveja o tour pelo app ou fale com a gente.</p>
    </header>
    <div className="pf-well">
      <div className="pf-line">
        <span className="ds-icontile" data-done={tutorialStatus.completed || undefined} aria-hidden="true"><Icon name={tutorialStatus.completed ? 'checkCircle' : 'play'} /></span>
        <div className="pf-line__text">
          <p className="pf-line__title">{tutorialStatus.completed ? 'Você já completou o tutorial' : 'Você ainda não completou o tutorial'} <span className="ds-status ds-status--soft" data-status={tutorialStatus.completed ? 'ok' : 'muted'}>{tutorialStatus.completed ? 'Concluído' : 'Pendente'}</span></p>
          <p className="ds-meta">{tutorialStatus.completed && tutorialStatus.completedAt ? `Concluído em ${formatDateTime(tutorialStatus.completedAt)}. Pode rever quando quiser.` : 'Um tour rápido pelas principais telas da plataforma.'}</p>
        </div>
        <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={requestTutorialOpen}>{tutorialStatus.completed ? 'Rever tutorial' : 'Iniciar tutorial'}</button>
      </div>
      <nav className="pf-links" aria-label="Links de ajuda">
        <span className="ds-meta">Precisa de ajuda?</span>
        <a href="/support">Suporte</a>
        <a href="/privacy-policy">Política de privacidade</a>
        <a href="/terms-of-service">Termos de serviço</a>
      </nav>
    </div>
  </section>

  const sectionContent = { 'pf-plano': planSection, 'pf-dados': dataSection, 'pf-seguranca': securitySection, 'pf-sessoes': sessionSection, 'pf-ajuda': helpSection }

  return <div className="ds-page pf" data-ds-root>
    <header className="ds-pagehead pf-head">
      <div className="ds-pagehead__text">
        <p className="ds-eyebrow">Minha conta</p>
        <h1 className="ds-pagehead__title">Meu perfil</h1>
        <p className="ds-pagehead__lede">Gerencie seus dados, preferências e segurança em um só lugar.</p>
      </div>
    </header>

    {loadError && <div className="ds-alert" data-tone="danger" role="alert">
      <Icon name="alertCircle" className="ds-alert__icon" />
      <p className="ds-alert__title">Não foi possível carregar seu perfil</p>
      <p className="ds-alert__text">{loadError} Para não apagar suas preferências, salvar fica desativado até carregar.</p>
      <div className="ds-alert__actions"><button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={loadProfile} disabled={loading}><Icon name="refresh" size={16} />Tentar de novo</button></div>
    </div>}

    <div className="pf-id">
      <span className="pf-avatar">{avatar ? <img src={avatar} alt="Foto do perfil" /> : <span aria-hidden="true">{initials(current)}</span>}</span>
      <div className="pf-id__text">
        <p className="pf-id__name">{current.fullName || 'Seu nome'} <span className="ds-badge" data-tone="outline">{roleLabel}</span></p>
        <p className="pf-id__email">{current.email}</p>
        <p className="ds-meta">Conta criada em {formatDate(current.createdAt)}</p>
      </div>
      <div className="pf-id__actions">
        <label className="ds-btn ds-btn--secondary ds-btn--sm pf-filebtn">
          {avatarSaving ? <><span className="ds-spinner" aria-hidden="true" />Enviando…</> : <><Icon name="upload" size={16} />Alterar foto</>}
          <input className="pf-fileinput" type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={changeAvatar} disabled={avatarSaving} />
        </label>
        {avatar && <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm pf-danger" onClick={removeAvatar} disabled={avatarSaving}>Remover</button>}
      </div>
    </div>

    <div className="pf-frame">
      <nav className="pf-nav" aria-label="Seções do perfil">
        <ul>{orderedSections.map(section => <li key={section.id}><button type="button" onClick={() => scrollToSection(section.id)}><Icon name={section.icon} size={18} />{section.label}{section.id === 'pf-plano' && !planActive && <><span className="pf-nav__dot" aria-hidden="true" /><span className="ds-sr-only"> (pagamento pendente)</span></>}</button></li>)}</ul>
      </nav>
      <div className="pf-content">
        {orderedSections.map(section => sectionContent[section.id])}
      </div>
    </div>
  </div>
}
