import { useEffect, useMemo, useState } from 'react'
import { API_URL, ApiError, apiFetch, publicApiFetch } from '../lib/api.js'
import { ThemeSelector } from '../components/ui/theme-selector.jsx'
import { PLANS } from '../lib/plans.js'
import { CopyrightNotice } from '../components/ui/copyright-notice.jsx'
import { Icon, NetworkGlyph } from '../components/ui/icon.jsx'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_RULE_LABELS, passwordRules } from '../lib/password-rules.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const VALID_PLANS = new Set(Object.keys(PLANS))
const RULE_FAILURE_MESSAGE = 'A senha precisa ter de 8 a 72 caracteres, uma maiúscula, um número e um caractere especial.'
const CODE_FORMAT_MESSAGE = 'Digite o código de 6 dígitos do app autenticador.'

const AUTH_ERROR_MESSAGES = new Set([
  'Login com Google cancelado.',
  'Sessão de login inválida ou expirada. Tente novamente.',
  'Não foi possível entrar com o Google agora. Tente novamente em alguns minutos.',
  'Não foi possível obter seu e-mail do Google.'
])

// Parâmetros da tela de autenticação são apenas estado de apresentação. Não
// devem aceitar HTML, URLs de redirecionamento, planos arbitrários ou texto
// ilimitado vindo da barra de endereço.
export function parseLoginQuery(search = '') {
  const params = new URLSearchParams(search)
  const rawPlan = params.get('plan')
  const rawError = params.get('error')
  return {
    register: params.get('register') === '1',
    selectedPlan: VALID_PLANS.has(rawPlan) ? rawPlan : null,
    error: AUTH_ERROR_MESSAGES.has(rawError) ? rawError : null
  }
}

function validEmail(email) {
  return EMAIL_PATTERN.test(email.trim())
}

function maskEmail(email) {
  const [local, domain] = email.split('@')
  if (!domain) return email
  const mask = (value, keepEnd = false) => {
    if (value.length <= 2) return `${value[0] || ''}${'*'.repeat(Math.max(1, value.length - 1))}`
    const end = keepEnd ? value.slice(-2) : ''
    return `${value.slice(0, 2)}${'*'.repeat(Math.max(1, value.length - 2 - end.length))}${end}`
  }
  const domainParts = domain.split('.')
  return `${mask(local, true)}@${mask(domainParts[0])}${domainParts.slice(1).length ? `.${domainParts.slice(1).join('.')}` : ''}`
}

const MESSAGE_TONES = { error: 'danger', warning: 'warning', success: 'success' }
const MESSAGE_ICONS = { error: 'alertCircle', warning: 'alertTriangle', success: 'checkCircle' }

function Message({ message }) {
  if (!message) return null
  return <div className="ds-alert au-message" data-tone={MESSAGE_TONES[message.type] || undefined} role="alert">
    <Icon name={MESSAGE_ICONS[message.type] || 'info'} className="ds-alert__icon" />
    <p className="ds-alert__text">{message.text}</p>
    {message.action && <div className="ds-alert__actions"><button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={message.action.onClick}>{message.action.label}</button></div>}
  </div>
}

// Ícone oficial do Google (multicolor), pra o botão de OAuth não depender só
// de texto pra se identificar como o provedor certo.
function GoogleIcon() {
  return <svg className="au-google" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62Z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18Z" />
    <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33Z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
  </svg>
}

