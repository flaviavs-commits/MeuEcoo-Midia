import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { API_URL, ApiError, apiFetch, forgetSession, mayHaveSession, publicApiFetch } from '../lib/api.js'
import { describeAuthError } from '../lib/auth-errors.js'
import { isReturnPage, pathForReturnPage } from '../lib/app-pages.js'
import { navigateTo, replaceWith } from '../lib/navigation.js'
import { PLANS } from '../lib/plans.js'
import { PASSWORD_MAX_LENGTH, PASSWORD_RULE_LABELS, passwordRules } from '../lib/password-rules.js'
import { Icon } from '../components/ui/icon.jsx'
import { PasswordInput } from '../components/ui/password-input.jsx'
import { ThemeSelector } from '../components/ui/theme-selector.jsx'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_MAX_LENGTH = 254
const NAME_MAX_LENGTH = 255
const VALID_PLANS = new Set(Object.keys(PLANS))
const MODES = new Set(['signup', 'forgot'])

// Textos que o callback do Google pode devolver em /login.html?error=. A tela
// só mostra mensagens conhecidas: nada de HTML ou texto livre vindo da URL.
const OAUTH_ERRORS = new Set([
  'Login com Google cancelado.',
  'Sessão de login inválida ou expirada. Tente novamente.',
  'Não foi possível entrar com o Google agora. Tente novamente em alguns minutos.',
  'Não foi possível obter seu e-mail do Google.',
])
// Conta Google de um domínio fora da lista permitida (ALLOWED_EMAIL_DOMAINS).
const OAUTH_DOMAIN_ERROR = /^Use um e-mail @[a-z0-9.-]+\.[a-z]{2,}(?:, @[a-z0-9.-]+\.[a-z]{2,})* para acessar a aplicação\.$/i

// Parâmetros da tela de autenticação são só estado de apresentação: modo,
// plano conhecido, mensagem conhecida e a chave da página de retorno (uma
// lista fechada; nunca uma URL). Todo o resto é descartado.
export function parseLoginQuery(search = '') {
  const params = new URLSearchParams(search)
  const rawMode = params.get('mode')
  const rawPlan = params.get('plan')
  const rawError = params.get('error') || ''
  const rawNext = params.get('next')
  return {
    mode: MODES.has(rawMode) ? rawMode : params.get('register') === '1' ? 'signup' : 'login',
    selectedPlan: VALID_PLANS.has(rawPlan) ? rawPlan : null,
    error: OAUTH_ERRORS.has(rawError) || (rawError.length <= 200 && OAUTH_DOMAIN_ERROR.test(rawError)) ? rawError : null,
    next: isReturnPage(rawNext) ? rawNext : null,
  }
}

// Endereço canônico: só o necessário para recarregar no mesmo ponto.
// ?register=1 (links antigos) vira ?mode=signup.
export function loginSearch({ mode, plan, next }) {
  const params = new URLSearchParams()
  if (MODES.has(mode)) params.set('mode', mode)
  if (mode === 'signup' && plan) params.set('plan', plan)
  if (next) params.set('next', next)
  const text = params.toString()
  return text ? `?${text}` : ''
}

