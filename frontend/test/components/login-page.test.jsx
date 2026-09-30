import { fireEvent, render, screen } from '@testing-library/react'
import { LoginPage } from '../../src/pages/auth-page.jsx'
import * as api from '../../src/lib/api.js'

function fillCredentials(password = 'Senha@123') {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@allowed.test' } })
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: password } })
}

describe('LoginPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.history.replaceState({}, '', '/login.html')
  })

  it('permite voltar do passo de 2FA para o login', async () => {
    vi.spyOn(api, 'publicApiFetch').mockResolvedValue({ requires2fa: true })
    window.history.replaceState({}, '', '/login.html')
    render(<LoginPage />)

    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('heading', { name: 'Confirmar acesso' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para o login' }))
    expect(screen.getByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument()
  })

  it('leva ao perfil quando a conta foi criada mas o checkout falhou', async () => {
    vi.spyOn(api, 'publicApiFetch').mockResolvedValue({ requiresPayment: true, selectedPlan: 'pro' })
    vi.spyOn(api, 'apiFetch').mockRejectedValue(new api.ApiError('O gateway de pagamento ainda não está configurado.', 503))
    window.history.replaceState({}, '', '/login.html?register=1&plan=pro')
    render(<LoginPage />)

    fillCredentials()
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sua conta foi criada, mas o pagamento não abriu')
    expect(screen.getByRole('button', { name: 'Ir para meu perfil' })).toBeInTheDocument()
  })
})
