import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { loginSearch, parseLoginQuery, readResetToken, ResetPasswordPage, VerifyTwoFactorPage } from '../../src/pages/auth-page.jsx'
import { getMeuEcooPricing } from '../../src/lib/plans.js'
import { pathForReturnPage, returnPageFor } from '../../src/lib/app-pages.js'
import * as api from '../../src/lib/api.js'
import * as navigation from '../../src/lib/navigation.js'

describe('parâmetros da tela de login', () => {
  it('aceita o sinalizador antigo de cadastro e planos conhecidos', () => {
    expect(parseLoginQuery('?register=1&plan=pro')).toEqual({ mode: 'signup', selectedPlan: 'pro', error: null, next: null })
  })

  it('aceita os modos conhecidos', () => {
    expect(parseLoginQuery('?mode=signup').mode).toBe('signup')
    expect(parseLoginQuery('?mode=forgot').mode).toBe('forgot')
    expect(parseLoginQuery('?mode=admin').mode).toBe('login')
  })

  it('descarta parâmetros arbitrários, mensagens não autorizadas e destinos externos', () => {
    expect(parseLoginQuery('?register=true&plan=https%3A%2F%2Fevil.example&error=%3Csvg%20onload%3Dalert(1)%3E&next=https%3A%2F%2Fevil.example')).toEqual({
      mode: 'login',
      selectedPlan: null,
      error: null,
      next: null,
    })
    expect(parseLoginQuery('?next=%2F%2Fevil.example').next).toBeNull()
    expect(parseLoginQuery('?next=%2Fapp%2Fcalendario').next).toBeNull()
    expect(parseLoginQuery('?next=tokens').next).toBeNull()
  })

  it('aceita como destino somente a chave de uma página do app', () => {
    expect(parseLoginQuery('?next=calendario').next).toBe('calendario')
    expect(parseLoginQuery('?next=admin').next).toBe('admin')
  })

  it('aceita somente erros conhecidos do fluxo com Google', () => {
    expect(parseLoginQuery('?error=Login%20com%20Google%20cancelado.').error).toBe('Login com Google cancelado.')
    expect(parseLoginQuery(`?error=${encodeURIComponent('Use um e-mail @empresa.com.br, @outra.com para acessar a aplicação.')}`).error)
      .toBe('Use um e-mail @empresa.com.br, @outra.com para acessar a aplicação.')
    expect(parseLoginQuery(`?error=${encodeURIComponent('Use um e-mail <b>x</b> para acessar a aplicação.')}`).error).toBeNull()
  })

  it('monta o endereço canônico só com modo, plano e destino', () => {
    expect(loginSearch({ mode: 'login', plan: 'pro', next: null })).toBe('')
    expect(loginSearch({ mode: 'signup', plan: 'pro', next: null })).toBe('?mode=signup&plan=pro')
    expect(loginSearch({ mode: 'forgot', plan: 'pro', next: 'inbox' })).toBe('?mode=forgot&next=inbox')
  })

  it('lê o token de redefinição do hash ou da query sem exigir um formato único de link', () => {
    expect(readResetToken({ hash: '#token=do-hash', search: '?token=da-query' })).toBe('do-hash')
    expect(readResetToken({ hash: '', search: '?token=da-query' })).toBe('da-query')
  })

  it('calcula o valor do MeuEcoo Pro com 40% de desconto', () => {
    expect(getMeuEcooPricing({ meuEcooBasePriceCents: 2500, meuEcooDiscountPercent: 40 })).toEqual({
      basePriceCents: 2500,
      discountPercent: 40,
      discountCents: 1000,
      finalPriceCents: 1500,
    })
  })
})