export function readResetToken(location = window.location) {
  const hashToken = new URLSearchParams(String(location.hash || '').replace(/^#/, '')).get('token')
  const queryToken = new URLSearchParams(String(location.search || '')).get('token')
  return hashToken || queryToken
}

function maskEmail(email) {
  const [local, domain] = email.trim().split('@')
  if (!domain) return email
  const mask = (value, keepEnd = false) => {
    if (value.length <= 2) return `${value[0] || ''}${'*'.repeat(Math.max(1, value.length - 1))}`
    const end = keepEnd ? value.slice(-2) : ''
    return `${value.slice(0, 2)}${'*'.repeat(Math.max(1, value.length - 2 - end.length))}${end}`
  }
  const domainParts = domain.split('.')
  return `${mask(local, true)}@${mask(domainParts[0])}${domainParts.length > 1 ? `.${domainParts.slice(1).join('.')}` : ''}`
}

function destinationFor(planActive, next) {
  // Conta sem plano ativo conclui a assinatura pelo perfil antes de qualquer outra página.
  if (planActive === false) return '/app/perfil'
  return next ? pathForReturnPage(next) : '/app.html'
}

function planLabel(plan) {
  return String(PLANS[plan]?.name || plan).replace(/^EcooMidia\s+/i, '')
}

const matches = query => typeof window !== 'undefined' && Boolean(window.matchMedia?.(query).matches)
const finePointer = () => matches('(hover: hover) and (pointer: fine)')
const reducedMotion = () => matches('(prefers-reduced-motion: reduce)')

function validateEmail(value) {
  const email = value.trim()
  if (!email) return 'Digite seu e-mail.'
  if (!EMAIL_PATTERN.test(email)) return 'Digite um endereço de e-mail válido.'
  return null
}

function validatePassword(value, creating) {
  if (!value) return creating ? 'Crie uma senha.' : 'Digite sua senha.'
  if (creating && !Object.values(passwordRules(value)).every(Boolean)) return 'A senha ainda não cumpre os requisitos.'
  return null
}

const asError = text => (text ? { text } : null)

// O preenchimento automático pode colocar valor no campo sem passar pelo
// onChange; no envio, o valor do próprio campo é a fonte da verdade.
function readField(form, name, fallback) {
  const field = form?.elements?.namedItem(name)
  return field && typeof field.value === 'string' ? field.value : fallback
}

function useDocumentTitle(title) {
  useEffect(() => {
    document.title = `${title} · Meu Ecoo Mídia`
  }, [title])
}

// Mantém o último valor não vazio enquanto a área se fecha, para a mensagem
// não sumir antes da animação terminar.
function useSticky(value) {
  const last = useRef(value)
  if (value) last.current = value
  return value || last.current
}

// Área que abre e fecha animando a altura (grid 0fr -> 1fr), sem medir nada
// em JS. Fechada, fica fora do foco e da árvore de acessibilidade.
function Reveal({ open, children }) {
  return <div className="au-reveal" data-open={open ? '' : undefined} inert={!open}>
    <div className="au-reveal__inner">{children}</div>
  </div>
}

// Anima a altura do cartão quando o conteúdo troca de etapa (ex.: entrar ->
// esqueci a senha), em vez de pular de tamanho.
function useStageHeight(ref, stage) {
  const lastHeight = useRef(0)
  const firstRun = useRef(true)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node || typeof ResizeObserver !== 'function') return undefined
    lastHeight.current = node.offsetHeight
    const observer = new ResizeObserver(() => {
      if (!('resizing' in node.dataset)) lastHeight.current = node.offsetHeight
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])

  useLayoutEffect(() => {
    if (firstRun.current) { firstRun.current = false; return undefined }
    const node = ref.current
    const from = lastHeight.current
    if (!node || !from || reducedMotion() || typeof ResizeObserver !== 'function') return undefined
    const to = node.offsetHeight
    if (Math.abs(from - to) < 2) return undefined
    node.dataset.resizing = ''
    node.style.height = `${from}px`
    node.getBoundingClientRect()
    node.style.height = `${to}px`
    let done = false
    const finish = () => {
      if (done) return
      done = true
      node.style.height = ''
      delete node.dataset.resizing
      lastHeight.current = node.offsetHeight
    }
    const onEnd = event => { if (event.target === node && event.propertyName === 'height') finish() }
    node.addEventListener('transitionend', onEnd)
    const timer = window.setTimeout(finish, 320)
    return () => {
      window.clearTimeout(timer)
      node.removeEventListener('transitionend', onEnd)
      finish()
    }
  }, [ref, stage])
}

// Ícone oficial do Google (multicolorido): o botão não depende só do texto
// para ser reconhecido.
function GoogleIcon() {
  return <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62Z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18Z" />
    <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33Z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
  </svg>
}

// O login com Google é um redirecionamento do backend (/auth/login/google).
// Ele não leva a página de retorno: o backend decide o destino no callback.
function GoogleButton({ disabled }) {
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    const onShow = event => { if (event.persisted) setLeaving(false) }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])
  const blocked = disabled || leaving
  return <a
    className="ds-btn ds-btn--secondary ds-btn--lg ds-btn--block au-google"
    href={`${API_URL}/auth/login/google`}
    aria-disabled={blocked || undefined}
    onClick={event => {
      if (blocked) { event.preventDefault(); return }
      setLeaving(true)
    }}
  >
    {leaving ? <span className="ds-spinner au-spinner" aria-hidden="true" /> : <GoogleIcon />}
    <span>{leaving ? 'Abrindo o Google…' : 'Continuar com o Google'}</span>
  </a>
}

function ErrorLine({ id, error }) {
  const shown = useSticky(error)
  return <Reveal open={Boolean(error)}>
    {shown && <p className="au-error" id={id}>
      <Icon name="alertCircle" size={16} />
      <span>{shown.text}{shown.action && <> <button type="button" className="au-link" onClick={shown.action.onClick}>{shown.action.label}</button></>}</span>
    </p>}
  </Reveal>
}