// Alterna a visibilidade da senha — puramente apresentacional, não muda o
// valor nem como ele é enviado ao backend.
function PasswordToggle({ shown, onToggle }) {
  return <button type="button" className="au-eye" onClick={onToggle} aria-label={shown ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={shown}>
    <Icon name="eye" size={18} />
    {shown && <span className="au-eye__slash" aria-hidden="true" />}
  </button>
}

// Mesma lista de regras em todas as telas que criam senha, ligada ao campo.
function PasswordRules({ rules, id }) {
  return <ul className="au-rules" id={id} aria-label="Requisitos da senha">
    {Object.entries(PASSWORD_RULE_LABELS).map(([key, label]) => <li key={key} data-state={rules[key] ? 'valid' : 'pending'}>
      <Icon name={rules[key] ? 'checkCircle' : 'halfCircle'} size={14} />{label}<span className="ds-sr-only">{rules[key] ? ': atendida' : ': pendente'}</span>
    </li>)}
  </ul>
}

function CodeInput({ value, onChange, autoFocus = true, required = false }) {
  return <input
    className="ds-input au-code"
    inputMode="numeric"
    autoComplete="one-time-code"
    maxLength="6"
    value={value}
    onChange={event => onChange(event.target.value.replace(/\D/g, ''))}
    placeholder="000000"
    aria-label="Código do autenticador"
    autoFocus={autoFocus}
    required={required}
  />
}

function Spinner() {
  return <span className="ds-spinner" aria-hidden="true" />
}

function AuthCard({ children }) {
  return <div className="au" data-ds-root>
    <aside className="au-story" aria-hidden="true">
      <div className="au-story__inner">
        <p className="au-story__eyebrow">Meu Ecoo Mídia</p>
        <p className="au-story__title">Mais presença nas redes.<br /><em>Menos peso na rotina.</em></p>
        <p className="au-story__text">Gerencie todas as suas redes em um só lugar: planeje o ano inteiro, agende publicações e acompanhe seus resultados.</p>
        <ul className="au-story__nets">{['instagram', 'facebook', 'youtube', 'tiktok'].map(network => <li key={network}><NetworkGlyph network={network} size={20} /></li>)}</ul>
      </div>
    </aside>
    <main className="au-main">
      <div className="au-top">
        <a className="au-logo" href="/" aria-label="Meu Ecoo Mídia - início"><img src="/logo.png" alt="Meu Ecoo Mídia" /></a>
        <ThemeSelector />
      </div>
      <section className="au-sheet">{children}</section>
      <footer className="au-foot"><CopyrightNotice /></footer>
    </main>
  </div>
}

function appPathForPlan(planActive) {
  return planActive === false ? '/app/perfil' : '/app.html'
}

const FLOW_SUBTITLES = {
  'login-2fa': 'Digite o código de 6 dígitos do seu app autenticador para concluir o login.',
  'forgot-2fa': 'Confirme com o código do autenticador para criar uma nova senha.',
  'forgot-email': 'Informe seu e-mail e enviaremos um link para criar uma nova senha.',
  'forgot-sent': 'Confira sua caixa de entrada.',
}

export function LoginPage() {
  const initialQuery = useMemo(() => parseLoginQuery(window.location.search), [])
  const { selectedPlan, error: queryError } = initialQuery
  const [register, setRegister] = useState(initialQuery.register)
  const [flow, setFlow] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const rules = passwordRules(password)

  useEffect(() => {
    if (queryError) setMessage({ type: 'error', text: queryError })
  }, [queryError])

  useEffect(() => {
    // Remove register/plan/error e qualquer parâmetro desconhecido do
    // histórico assim que a tela é carregada. Isso reduz exposição em
    // histórico, screenshots, referrers e ferramentas de suporte.
    if (window.location.search) {
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
    }
  }, [])

  const submitCredentials = async event => {
    event.preventDefault()
    if (!validEmail(email)) return setMessage({ type: 'error', text: 'Informe um e-mail válido.' })
    if (register && !Object.values(passwordRules(password)).every(Boolean)) return setMessage({ type: 'error', text: RULE_FAILURE_MESSAGE })
    setBusy(true)
    setMessage(null)
    let accountCreated = false
    try {
      const endpoint = register ? '/auth/login/register' : '/auth/login/login'
      const data = await publicApiFetch(endpoint, { method: 'POST', body: JSON.stringify({ email: email.trim(), password, fullName: fullName.trim() || undefined, plan: register ? selectedPlan || undefined : undefined }) })
      accountCreated = register
      if (register && data.requiresPayment && data.selectedPlan) {
        const billing = await apiFetch('/api/billing/plan-change', { method: 'POST', body: JSON.stringify({ plan: data.selectedPlan }) })
        if (!billing.checkoutUrl) throw new ApiError('O checkout não foi criado. Tente novamente em instantes.', 503)
        window.location.assign(billing.checkoutUrl)
        return
      }
      if (data.requires2fa) {
        if (data.passwordUpgradeRecommended) {
          setMessage({ type: 'warning', text: 'Sua senha atual ainda funciona, mas é mais curta que o padrão de segurança. Recomendamos trocar por uma senha com pelo menos 8 caracteres.', action: { label: 'Trocar senha agora', onClick: () => { setFlow('forgot-email'); setMessage(null) } } })
        }
        setFlow('login-2fa')
        return
      }
      if (data.passwordUpgradeRecommended) {
        const redirectTimer = window.setTimeout(() => window.location.assign(appPathForPlan(data.planActive)), 6000)
        setMessage({ type: 'warning', text: 'Sua senha atual ainda funciona, mas é mais curta que o padrão de segurança. Para proteger melhor sua conta, recomendamos trocar por uma senha com 8 a 72 caracteres. Você entra no app em alguns segundos.', action: { label: 'Trocar senha agora', onClick: () => { window.clearTimeout(redirectTimer); setFlow('forgot-email'); setMessage(null) } } })
        return
      }
      window.location.assign(appPathForPlan(data.planActive))
    } catch (error) {
      const text = error instanceof ApiError ? error.message : 'Não foi possível conectar ao servidor.'
      // Se o cadastro já passou e só o checkout falhou, a conta existe: tentar
      // "Criar conta" de novo daria "Já existe uma conta". O caminho é o perfil.
      if (accountCreated) {
        setMessage({ type: 'error', text: `Sua conta foi criada, mas o pagamento não abriu: ${text} Escolha o plano no seu perfil para concluir.`, action: { label: 'Ir para meu perfil', onClick: () => window.location.assign('/app/perfil') } })
      } else {
        setMessage({ type: 'error', text })
      }
    } finally {
      setBusy(false)
    }
  }

  const verifyLoginCode = async event => {
    event.preventDefault()
    if (!/^\d{6}$/.test(code)) return setMessage({ type: 'error', text: CODE_FORMAT_MESSAGE })
    setBusy(true)
    try {
      const data = await publicApiFetch('/auth/login/verify-2fa', { method: 'POST', body: JSON.stringify({ code }) })
      window.location.assign(appPathForPlan(data.planActive))
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Não foi possível verificar o código.' })
    } finally { setBusy(false) }
  }

  const verifyResetCode = async event => {
    event.preventDefault()
    if (!/^\d{6}$/.test(code)) return setMessage({ type: 'error', text: CODE_FORMAT_MESSAGE })
    setBusy(true)
    try {
      const data = await publicApiFetch('/auth/login/reset-2fa', { method: 'POST', body: JSON.stringify({ email: email.trim(), code }) })
      window.location.assign(`/reset-password.html#token=${encodeURIComponent(data.token)}`)
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Não foi possível verificar o código.' })
    } finally { setBusy(false) }
  }

  const startReset = async event => {
    event.preventDefault()
    if (!validEmail(email)) return setMessage({ type: 'error', text: 'Informe um e-mail válido.' })
    setBusy(true)
    setMessage(null)
    try {
      const data = await publicApiFetch('/auth/login/forgot-password', { method: 'POST', body: JSON.stringify({ email: email.trim() }) })
      setFlow('forgot-sent')
      setMessage({ type: 'success', text: data?.mensagem || 'Se esse e-mail tiver uma conta, enviaremos um link de redefinição.' })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof ApiError ? error.message : 'Não foi possível enviar o link agora.' })
    } finally {
      setBusy(false)
    }
  }

  const backToLogin = () => { setFlow('login'); setCode(''); setMessage(null) }
  const title = register ? 'Criar conta' : flow === 'login-2fa' ? 'Confirmar acesso' : flow === 'forgot-email' ? 'Redefinir senha' : flow === 'forgot-sent' ? 'Verifique seu e-mail' : 'Acesse sua conta'
  const subtitle = register ? 'Crie sua conta para começar a organizar suas redes sociais.' : FLOW_SUBTITLES[flow] || 'Entre para acessar o gerenciador das suas redes sociais.'
  // No "verifique seu e-mail" o painel já explica; o aviso de sucesso não precisa repetir.
  const visibleMessage = flow === 'forgot-sent' && message?.type === 'success' ? null : message

  return <AuthCard>
    <header className="au-head">
      <h1 className="au-title">{title}</h1>
      <p className="au-subtitle">{subtitle}</p>
    </header>
    {register && selectedPlan && flow === 'login' && <p className="au-plan"><Icon name="crown" size={16} />Plano selecionado: <strong>{PLANS[selectedPlan]?.name || selectedPlan}</strong></p>}
    <Message message={visibleMessage} />

    {flow === 'login-2fa' && <form onSubmit={verifyLoginCode} className="au-fields" noValidate>
      <div className="ds-field">
        <p className="ds-label" aria-hidden="true">Código do autenticador</p>
        <CodeInput value={code} onChange={setCode} />
        <p className="ds-hint">O código muda a cada 30 segundos. A confirmação vale por alguns minutos depois da senha.</p>
      </div>
      <button type="submit" className="ds-btn ds-btn--primary ds-btn--block" disabled={busy}>{busy && <Spinner />}{busy ? 'Verificando…' : 'Confirmar'}</button>
    </form>}

    {flow === 'forgot-2fa' && <form onSubmit={verifyResetCode} className="au-fields" noValidate>
      <p className="au-help">Digite o código do autenticador para <strong>{maskEmail(email)}</strong>.</p>
      <CodeInput value={code} onChange={setCode} />
      <button type="submit" className="ds-btn ds-btn--primary ds-btn--block" disabled={busy}>{busy && <Spinner />}{busy ? 'Verificando…' : 'Verificar código'}</button>
      <button type="button" className="ds-btn ds-btn--secondary ds-btn--block" onClick={() => setFlow('forgot-email')}>Corrigir e-mail</button>
    </form>}

    {flow === 'forgot-email' && <form onSubmit={startReset} className="au-fields" noValidate>
      <div className="ds-field">
        <label className="ds-label" htmlFor="forgot-email">Informe seu e-mail</label>
        <input id="forgot-email" className="ds-input" type="email" inputMode="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="voce@exemplo.com" autoFocus required />
      </div>
      <button type="submit" className="ds-btn ds-btn--primary ds-btn--block" disabled={busy}>{busy && <Spinner />}{busy ? 'Enviando…' : 'Enviar link de redefinição'}</button>
    </form>}

    {flow === 'forgot-sent' && <div className="au-fields">
      <div className="au-sent" role="status">
        <span className="au-sent__icon" aria-hidden="true"><Icon name="mail" size={22} /></span>
        <p className="au-help">Se o endereço <strong>{maskEmail(email)}</strong> estiver cadastrado, enviamos um link para criar uma nova senha. Verifique também a pasta de spam.</p>
      </div>
      <button type="button" className="ds-btn ds-btn--secondary ds-btn--block" onClick={() => { setFlow('forgot-email'); setMessage(null) }}>Usar outro e-mail</button>
    </div>}

    {flow === 'login' && <>
      <form onSubmit={submitCredentials} className="au-fields" noValidate>
        {register && <div className="ds-field">
          <label className="ds-label" htmlFor="full-name">Nome</label>
          <input id="full-name" className="ds-input" value={fullName} onChange={event => setFullName(event.target.value)} autoComplete="name" placeholder="Como devemos te chamar?" />
        </div>}
        <div className="ds-field">
          <label className="ds-label" htmlFor="email">E-mail</label>
          <input id="email" className="ds-input" type="email" inputMode="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="voce@exemplo.com" required />
        </div>
        <div className="ds-field">
          <div className="ds-field__top">
            <label className="ds-label" htmlFor="password">Senha</label>
            {!register && <button type="button" className="au-link" onClick={() => { setFlow('forgot-email'); setMessage(null) }}>Esqueceu?</button>}
          </div>
          <div className="au-pass">
            <input id="password" className="ds-input" type={showPassword ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? PASSWORD_MIN_LENGTH : undefined} maxLength={PASSWORD_MAX_LENGTH} value={password} onChange={event => setPassword(event.target.value)} placeholder={register ? 'Crie uma senha segura' : 'Sua senha'} required aria-describedby={register ? 'au-rules' : undefined} />
            <PasswordToggle shown={showPassword} onToggle={() => setShowPassword(value => !value)} />
          </div>
          {register && <PasswordRules rules={rules} id="au-rules" />}
        </div>
        <button type="submit" className="ds-btn ds-btn--primary ds-btn--block au-submit" disabled={busy}>{busy && <Spinner />}{busy ? 'Aguarde…' : register ? 'Criar conta' : 'Entrar'}</button>
      </form>
      <div className="au-divider"><span>ou</span></div>
      <a className="ds-btn ds-btn--secondary ds-btn--block au-googlebtn" href={`${API_URL}/auth/login/google`}><GoogleIcon />Continuar com o Google</a>
    </>}

    <nav className="au-links" aria-label="Outras opções">
      {flow === 'login' && <p>{register ? 'Já tem uma conta?' : 'Ainda não tem conta?'} <button type="button" className="au-link" onClick={() => { setRegister(!register); setMessage(null) }}>{register ? 'Entrar' : 'Criar conta'}</button></p>}
      {flow !== 'login' && <p><button type="button" className="au-link au-back" onClick={backToLogin}><Icon name="arrowLeft" size={16} />Voltar para o login</button></p>}
      <p className="au-legal"><a href="/privacy-policy">Política de Privacidade</a><a href="/terms-of-service">Termos de Serviço</a></p>
    </nav>
  </AuthCard>
}