describe('página de retorno depois do login', () => {
  it('guarda só a chave de páginas conhecidas', () => {
    expect(returnPageFor('/app/calendario')).toBe('calendario')
    expect(returnPageFor('/app/calendario/extra')).toBe('calendario')
    expect(returnPageFor('/app/dashboard')).toBeNull()
    expect(returnPageFor('/app/desconhecida')).toBeNull()
    expect(returnPageFor('/admin.html')).toBe('admin')
    expect(returnPageFor('/login.html')).toBeNull()
  })

  it('traduz a chave para um caminho interno', () => {
    expect(pathForReturnPage('inbox')).toBe('/app/inbox')
    expect(pathForReturnPage('admin')).toBe('/admin.html')
    expect(pathForReturnPage('https://evil.example')).toBe('/app.html')
  })

  it('o login recebe a página atual quando a sessão cai', () => {
    expect(api.loginPath({ returnPage: 'smartlinks' })).toBe('/login.html?next=smartlinks')
    expect(api.loginPath({ returnPage: '//evil.example' })).toBe('/login.html')
    expect(api.loginPath()).toBe('/login.html')
  })
})

describe('ResetPasswordPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.history.replaceState({}, '', '/login.html')
  })

  it('valida o link, confere a confirmação e salva a nova senha', async () => {
    window.history.replaceState({}, '', '/reset-password.html#token=abc')
    const fetchSpy = vi.spyOn(api, 'publicApiFetch').mockImplementation(path => Promise.resolve(path.endsWith('/validar') ? { valido: true } : { ok: true }))
    render(<ResetPasswordPage />)

    const password = await screen.findByLabelText('Nova senha')
    expect(window.location.hash).toBe('')
    fireEvent.change(password, { target: { value: 'Senha@123' } })
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'Senha@124' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }))
    expect(await screen.findByText('As senhas não coincidem.')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalledWith('/auth/login/reset-password', expect.anything())

    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'Senha@123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }))
    expect(await screen.findByRole('heading', { name: 'Senha alterada' })).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledWith('/auth/login/reset-password', expect.objectContaining({ body: JSON.stringify({ token: 'abc', password: 'Senha@123' }) }))
  })

  it('link vencido oferece pedir outro', async () => {
    window.history.replaceState({}, '', '/reset-password.html#token=velho')
    vi.spyOn(api, 'publicApiFetch').mockResolvedValue({ valido: false })
    render(<ResetPasswordPage />)

    expect(await screen.findByRole('heading', { name: 'Link expirado' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pedir um novo link' })).toHaveAttribute('href', '/login.html?mode=forgot')
  })

  it('falha de rede na validação não é tratada como link vencido', async () => {
    window.history.replaceState({}, '', '/reset-password.html#token=abc')
    vi.spyOn(api, 'publicApiFetch').mockRejectedValue(new api.ApiError('Não foi possível conectar ao servidor.', 0))
    render(<ResetPasswordPage />)

    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Link expirado' })).not.toBeInTheDocument()
  })
})

describe('VerifyTwoFactorPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('confirma o código e entra no app', async () => {
    const navigateTo = vi.spyOn(navigation, 'navigateTo').mockImplementation(() => {})
    vi.spyOn(api, 'publicApiFetch').mockResolvedValue({ ok: true, planActive: true })
    render(<VerifyTwoFactorPage />)

    const code = screen.getByLabelText('Código de verificação')
    fireEvent.change(code, { target: { value: '12a3456' } })
    expect(code).toHaveValue('123456')
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }))

    await waitFor(() => expect(navigateTo).toHaveBeenCalledWith('/app.html'))
  })

  it('código incorreto vira erro do campo', async () => {
    vi.spyOn(api, 'publicApiFetch').mockRejectedValue(new api.ApiError('Código inválido. Verifique o app autenticador e tente de novo.', 400))
    render(<VerifyTwoFactorPage />)

    fireEvent.change(screen.getByLabelText('Código de verificação'), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }))

    expect(await screen.findByText('Código incorreto. Confira o app e tente de novo.')).toBeInTheDocument()
    expect(screen.getByLabelText('Código de verificação')).toHaveAttribute('aria-invalid', 'true')
  })
})