// Aviso do formulário inteiro (falha de rede, limite de tentativas...). Cada
// aviso novo remonta o elemento para o leitor de tela anunciar de novo.
function FormAlert({ alert }) {
  const shown = useSticky(alert)
  const tone = shown?.tone || 'danger'
  return <Reveal open={Boolean(alert)}>
    {shown && <div key={shown.key} className="au-alert" data-tone={tone} role="alert">
      <Icon name={tone === 'warning' ? 'alertTriangle' : 'alertCircle'} size={16} />
      <p>{shown.text}{shown.action && <> <button type="button" className="au-link" onClick={shown.action.onClick}>{shown.action.label}</button></>}</p>
    </div>}
  </Reveal>
}

// O "aside" (ex.: "Esqueci minha senha") aparece na linha do rótulo, mas vem
// depois do campo no DOM: o Tab vai do e-mail direto para a senha.
function Field({ id, label, aside, error, footer, footerId, children }) {
  const errorId = `${id}-erro`
  const describedBy = [error ? errorId : null, footerId].filter(Boolean).join(' ') || undefined
  return <div className="au-field">
    <label className="ds-label au-field__label" htmlFor={id}>{label}</label>
    <div className="au-field__control">{children({ describedBy, invalid: Boolean(error) })}</div>
    {aside && <div className="au-field__aside">{aside}</div>}
    <ErrorLine id={errorId} error={error} />
    {footer}
  </div>
}

function PasswordChecklist({ id, password, showMissing }) {
  const rules = passwordRules(password)
  return <ul className="au-reqs" id={id} aria-label="Requisitos da senha">
    {Object.entries(PASSWORD_RULE_LABELS).map(([key, label]) => {
      const state = rules[key] ? 'met' : showMissing ? 'missing' : 'pending'
      return <li key={key} data-state={state}>
        <span className="au-reqs__mark" aria-hidden="true">
          {state === 'met' && <Icon name="check" size={14} />}
          {state === 'missing' && <Icon name="close" size={14} />}
        </span>
        <span>{label}<span className="ds-sr-only">{state === 'met' ? ': cumprido' : ': pendente'}</span></span>
      </li>
    })}
  </ul>
}

// Em andamento, o botão mantém a cor e o tamanho; só troca o texto e ganha o
// spinner. Um segundo Enter ou clique é ignorado pelo formulário (busyRef).
function SubmitButton({ busy, busyLabel, children, id }) {
  return <button id={id} type="submit" className="ds-btn ds-btn--primary ds-btn--lg ds-btn--block au-submit" data-state={busy ? 'loading' : undefined} aria-busy={busy || undefined}>
    {busy && <span className="ds-spinner au-spinner" aria-hidden="true" />}
    <span>{busy ? busyLabel : children}</span>
  </button>
}

function BackLink({ onClick, href }) {
  const content = <><Icon name="arrowLeft" size={16} />Voltar para entrar</>
  return <p className="au-switch">
    {href
      ? <a className="au-link au-back" href={href}>{content}</a>
      : <button type="button" className="au-link au-back" onClick={onClick}>{content}</button>}
  </p>
}

function AuthLayout({ children }) {
  return <div className="au" data-ds-root>
    <div className="au-theme"><ThemeSelector variant="toggle" /></div>
    <main className="au-main">{children}</main>
    <footer className="au-foot">
      <span>© {new Date().getFullYear()} Meu Ecoo Mídia</span>
      <nav className="au-foot__links" aria-label="Documentos">
        <a href="/privacy-policy">Política de Privacidade</a>
        <a href="/terms-of-service">Termos de Serviço</a>
      </nav>
    </footer>
  </div>
}

// A superfície única da autenticação: logo, título e o conteúdo da etapa.
function AuthSheet({ stage, title, lede, titleRef, status, children }) {
  const sheetRef = useRef(null)
  const titleId = useId()
  useStageHeight(sheetRef, stage)
  return <section ref={sheetRef} className="au-sheet" aria-labelledby={titleId}>
    <a className="au-logo" href="/" aria-label="Meu Ecoo Mídia, página inicial"><img src="/logo.png" alt="" width="900" height="379" /></a>
    <div key={stage} className="au-stage">
      <header className="au-head">
        <h1 ref={titleRef} id={titleId} className="au-title" tabIndex={-1}><span key={title} className="au-swap">{title}</span></h1>
        {lede && <p className="au-lede">{lede}</p>}
      </header>
      {children}
    </div>
    <p className="ds-sr-only" role="status">{status || ''}</p>
  </section>
}

// Pedido de foco atendido depois da renderização (quando o campo e a
// mensagem de erro já estão na página e ligados por aria-describedby).
function useFocusRequest(titleRef = null) {
  const [request, setRequest] = useState(null)
  const counter = useRef(0)
  useEffect(() => {
    if (!request) return
    if (request.target === 'title') { titleRef?.current?.focus({ preventScroll: true }); return }
    const node = document.getElementById(request.target)
    node?.focus()
    if (request.select && typeof node?.select === 'function') node.select()
  }, [request, titleRef])
  return (target, options = {}) => {
    counter.current += 1
    setRequest({ target, n: counter.current, ...options })
  }
}

