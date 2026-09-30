import { fireEvent, render, screen } from '@testing-library/react'
import { ProfilePage } from '../../src/pages/profile-page.jsx'
import { ToastProvider } from '../../src/components/ui/toast.jsx'
import * as api from '../../src/lib/api.js'

function mockApi(profile) {
  return vi.spyOn(api, 'apiFetch').mockImplementation(path => {
    if (path === '/api/me/profile') return Promise.resolve(profile)
    if (path === '/api/billing/status') return Promise.resolve({ currentPlan: profile.plan, planActive: profile.planActive, subscription: null })
    return Promise.reject(new Error(`rota não mockada: ${path}`))
  })
}

describe('ProfilePage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('mostra o plano primeiro quando o pagamento está pendente', async () => {
    const profile = { id: 1, email: 'a@allowed.test', fullName: 'Ana', plan: 'basico', planActive: false }
    mockApi(profile)
    render(<ToastProvider><ProfilePage user={profile} /></ToastProvider>)

    await screen.findByText('Plano atual: EcooMidia Básico')
    const titles = screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)
    expect(titles[0]).toBe('Plano e cobrança')
    expect(screen.getByText('Os módulos ficam bloqueados até o pagamento ser confirmado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Finalizar pagamento' })).toBeEnabled()
  })

  it('valida a nova senha com as mesmas regras do servidor', async () => {
    const profile = { id: 2, email: 'b@allowed.test', fullName: 'Bia', plan: 'pro', planActive: true }
    const apiFetchMock = mockApi(profile)
    render(<ToastProvider><ProfilePage user={profile} /></ToastProvider>)

    fireEvent.change(await screen.findByLabelText('Nova senha'), { target: { value: 'abc123' } })
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'abc123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Alterar senha' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('8 a 72 caracteres')
    expect(apiFetchMock.mock.calls.some(([path]) => path === '/api/me/password')).toBe(false)
  })
})
