import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  afterEach(() => {
    vi.restoreAllMocks()
    // a aba aberta fica no endereço (#seguranca…); cada teste começa sem ela
    window.history.replaceState(null, '', '/')
  })

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

    fireEvent.click(await screen.findByRole('tab', { name: 'Segurança' }))
    fireEvent.change(await screen.findByLabelText('Nova senha'), { target: { value: 'abc123' } })
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'abc123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Alterar senha' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('8 a 72 caracteres')
    expect(apiFetchMock.mock.calls.some(([path]) => path === '/api/me/password')).toBe(false)
  })

  it('usa o campo de senha com mostrar/ocultar nos três campos', async () => {
    const profile = { id: 3, email: 'c@allowed.test', fullName: 'Cris', plan: 'pro', planActive: true }
    mockApi(profile)
    render(<ToastProvider><ProfilePage user={profile} /></ToastProvider>)

    fireEvent.click(await screen.findByRole('tab', { name: 'Segurança' }))
    const nova = await screen.findByLabelText('Nova senha')
    expect(nova).toHaveAttribute('type', 'password')
    expect(screen.getAllByRole('button', { name: 'Mostrar senha' })).toHaveLength(3)
    fireEvent.click(screen.getAllByRole('button', { name: 'Mostrar senha' })[1])
    expect(nova).toHaveAttribute('type', 'text')
  })

  it('mostra a falha ao salvar uma vez só, junto do botão, e mantém o que foi digitado', async () => {
    const profile = { id: 4, email: 'd@allowed.test', fullName: 'Duda', plan: 'pro', planActive: true }
    const base = mockApi(profile).getMockImplementation()
    vi.spyOn(api, 'apiFetch').mockImplementation((path, options) => {
      if (path === '/api/me/profile' && options?.method === 'PATCH') return Promise.reject(new api.ApiError('Nome muito longo.', 400))
      return base(path, options)
    })
    render(<ToastProvider><ProfilePage user={profile} /></ToastProvider>)

    const nome = await screen.findByLabelText('Nome completo')
    fireEvent.change(nome, { target: { value: 'Duda Nova' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1))
    expect(screen.getByRole('alert')).toHaveTextContent('Nome muito longo.')
    expect(nome).toHaveValue('Duda Nova')
  })

  it('não mostra erro técnico quando o envio da foto falha na rede', async () => {
    const profile = { id: 5, email: 'e@allowed.test', fullName: 'Eva', plan: 'pro', planActive: true }
    const base = mockApi(profile).getMockImplementation()
    vi.spyOn(api, 'apiFetch').mockImplementation((path, options) => {
      if (path === '/api/posts/upload-url') return Promise.resolve({ uploadUrl: 'https://storage.test/upload', mediaUrl: 'https://cdn.test/a.png' })
      return base(path, options)
    })
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    const { container } = render(<ToastProvider><ProfilePage user={profile} /></ToastProvider>)
    await screen.findByText('Alterar foto')

    const file = new File(['x'], 'foto.png', { type: 'image/png' })
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } })

    expect(await screen.findByText('Não foi possível enviar a foto agora. Tente de novo.')).toBeInTheDocument()
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument()
  })

  it('não dispara "sair de todos os dispositivos" duas vezes enquanto a primeira está em andamento', async () => {
    const profile = { id: 6, email: 'f@allowed.test', fullName: 'Fábio', plan: 'pro', planActive: true }
    const base = mockApi(profile).getMockImplementation()
    const apiFetch = vi.spyOn(api, 'apiFetch').mockImplementation((path, options) => {
      if (path === '/api/me/logout-all') return new Promise(() => {})
      return base(path, options)
    })
    render(<ToastProvider><ProfilePage user={profile} /></ToastProvider>)

    fireEvent.click(await screen.findByRole('tab', { name: 'Sessões' }))
    const botao = await screen.findByRole('button', { name: 'Sair de todos os dispositivos' })
    fireEvent.click(botao)
    fireEvent.click(botao)
    const dialog = await screen.findByRole('dialog', { name: 'Sair de todos os dispositivos?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sair de todos' }))

    await waitFor(() => expect(screen.getByRole('button', { name: /Encerrando/ })).toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: /Encerrando/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(apiFetch.mock.calls.filter(([path]) => path === '/api/me/logout-all')).toHaveLength(1)
  })

  it('mostra uma seção por vez e guarda a aberta no endereço', async () => {
    const profile = { id: 7, email: 'g@allowed.test', fullName: 'Gabi', plan: 'pro', planActive: true }
    mockApi(profile)
    render(<ToastProvider><ProfilePage user={profile} /></ToastProvider>)

    const dados = await screen.findByRole('tab', { name: 'Dados e preferências' })
    expect(dados).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual(['Dados e preferências'])

    fireEvent.click(screen.getByRole('tab', { name: 'Plano e cobrança' }))
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Plano e cobrança')
    expect(screen.queryByLabelText('Nome completo')).not.toBeInTheDocument()
    expect(window.location.hash).toBe('#plano')

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Plano e cobrança' }), { key: 'ArrowDown' })
    expect(screen.getByRole('tab', { name: 'Segurança' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Segurança' })).toHaveAttribute('aria-selected', 'true')
  })

  it('na volta do checkout abre a aba de planos e consulta o pagamento até ele confirmar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    window.history.replaceState(null, '', '/app/perfil?billing=success')
    const profile = { id: 8, email: 'h@allowed.test', fullName: 'Hugo', plan: 'pro', planActive: true }
    const pending = { currentPlan: 'pro', planActive: true, subscription: null, charge: { status: 'processing' } }
    const paid = { ...pending, charge: { status: 'paid' } }
    let statusCalls = 0
    const apiFetch = vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/me/profile') return Promise.resolve(profile)
      if (path === '/api/billing/status') { statusCalls += 1; return Promise.resolve(statusCalls >= 3 ? paid : pending) }
      return Promise.reject(new Error(`rota não mockada: ${path}`))
    })
    render(<ToastProvider><ProfilePage user={profile} onUserChange={() => {}} /></ToastProvider>)

    expect(await screen.findByRole('tab', { name: 'Plano e cobrança' })).toHaveAttribute('aria-selected', 'true')
    expect(window.location.search).toBe('')
    await vi.advanceTimersByTimeAsync(2100)
    await vi.advanceTimersByTimeAsync(2100)
    expect(await screen.findByText('Cobrança deste mês confirmada.')).toBeInTheDocument()
    const polls = apiFetch.mock.calls.filter(([path]) => path === '/api/billing/status').length
    await vi.advanceTimersByTimeAsync(4200)
    expect(apiFetch.mock.calls.filter(([path]) => path === '/api/billing/status')).toHaveLength(polls)
    vi.useRealTimers()
  })
})