function TwoFactorStep({ notice, onVerified, onRestart }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [alert, setAlert] = useState(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const alertKey = useRef(0)
  const requestFocus = useFocusRequest()

  useEffect(() => {
    const onShow = event => { if (event.persisted) { busyRef.current = false; setBusy(false) } }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (busyRef.current) return
    const value = readField(event.currentTarget, 'code', code).replace(/\D/g, '').slice(0, 6)
    if (value !== code) setCode(value)
    if (!/^\d{6}$/.test(value)) {
      setError({ text: value ? 'O código tem 6 dígitos.' : 'Digite o código de 6 dígitos.' })
      requestFocus('au-code')
      return
    }
    setError(null)
    setAlert(null)
    busyRef.current = true
    setBusy(true)
    try {
      const data = await publicApiFetch('/auth/login/verify-2fa', { method: 'POST', body: JSON.stringify({ code: value }) })
      onVerified(data)
    } catch (failure) {
      busyRef.current = false
      setBusy(false)
      const described = describeAuthError(failure, 'twoFactor')
      if (described.field) {
        setError({ text: described.text })
        requestFocus('au-code', { select: true })
      } else {
        alertKey.current += 1
        setAlert({
          key: alertKey.current,
          text: described.text,
          action: described.code === 'expired' && onRestart ? { label: 'Entrar de novo', onClick: onRestart } : null,
        })
      }
    }
  }

  return <form className="au-fields" noValidate onSubmit={submit} aria-busy={busy || undefined}>
    {notice}
    <FormAlert alert={alert} />
    <Field
      id="au-code"
      label="Código de verificação"
      error={error}
      footerId="au-code-dica"
      footer={<p className="au-hint" id="au-code-dica">O código muda a cada 30 segundos.</p>}
    >
      {({ describedBy, invalid }) => <input
        id="au-code"
        name="code"
        className="ds-input au-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        value={code}
        onChange={event => {
          setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
          if (error) setError(null)
        }}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        placeholder="000000"
      />}
    </Field>
    <SubmitButton busy={busy} busyLabel="Verificando…">Verificar</SubmitButton>
    <p className="ds-sr-only" role="status">{busy ? 'Verificando…' : ''}</p>
  </form>
}

const TITLES = {
  login: 'Entrar',
  signup: 'Criar conta',
  forgot: 'Redefinir senha',
  sent: 'Confira seu e-mail',
  twoFactor: 'Verificação em duas etapas',
  upgrade: 'Atualize sua senha',
  signedIn: 'Você já está conectado',
}

const LEDES = {
  forgot: 'Informe o e-mail da sua conta. Enviaremos um link para você criar uma nova senha.',
  twoFactor: 'Digite o código de 6 dígitos do seu app autenticador.',
  upgrade: 'Sua senha tem menos de 8 caracteres, o mínimo atual. Recomendamos criar uma nova.',
}

export function LoginPage() {
  const initial = useMemo(() => parseLoginQuery(window.location.search), [])
  const { selectedPlan, next } = initial
  const [screen, setScreen] = useState(initial.mode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [alert, setAlert] = useState(() => (initial.error ? { key: 1, text: initial.error } : null))
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('')
  const [triedSubmit, setTriedSubmit] = useState(false)
  const [upgradeAfterCode, setUpgradeAfterCode] = useState(false)
  const [destination, setDestination] = useState('/app.html')
  const busyRef = useRef(false)
  const alertKey = useRef(1)
  const titleRef = useRef(null)
  const requestFocus = useFocusRequest(titleRef)

  const signup = screen === 'signup'
  const credentials = screen === 'login' || screen === 'signup'
  const stage = credentials ? 'credentials' : screen

  useDocumentTitle(TITLES[screen])

  useEffect(() => {
    // Só modo, plano e página de retorno ficam no endereço; erro e parâmetros
    // desconhecidos saem do histórico assim que a tela abre.
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${loginSearch({ mode: initial.mode, plan: selectedPlan, next })}`)
    if (finePointer()) requestFocus(initial.mode === 'signup' ? 'au-name' : 'au-email')
    // Executa uma vez, na abertura da tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Quem já tem sessão não fica preso na tela de login.
    if (!mayHaveSession()) return undefined
    let active = true
    publicApiFetch('/api/me', { timeoutMs: 8000 }).then(user => {
      if (!active || !user || typeof user !== 'object' || !(user.id || user.email)) return
      setScreen('signedIn')
      replaceWith(destinationFor(user.planActive, next))
    }).catch(error => {
      if (error?.status === 401) forgetSession()
    })
    return () => { active = false }
  }, [next])

  useEffect(() => {
    // Voltar do Google ou do checkout pelo botão "voltar" restaura a página
    // do cache; o botão não pode continuar travado em "Aguarde".
    const onShow = event => { if (event.persisted) { busyRef.current = false; setBusy(false) } }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

  function showAlert(content) {
    alertKey.current += 1
    setAlert(content ? { ...content, key: alertKey.current } : null)
  }

  function startBusy(label) {
    busyRef.current = true
    setBusyLabel(label)
    setBusy(true)
  }

  function stopBusy() {
    busyRef.current = false
    setBusy(false)
  }

  function goTo(nextScreen) {
    setScreen(nextScreen)
    setErrors({})
    setTriedSubmit(false)
    showAlert(null)
    if (nextScreen === 'login' || nextScreen === 'signup' || nextScreen === 'forgot') {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${loginSearch({ mode: nextScreen, plan: selectedPlan, next })}`)
    }
    const firstField = { login: 'au-email', signup: 'au-name', forgot: 'au-email', twoFactor: 'au-code', upgrade: 'au-continue' }[nextScreen]
    requestFocus(firstField && (finePointer() || nextScreen === 'upgrade') ? firstField : 'title')
  }

  function switchMode(nextMode) {
    // O e-mail acompanha a troca; a senha não (entrar e criar são senhas diferentes).
    setPassword('')
    setShowPassword(false)
    goTo(nextMode)
  }

  function updateEmail(value) {
    setEmail(value)
    if (errors.email) setErrors(current => ({ ...current, email: asError(validateEmail(value)) }))
  }

  function updatePassword(value) {
    setPassword(value)
    if (errors.password) setErrors(current => ({ ...current, password: asError(validatePassword(value, signup)) }))
  }

  // Sair do campo só aponta problema de formato; não apaga a resposta do
  // servidor (ex.: "já existe uma conta"), que só some quando o e-mail muda.
  function checkEmailOnBlur() {
    if (!email.trim()) return
    const problem = validateEmail(email)
    setErrors(current => {
      if (problem) return { ...current, email: { text: problem } }
      return current.email?.server ? current : { ...current, email: null }
    })
  }

  async function submitCredentials(event) {
    event.preventDefault()
    if (busyRef.current) return
    const form = event.currentTarget
    const values = {
      name: signup ? readField(form, 'name', name) : '',
      email: readField(form, 'email', email),
      password: readField(form, 'password', password),
    }
    if (values.email !== email) setEmail(values.email)
    if (values.password !== password) setPassword(values.password)
    const found = {
      email: asError(validateEmail(values.email)),
      password: asError(validatePassword(values.password, signup)),
    }
    setTriedSubmit(true)
    if (found.email || found.password) {
      setErrors(found)
      showAlert(null)
      requestFocus(found.email ? 'au-email' : 'au-password')
      return
    }

    setErrors({})
    showAlert(null)
    setShowPassword(false)
    startBusy(signup ? 'Criando conta…' : 'Entrando…')
    let accountCreated = false
    try {
      if (signup) {
        const data = await publicApiFetch('/auth/login/register', {
          method: 'POST',
          body: JSON.stringify({ email: values.email.trim(), password: values.password, fullName: values.name.trim() || undefined, plan: selectedPlan || undefined }),
        })
        accountCreated = true
        if (data?.requiresPayment && data?.selectedPlan) {
          setBusyLabel('Abrindo o pagamento…')
          const billing = await apiFetch('/api/billing/plan-change', { method: 'POST', body: JSON.stringify({ plan: data.selectedPlan }) })
          if (!billing?.checkoutUrl) throw new ApiError('O checkout não foi criado.', 503)
          navigateTo(billing.checkoutUrl)
          return
        }
        navigateTo('/app.html')
        return
      }

      const data = await publicApiFetch('/auth/login/login', {
        method: 'POST',
        body: JSON.stringify({ email: values.email.trim(), password: values.password }),
      })
      if (data?.requires2fa) {
        // A senha já foi conferida; não precisa ficar na memória da tela.
        setPassword('')
        setUpgradeAfterCode(Boolean(data.passwordUpgradeRecommended))
        stopBusy()
        goTo('twoFactor')
        return
      }
      const target = destinationFor(data?.planActive, next)
      if (data?.passwordUpgradeRecommended) {
        setDestination(target)
        stopBusy()
        goTo('upgrade')
        return
      }
      navigateTo(target)
    } catch (error) {
      stopBusy()
      if (accountCreated) {
        // A conta existe; tentar "Criar conta" de novo daria "e-mail já cadastrado".
        showAlert({ text: 'Sua conta foi criada, mas o pagamento não abriu. Conclua a assinatura pelo seu perfil.', action: { label: 'Ir para meu perfil', onClick: () => navigateTo('/app/perfil') } })
        return
      }
      const described = describeAuthError(error, signup ? 'signup' : 'login')
      if (described.field === 'email' || described.field === 'password') {
        const action = described.code === 'exists' ? { label: 'Entrar com este e-mail', onClick: () => switchMode('login') } : null
        setErrors({ [described.field]: { text: described.text, action, server: true } })
        requestFocus(described.field === 'email' ? 'au-email' : 'au-password')
      } else {
        showAlert({ text: described.text })
      }
    }
  }

  async function submitForgot(event) {
    event.preventDefault()
    if (busyRef.current) return
    const value = readField(event.currentTarget, 'email', email)
    if (value !== email) setEmail(value)
    const problem = validateEmail(value)
    if (problem) {
      setErrors({ email: { text: problem } })
      requestFocus('au-email')
      return
    }
    setErrors({})
    showAlert(null)
    startBusy('Enviando…')
    try {
      await publicApiFetch('/auth/login/forgot-password', { method: 'POST', body: JSON.stringify({ email: value.trim() }) })
      stopBusy()
      goTo('sent')
    } catch (error) {
      stopBusy()
      const described = describeAuthError(error, 'forgot')
      if (described.field === 'email') {
        setErrors({ email: { text: described.text, server: true } })
        requestFocus('au-email')
      } else {
        showAlert({ text: described.text })
      }
    }
  }

  const emailField = (autoComplete, onBlur) => <Field id="au-email" label="E-mail" error={errors.email}>
    {({ describedBy, invalid }) => <input
      id="au-email"
      name="email"
      type="email"
      inputMode="email"
      className="ds-input"
      autoComplete={autoComplete}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      maxLength={EMAIL_MAX_LENGTH}
      value={email}
      onChange={event => updateEmail(event.target.value)}
      onBlur={onBlur}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
    />}
  </Field>

  return <AuthLayout>
    <AuthSheet stage={stage} title={TITLES[screen]} lede={LEDES[screen]} titleRef={titleRef} status={busy ? busyLabel : ''}>
      {credentials && <>
        <form className="au-fields" noValidate onSubmit={submitCredentials} aria-busy={busy || undefined}>
          <FormAlert alert={alert} />
          <Reveal open={signup && Boolean(selectedPlan)}>
            {selectedPlan && <p className="au-plan">
              <Icon name="crown" size={16} />
              <span>Plano <strong>{planLabel(selectedPlan)}</strong></span>
              <a className="au-link" href="/#planos">Trocar</a>
            </p>}
          </Reveal>
          <Reveal open={signup}>
            <Field id="au-name" label="Nome" error={errors.name}>
              {({ describedBy, invalid }) => <input
                id="au-name"
                name="name"
                className="ds-input"
                autoComplete="name"
                autoCapitalize="words"
                spellCheck={false}
                maxLength={NAME_MAX_LENGTH}
                value={name}
                onChange={event => setName(event.target.value)}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
              />}
            </Field>
          </Reveal>
          {emailField(signup ? 'email' : 'username', checkEmailOnBlur)}
          <Field
            id="au-password"
            label="Senha"
            error={errors.password}
            aside={<button type="button" className="au-link au-forgot" inert={signup} onClick={() => goTo('forgot')}>Esqueci minha senha</button>}
            footerId={signup ? 'au-password-regras' : null}
            footer={<Reveal open={signup}>
              <PasswordChecklist id="au-password-regras" password={password} showMissing={triedSubmit && Boolean(errors.password)} />
            </Reveal>}
          >
            {({ describedBy, invalid }) => <PasswordInput
              id="au-password"
              name="password"
              autoComplete={signup ? 'new-password' : 'current-password'}
              maxLength={PASSWORD_MAX_LENGTH}
              value={password}
              onChange={event => updatePassword(event.target.value)}
              visible={showPassword}
              onVisibleChange={setShowPassword}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
            />}
          </Field>
          <SubmitButton busy={busy} busyLabel={busyLabel}>{signup ? 'Criar conta' : 'Entrar'}</SubmitButton>
        </form>
        <p className="au-alt" aria-hidden="true"><span>ou</span></p>
        <GoogleButton disabled={busy} />
        <p className="au-switch">
          <span key={screen} className="au-swap">{signup ? 'Já tem uma conta?' : 'Não tem uma conta?'}</span>{' '}
          <button type="button" className="au-link" onClick={() => switchMode(signup ? 'login' : 'signup')}>{signup ? 'Entrar' : 'Criar conta'}</button>
        </p>
      </>}

      {screen === 'forgot' && <>
        <form className="au-fields" noValidate onSubmit={submitForgot} aria-busy={busy || undefined}>
          <FormAlert alert={alert} />
          {emailField('email')}
          <SubmitButton busy={busy} busyLabel={busyLabel}>Enviar link</SubmitButton>
        </form>
        <BackLink onClick={() => goTo('login')} />
      </>}

      {screen === 'sent' && <>
        <div className="au-sent">
          <span className="au-sent__icon" aria-hidden="true"><Icon name="mail" size={20} /></span>
          <p>Se houver uma conta para <strong>{maskEmail(email)}</strong>, você vai receber um link para criar uma nova senha. Confira também o spam.</p>
        </div>
        <button type="button" className="ds-btn ds-btn--secondary ds-btn--lg ds-btn--block" onClick={() => goTo('forgot')}>Usar outro e-mail</button>
        <BackLink onClick={() => goTo('login')} />
      </>}

      {screen === 'twoFactor' && <>
        <TwoFactorStep
          notice={upgradeAfterCode ? <div className="au-alert" data-tone="warning">
            <Icon name="alertTriangle" size={16} />
            <p>Depois de entrar, recomendamos trocar sua senha: ela tem menos de 8 caracteres. <button type="button" className="au-link" onClick={() => goTo('forgot')}>Trocar agora</button></p>
          </div> : null}
          onVerified={data => navigateTo(destinationFor(data?.planActive, next))}
          onRestart={() => goTo('login')}
        />
        <BackLink onClick={() => goTo('login')} />
      </>}

      {screen === 'upgrade' && <div className="au-actions">
        <button id="au-continue" type="button" className="ds-btn ds-btn--primary ds-btn--lg ds-btn--block" onClick={() => { startBusy('Abrindo o painel…'); navigateTo(destination) }}>
          {busy && <span className="ds-spinner au-spinner" aria-hidden="true" />}Continuar para o painel
        </button>
        <button type="button" className="ds-btn ds-btn--secondary ds-btn--lg ds-btn--block" onClick={() => goTo('forgot')}>Criar uma nova senha</button>
      </div>}

      {screen === 'signedIn' && <p className="au-wait"><span className="ds-spinner au-spinner" aria-hidden="true" />Abrindo o painel…</p>}
    </AuthSheet>
  </AuthLayout>
}

export function ResetPasswordPage() {
  const token = useMemo(() => {
    const value = readResetToken()
    // O token sai da barra de endereço (e do histórico) assim que é lido.
    if (value) window.history.replaceState({}, document.title, window.location.pathname)
    return value
  }, [])
  const [status, setStatus] = useState(token ? 'checking' : 'invalid')
  const [attempt, setAttempt] = useState(0)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [errors, setErrors] = useState({})
  const [triedSubmit, setTriedSubmit] = useState(false)
  const [alert, setAlert] = useState(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const alertKey = useRef(0)
  const titleRef = useRef(null)
  const requestFocus = useFocusRequest(titleRef)

  const titles = { checking: 'Criar nova senha', ready: 'Criar nova senha', unavailable: 'Criar nova senha', invalid: 'Link expirado', done: 'Senha alterada' }
  const ledes = {
    checking: 'Verificando seu link…',
    ready: 'Escolha uma senha nova para a sua conta.',
    invalid: 'Este link de redefinição não é mais válido ou já foi usado. Peça um novo para continuar.',
    done: 'Sua senha foi redefinida. Entre com a nova senha para continuar.',
  }
  useDocumentTitle(titles[status])

  useEffect(() => {
    if (!token) return undefined
    let active = true
    publicApiFetch('/auth/login/reset-password/validar', { method: 'POST', body: JSON.stringify({ token }) })
      .then(data => { if (active) setStatus(data?.valido ? 'ready' : 'invalid') })
      .catch(() => { if (active) setStatus('unavailable') })
    return () => { active = false }
  }, [token, attempt])

  useEffect(() => {
    if (status === 'ready' && finePointer()) requestFocus('au-new-password')
    if (status === 'done' || status === 'invalid') requestFocus('title')
    // requestFocus é estável o bastante para este efeito de transição.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  function validate(nextPassword, nextConfirmation) {
    return {
      password: asError(validatePassword(nextPassword, true)),
      confirmation: asError(!nextConfirmation ? 'Repita a nova senha.' : nextConfirmation !== nextPassword ? 'As senhas não coincidem.' : null),
    }
  }

  async function submit(event) {
    event.preventDefault()
    if (busyRef.current) return
    const form = event.currentTarget
    const nextPassword = readField(form, 'password', password)
    const nextConfirmation = readField(form, 'confirmation', confirmation)
    const found = validate(nextPassword, nextConfirmation)
    setTriedSubmit(true)
    if (found.password || found.confirmation) {
      setErrors(found)
      requestFocus(found.password ? 'au-new-password' : 'au-confirm-password')
      return
    }
    setErrors({})
    setAlert(null)
    setShowPassword(false)
    setShowConfirmation(false)
    busyRef.current = true
    setBusy(true)
    try {
      await publicApiFetch('/auth/login/reset-password', { method: 'POST', body: JSON.stringify({ token, password: nextPassword }) })
      setPassword('')
      setConfirmation('')
      setStatus('done')
    } catch (error) {
      const described = describeAuthError(error, 'reset')
      if (described.code === 'expired') setStatus('invalid')
      else if (described.field === 'password') { setErrors({ password: { text: described.text } }); requestFocus('au-new-password') }
      else { alertKey.current += 1; setAlert({ key: alertKey.current, text: described.text }) }
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return <AuthLayout>
    <AuthSheet stage={status} title={titles[status]} lede={ledes[status]} titleRef={titleRef} status={busy ? 'Salvando…' : ''}>
      {status === 'checking' && <div className="au-fields" aria-hidden="true">
        <span className="ds-skel au-skel" />
        <span className="ds-skel au-skel" />
        <span className="ds-skel au-skel au-skel--button" />
      </div>}

      {status === 'unavailable' && <div className="au-actions">
        <div className="au-alert" data-tone="danger" role="alert">
          <Icon name="alertCircle" size={16} />
          <p>Não foi possível verificar o link agora. Confira sua conexão e tente de novo.</p>
        </div>
        <button type="button" className="ds-btn ds-btn--primary ds-btn--lg ds-btn--block" onClick={() => { setStatus('checking'); setAttempt(value => value + 1) }}>Tentar de novo</button>
      </div>}

      {status === 'invalid' && <div className="au-actions">
        <a className="ds-btn ds-btn--primary ds-btn--lg ds-btn--block" href="/login.html?mode=forgot">Pedir um novo link</a>
      </div>}

      {status === 'ready' && <form className="au-fields" noValidate onSubmit={submit} aria-busy={busy || undefined}>
        <FormAlert alert={alert} />
        <Field
          id="au-new-password"
          label="Nova senha"
          error={errors.password}
          footerId="au-new-password-regras"
          footer={<PasswordChecklist id="au-new-password-regras" password={password} showMissing={triedSubmit && Boolean(errors.password)} />}
        >
          {({ describedBy, invalid }) => <PasswordInput
            id="au-new-password"
            name="password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
            value={password}
            onChange={event => {
              setPassword(event.target.value)
              if (errors.password) setErrors(current => ({ ...current, password: asError(validatePassword(event.target.value, true)) }))
            }}
            visible={showPassword}
            onVisibleChange={setShowPassword}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
          />}
        </Field>
        <Field id="au-confirm-password" label="Confirmar nova senha" error={errors.confirmation}>
          {({ describedBy, invalid }) => <PasswordInput
            id="au-confirm-password"
            name="confirmation"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
            value={confirmation}
            onChange={event => {
              setConfirmation(event.target.value)
              if (errors.confirmation) setErrors(current => ({ ...current, confirmation: validate(password, event.target.value).confirmation }))
            }}
            onBlur={() => { if (confirmation) setErrors(current => ({ ...current, confirmation: validate(password, confirmation).confirmation })) }}
            visible={showConfirmation}
            onVisibleChange={setShowConfirmation}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
          />}
        </Field>
        <SubmitButton busy={busy} busyLabel="Salvando…">Salvar nova senha</SubmitButton>
      </form>}

      {status === 'done' && <div className="au-actions">
        <a className="ds-btn ds-btn--primary ds-btn--lg ds-btn--block" href="/login.html">Entrar</a>
      </div>}

      {status !== 'done' && <BackLink href="/login.html" />}
    </AuthSheet>
  </AuthLayout>
}

// Chega aqui o login com Google de uma conta com 2FA (o backend redireciona
// para /verify-2fa.html com um cookie de confirmação pendente).
export function VerifyTwoFactorPage() {
  useDocumentTitle(TITLES.twoFactor)
  useEffect(() => {
    if (window.location.search) window.history.replaceState({}, '', window.location.pathname)
  }, [])

  return <AuthLayout>
    <AuthSheet stage="twoFactor" title={TITLES.twoFactor} lede="Digite o código de 6 dígitos do seu app autenticador para concluir o login.">
      <TwoFactorStep
        onVerified={data => navigateTo(destinationFor(data?.planActive, null))}
        onRestart={() => navigateTo('/login.html')}
      />
      <BackLink href="/login.html" />
    </AuthSheet>
  </AuthLayout>
}
