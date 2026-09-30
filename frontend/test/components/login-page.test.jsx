import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LoginPage } from '../../src/pages/auth-page.jsx'
import * as api from '../../src/lib/api.js'
import * as navigation from '../../src/lib/navigation.js'

// publicApiFetch responde por caminho; o que não estiver no mapa fica pendente.
function mockPublicApi(routes) {
  return vi.spyOn(api, 'publicApiFetch').mockImplementation(path => {
    const handler = routes[path]
    if (!handler) return new Promise(() => {})
    return typeof handler === 'function' ? handler() : Promise.resolve(handler)
  })
}

function fillCredentials(password = 'Senha@123', email = 'ana@allowed.test') {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: password } })
}

function renderAt(url) {
  window.history.replaceState({}, '', url)
  return render(<LoginPage />)
}

describe('LoginPage', () => {
  let navigateTo
  let replaceWith

  beforeEach(() => {
    navigateTo = vi.spyOn(navigation, 'navigateTo').mockImplementation(() => {})
    replaceWith = vi.spyOn(navigation, 'replaceWith').mockImplementation(() => {})
    localStorage.removeItem('meu-ecoo:session-hint')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.history.replaceState({}, '', '/login.html')
  })

  it('permite voltar do passo de 2FA para o login', async () => {
    mockPublicApi({ '/auth/login/login': { requires2fa: true } })
    renderAt('/login.html')

    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('heading', { name: 'Verificação em duas etapas' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para entrar' }))
    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
  })

  it('leva ao perfil quando a conta foi criada mas o checkout falhou', async () => {
    mockPublicApi({ '/auth/login/register': { requiresPayment: true, selectedPlan: 'pro' } })
    vi.spyOn(api, 'apiFetch').mockRejectedValue(new api.ApiError('O gateway de pagamento ainda não está configurado.', 503))
    renderAt('/login.html?register=1&plan=pro')

    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sua conta foi criada, mas o pagamento não abriu')
    fireEvent.click(screen.getByRole('button', { name: 'Ir para meu perfil' }))
    expect(navigateTo).toHaveBeenCalledWith('/app/perfil')
  })

  it('valida antes de enviar e liga cada mensagem ao seu campo', async () => {
    const fetchSpy = mockPublicApi({})
    renderAt('/login.html')

    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    const email = screen.getByLabelText('E-mail')
    const password = screen.getByLabelText('Senha')
    expect(await screen.findByText('Digite seu e-mail.')).toBeInTheDocument()
    expect(screen.getByText('Digite sua senha.')).toBeInTheDocument()
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveAccessibleDescription('Digite seu e-mail.')
    expect(password).toHaveAccessibleDescription('Digite sua senha.')
    await waitFor(() => expect(email).toHaveFocus())
    expect(fetchSpy).not.toHaveBeenCalledWith('/auth/login/login', expect.anything())

    fireEvent.change(email, { target: { value: 'ana@' } })
    expect(screen.getByText('Digite um endereço de e-mail válido.')).toBeInTheDocument()
    fireEvent.change(email, { target: { value: 'ana@allowed.test' } })
    expect(email).not.toHaveAttribute('aria-invalid')
  })

  it('não envia duas vezes enquanto espera a resposta', async () => {
    const fetchSpy = mockPublicApi({ '/auth/login/login': () => new Promise(() => {}) })
    renderAt('/login.html')

    fillCredentials()
    const submit = screen.getByRole('button', { name: 'Entrar' })
    fireEvent.click(submit)
    fireEvent.click(submit)
    fireEvent.submit(submit.closest('form'))

    expect(fetchSpy.mock.calls.filter(([path]) => path === '/auth/login/login')).toHaveLength(1)
    expect(submit).toHaveAttribute('data-state', 'loading')
    expect(submit).toHaveTextContent('Entrando…')
  })

  it('troca entre entrar e criar conta sem sair da página, mantendo o e-mail', () => {
    mockPublicApi({})
    renderAt('/login.html')

    fillCredentials('qualquer-coisa')
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))

    expect(screen.getByRole('heading', { name: 'Criar conta' })).toBeInTheDocument()
    expect(window.location.search).toBe('?mode=signup')
    expect(screen.getByLabelText('E-mail')).toHaveValue('ana@allowed.test')
    expect(screen.getByLabelText('Senha')).toHaveValue('')
    expect(screen.getByLabelText('Senha')).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByRole('list', { name: 'Requisitos da senha' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(window.location.search).toBe('')
    expect(screen.getByLabelText('Senha')).toHaveAttribute('autocomplete', 'current-password')
  })

  it('aceita o link antigo ?register=1 e mostra o plano escolhido', () => {
    mockPublicApi({})
    renderAt('/login.html?register=1&plan=pro&utm_source=site')

    expect(screen.getByRole('heading', { name: 'Criar conta' })).toBeInTheDocument()
    expect(window.location.search).toBe('?mode=signup&plan=pro')
    expect(screen.getByText('Pro')).toBeInTheDocument()
  })

  it('mostra mensagem humana quando o servidor devolve erro técnico', async () => {
    mockPublicApi({ '/auth/login/login': () => Promise.reject(new api.ApiError('<html><body>502 Bad Gateway</body></html>', 502)) })
    renderAt('/login.html')

    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível entrar agora. Tente novamente em instantes.')
    expect(screen.getByRole('alert')).not.toHaveTextContent('Bad Gateway')
  })

  it('oferece entrar quando o e-mail do cadastro já tem conta', async () => {
    mockPublicApi({ '/auth/login/register': () => Promise.reject(new api.ApiError('Já existe uma conta com esse e-mail.', 409)) })
    renderAt('/login.html?mode=signup')

    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))

    expect(await screen.findByText('Já existe uma conta com este e-mail.')).toBeInTheDocument()
    fireEvent.blur(screen.getByLabelText('E-mail'))
    fireEvent.click(screen.getByRole('button', { name: 'Entrar com este e-mail' }))
    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail')).toHaveValue('ana@allowed.test')
  })

  it('volta para a página de origem depois de entrar', async () => {
    mockPublicApi({ '/auth/login/login': { ok: true, planActive: true } })
    renderAt('/login.html?next=calendario')

    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    await waitFor(() => expect(navigateTo).toHaveBeenCalledWith('/app/calendario'))
  })

  it('ignora destino que não é uma página do app', async () => {
    mockPublicApi({ '/auth/login/login': { ok: true, planActive: true } })
    renderAt('/login.html?next=https%3A%2F%2Fevil.example')

    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    await waitFor(() => expect(navigateTo).toHaveBeenCalledWith('/app.html'))
  })

  it('conta sem plano ativo vai ao perfil para concluir a assinatura', async () => {
    mockPublicApi({ '/auth/login/login': { ok: true, planActive: false } })
    renderAt('/login.html?next=calendario')

    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    await waitFor(() => expect(navigateTo).toHaveBeenCalledWith('/app/perfil'))
  })

  it('senha antiga curta: avisa e deixa continuar sem temporizador', async () => {
    mockPublicApi({ '/auth/login/login': { ok: true, planActive: true, passwordUpgradeRecommended: true } })
    renderAt('/login.html')

    fillCredentials('abc')
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('heading', { name: 'Atualize sua senha' })).toBeInTheDocument()
    expect(navigateTo).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar para o painel' }))
    expect(navigateTo).toHaveBeenCalledWith('/app.html')
  })

  it('esqueci a senha: confirma sem revelar se a conta existe', async () => {
    const fetchSpy = mockPublicApi({ '/auth/login/forgot-password': { ok: true } })
    renderAt('/login.html')

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@allowed.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }))
    expect(screen.getByRole('heading', { name: 'Redefinir senha' })).toBeInTheDocument()
    expect(window.location.search).toBe('?mode=forgot')
    expect(screen.getByLabelText('E-mail')).toHaveValue('ana@allowed.test')

    fireEvent.click(screen.getByRole('button', { name: 'Enviar link' }))

    expect(await screen.findByRole('heading', { name: 'Confira seu e-mail' })).toBeInTheDocument()
    expect(screen.getByText(/Se houver uma conta para/)).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledWith('/auth/login/forgot-password', expect.objectContaining({ body: JSON.stringify({ email: 'ana@allowed.test' }) }))
  })

  it('quem já tem sessão sai da tela de login', async () => {
    localStorage.setItem('meu-ecoo:session-hint', '1')
    mockPublicApi({ '/api/me': { id: 7, email: 'ana@allowed.test', planActive: true } })
    renderAt('/login.html?next=inbox')

    await waitFor(() => expect(replaceWith).toHaveBeenCalledWith('/app/inbox'))
    expect(screen.getByRole('heading', { name: 'Você já está conectado' })).toBeInTheDocument()
  })

  it('sem sessão anterior neste navegador, não consulta /api/me', async () => {
    const fetchSpy = mockPublicApi({})
    renderAt('/login.html')
    await act(async () => {})
    expect(fetchSpy).not.toHaveBeenCalledWith('/api/me', expect.anything())
  })

  it('pista de sessão vencida é apagada sem sair do login', async () => {
    localStorage.setItem('meu-ecoo:session-hint', '1')
    mockPublicApi({ '/api/me': () => Promise.reject(new api.ApiError('Sua sessão expirou. Faça login novamente.', 401)) })
    renderAt('/login.html')

    await waitFor(() => expect(localStorage.getItem('meu-ecoo:session-hint')).toBeNull())
    expect(replaceWith).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
  })
})