export function readResetToken(location = window.location) {
  const hashToken = new URLSearchParams(String(location.hash || '').replace(/^#/, '')).get('token')
  const queryToken = new URLSearchParams(String(location.search || '')).get('token')
  return hashToken || queryToken
}

export function ResetPasswordPage() {
  const token = useMemo(() => {
    const value = readResetToken()
    if (value) window.history.replaceState({}, document.title, window.location.pathname)
    return value
  }, [])
  const [valid, setValid] = useState(null)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const rules = passwordRules(password)

  useEffect(() => {
    if (!token) return setValid(false)
    publicApiFetch('/auth/login/reset-password/validar', { method: 'POST', body: JSON.stringify({ token }) }).then(data => setValid(data.valido)).catch(() => setValid(false))
  }, [token])

  const submit = async event => {
    event.preventDefault()
    if (!Object.values(rules).every(Boolean)) return setMessage({ type: 'error', text: RULE_FAILURE_MESSAGE })
    if (password !== confirmation) return setMessage({ type: 'error', text: 'As senhas não são iguais.' })
    setBusy(true)
    try {
      await publicApiFetch('/auth/login/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) })
      setDone(true)
      setMessage({ type: 'success', text: 'Senha redefinida com sucesso! Redirecionando para o login…' })
      setTimeout(() => window.location.assign('/login.html'), 1800)
    } catch (error) { setMessage({ type: 'error', text: error.message || 'Não foi possível redefinir sua senha.' }) }
    finally { setBusy(false) }
  }

  return <AuthCard>
    <header className="au-head">
      <h1 className="au-title">Criar nova senha</h1>
      <p className="au-subtitle">{valid === null ? 'Verificando seu link…' : valid ? 'Escolha uma nova senha para acessar sua conta.' : 'Esse link não é mais válido ou já expirou.'}</p>
    </header>
    <Message message={message} />
    {valid === null && <div className="au-fields" aria-busy="true"><span className="ds-skel au-skel" /><span className="ds-skel au-skel" /></div>}
    {valid === false && <div className="au-sent" data-tone="warning">
      <span className="au-sent__icon" aria-hidden="true"><Icon name="clock" size={22} /></span>
      <p className="au-help">Peça um link novo em “Esqueceu?”, na tela de login.</p>
    </div>}
    {valid && <form onSubmit={submit} className="au-fields" noValidate>
      <div className="ds-field">
        <label className="ds-label" htmlFor="new-password">Nova senha</label>
        <div className="au-pass">
          <input id="new-password" className="ds-input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} value={password} onChange={event => setPassword(event.target.value)} autoFocus required aria-describedby="au-reset-rules" disabled={done} />
          <PasswordToggle shown={showPassword} onToggle={() => setShowPassword(value => !value)} />
        </div>
        <PasswordRules rules={rules} id="au-reset-rules" />
      </div>
      <div className="ds-field">
        <label className="ds-label" htmlFor="confirm-password">Confirme a nova senha</label>
        <input id="confirm-password" className="ds-input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} value={confirmation} onChange={event => setConfirmation(event.target.value)} required disabled={done} aria-invalid={Boolean(confirmation) && confirmation !== password ? 'true' : undefined} />
      </div>
      <button type="submit" className="ds-btn ds-btn--primary ds-btn--block" disabled={busy || done}>{busy && <Spinner />}{busy ? 'Salvando…' : 'Salvar nova senha'}</button>
    </form>}
    <nav className="au-links" aria-label="Outras opções">
      <p><a className="au-link au-back" href="/login.html"><Icon name="arrowLeft" size={16} />Voltar para o login</a></p>
    </nav>
  </AuthCard>
}

export function VerifyTwoFactorPage() {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const submit = async event => {
    event.preventDefault()
    if (!/^\d{6}$/.test(code)) return setMessage({ type: 'error', text: CODE_FORMAT_MESSAGE })
    setBusy(true)
    try {
      await publicApiFetch('/auth/login/verify-2fa', { method: 'POST', body: JSON.stringify({ code }) })
      window.location.assign('/app.html')
    } catch (error) { setMessage({ type: 'error', text: error.message || 'Não foi possível verificar o código.' }) }
    finally { setBusy(false) }
  }

  return <AuthCard>
    <header className="au-head">
      <h1 className="au-title">Confirmar acesso</h1>
      <p className="au-subtitle">Digite o código de 6 dígitos do seu app autenticador para concluir o login.</p>
    </header>
    <Message message={message} />
    <form onSubmit={submit} className="au-fields" noValidate>
      <div className="ds-field">
        <p className="ds-label" aria-hidden="true">Código do autenticador</p>
        <CodeInput value={code} onChange={setCode} required />
        <p className="ds-hint">O código muda a cada 30 segundos. A confirmação vale por alguns minutos depois do login com o Google.</p>
      </div>
      <button type="submit" className="ds-btn ds-btn--primary ds-btn--block" disabled={busy}>{busy && <Spinner />}{busy ? 'Verificando…' : 'Confirmar'}</button>
    </form>
    <nav className="au-links" aria-label="Outras opções">
      <p><a className="au-link au-back" href="/login.html"><Icon name="arrowLeft" size={16} />Voltar para o login</a></p>
    </nav>
  </AuthCard>
}
