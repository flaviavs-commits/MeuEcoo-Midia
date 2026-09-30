import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AccountsPage } from '../../src/pages/accounts-page.jsx'
import { ToastProvider } from '../../src/components/ui/toast.jsx'
import * as api from '../../src/lib/api.js'

describe('AccountsPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.history.replaceState({}, '', '/')
  })

  it('shows every supported network and the connected account inside its network card', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/accounts') return Promise.resolve({ data: [{ id: 113, platform: 'instagram', handle: '@meuecoomidia', tokens: [{ status: 'valid' }] }] })
      if (path === '/api/platform-health') return Promise.resolve({ platforms: { facebook: 'up', instagram: 'up', youtube: 'up', tiktok: 'up' } })
      return Promise.resolve({})
    })

    render(<ToastProvider><AccountsPage user={{ planUnrestricted: true }} /></ToastProvider>)

    expect(await screen.findByRole('heading', { name: 'Instagram' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Facebook' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'YouTube' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'TikTok' })).toBeInTheDocument()
    expect(screen.getByText('@meuecoomidia')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Desconectar @meuecoomidia' })).toBeInTheDocument()
  })

  it('disconnects an account from the network card', async () => {
    let connected = [{ id: 113, platform: 'instagram', handle: '@meuecoomidia', tokens: [{ status: 'valid' }] }]
    const apiFetchMock = vi.spyOn(api, 'apiFetch').mockImplementation((path, options = {}) => {
      if (path === '/api/accounts') return Promise.resolve({ data: connected })
      if (path === '/api/platform-health') return Promise.resolve({ platforms: {} })
      if (path === '/api/accounts/113' && options.method === 'DELETE') {
        connected = []
        return Promise.resolve({ deleted: true })
      }
      return Promise.resolve({})
    })
    vi.stubGlobal('confirm', vi.fn(() => true))

    render(<ToastProvider><AccountsPage user={{ planUnrestricted: true }} /></ToastProvider>)
    const disconnect = await screen.findByRole('button', { name: 'Desconectar @meuecoomidia' })
    disconnect.click()

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/accounts/113', { method: 'DELETE' }))
    await waitFor(() => expect(screen.queryByText('@meuecoomidia')).not.toBeInTheDocument())
  })

  it('opens the add account flow and starts the OAuth connection', async () => {
    const apiFetchMock = vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/accounts') return Promise.resolve({ data: [] })
      if (path === '/api/platform-health') return Promise.resolve({ platforms: {} })
      if (path.startsWith('/auth/instagram?')) return Promise.resolve({ authUrl: 'https://provider.example/oauth' })
      return Promise.resolve({})
    })
    vi.spyOn(window, 'open').mockImplementation(() => ({ closed: false, location: { href: '' } }))

    render(<ToastProvider><AccountsPage user={{ planUnrestricted: true }} /></ToastProvider>)

    expect(screen.getByText('Adicionar ou remover conta')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Plataforma'), { target: { value: 'instagram' } })
    fireEvent.change(screen.getByLabelText('Link da Página'), { target: { value: 'https://instagram.com/meuecoomidia' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Conectar' }).at(-1))

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/auth/instagram?accountName=https%3A%2F%2Finstagram.com%2Fmeuecoomidia&platform=instagram&returnTo=%2F'))
  })

  it('requires the page link before starting the OAuth connection', async () => {
    const apiFetchMock = vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/accounts') return Promise.resolve({ data: [] })
      if (path === '/api/platform-health') return Promise.resolve({ platforms: {} })
      return Promise.resolve({})
    })

    render(<ToastProvider><AccountsPage user={{ planUnrestricted: true }} /></ToastProvider>)

    const pageLink = await screen.findByLabelText('Link da Página')
    expect(pageLink).toBeRequired()
    fireEvent.click(screen.getAllByRole('button', { name: 'Conectar' }).at(-1))

    const alerts = await screen.findAllByRole('alert')
    expect(alerts.some(alert => alert.textContent.includes('Informe o link da Página para continuar.'))).toBe(true)
    expect(apiFetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/auth/'))
  })

  it('does not offer another account when the plan connection limit is reached', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/accounts') return Promise.resolve({ data: [
        { id: 1, platform: 'instagram', handle: '@one', tokens: [{ status: 'valid' }] },
        { id: 2, platform: 'youtube', handle: '@two', tokens: [{ status: 'valid' }] },
      ] })
      if (path === '/api/platform-health') return Promise.resolve({ platforms: {} })
      return Promise.resolve({})
    })

    render(<ToastProvider><AccountsPage user={{ plan: 'basico' }} /></ToastProvider>)

    const instagramCard = (await screen.findByRole('heading', { name: 'Instagram' })).closest('article')
    expect(within(instagramCard).getByRole('button', { name: 'Limite atingido' })).toBeDisabled()
  })

  it('explains a refused OAuth start with the reason and what did not happen', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/accounts') return Promise.resolve({ data: [] })
      if (path === '/api/platform-health') return Promise.resolve({ platforms: {} })
      if (path.startsWith('/auth/')) {
        return Promise.reject(new api.ApiError('Não foi possível concluir a operação', 402, {
          error: 'O limite de contas conectadas foi atingido. Verifique seu método de pagamento ou entre em contato com o suporte.',
          detail: 'Nenhuma conta foi adicionada.',
        }))
      }
      return Promise.resolve({})
    })
    const popup = { closed: false, close: vi.fn(), location: { href: '' } }
    vi.spyOn(window, 'open').mockImplementation(() => popup)

    render(<ToastProvider><AccountsPage user={{ planUnrestricted: true }} /></ToastProvider>)
    fireEvent.change(await screen.findByLabelText('Link da Página'), { target: { value: 'https://facebook.com/minhapagina' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Conectar' }).at(-1))

    const alerts = await screen.findAllByRole('alert')
    expect(alerts.some(alert => alert.textContent.includes('O limite de contas conectadas foi atingido. Verifique seu método de pagamento ou entre em contato com o suporte. Nenhuma conta foi adicionada.'))).toBe(true)
    expect(popup.close).toHaveBeenCalled()
  })

  it('starts a single authorization when Enter is pressed again while it is opening', async () => {
    let resolveAuth
    const apiFetchMock = vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/accounts') return Promise.resolve({ data: [] })
      if (path === '/api/platform-health') return Promise.resolve({ platforms: {} })
      if (path.startsWith('/auth/')) return new Promise(resolve => { resolveAuth = resolve })
      return Promise.resolve({})
    })
    const openMock = vi.spyOn(window, 'open').mockImplementation(() => ({ closed: false, close: vi.fn(), location: { href: '' } }))

    render(<ToastProvider><AccountsPage user={{ planUnrestricted: true }} /></ToastProvider>)
    const link = await screen.findByLabelText('Link da Página')
    fireEvent.change(link, { target: { value: 'https://facebook.com/minhapagina' } })
    fireEvent.keyDown(link, { key: 'Enter' })
    fireEvent.keyDown(link, { key: 'Enter' })

    expect(apiFetchMock.mock.calls.filter(([path]) => path.startsWith('/auth/'))).toHaveLength(1)
    expect(openMock).toHaveBeenCalledTimes(1)
    resolveAuth({ authUrl: 'https://provider.example/oauth' })
    expect(await screen.findByText(/A autorização foi aberta em outra janela/)).toBeInTheDocument()
  })

  it('shows a failed accounts load as an error with a retry, not as an empty account list', async () => {
    let failing = true
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/accounts') {
        return failing
          ? Promise.reject(new api.ApiError('Tempo esgotado. Verifique sua conexão e tente novamente.', 408))
          : Promise.resolve({ data: [{ id: 7, platform: 'youtube', handle: '@canal', tokens: [{ status: 'valid' }] }] })
      }
      if (path === '/api/platform-health') return Promise.resolve({ platforms: {} })
      return Promise.resolve({})
    })

    render(<ToastProvider><AccountsPage user={{ planUnrestricted: true }} /></ToastProvider>)

    expect(await screen.findByText('Não foi possível carregar suas contas')).toBeInTheDocument()
    expect(screen.queryByText('Nenhuma conta conectada')).not.toBeInTheDocument()
    const youtubeCard = screen.getByRole('heading', { name: 'YouTube' }).closest('article')
    expect(within(youtubeCard).getByRole('button', { name: 'Conectar' })).toBeDisabled()

    failing = false
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findByText('@canal')).toBeInTheDocument()
    expect(screen.queryByText('Não foi possível carregar suas contas')).not.toBeInTheDocument()
  })

  it('does not mark a network as healthy when its account has no token', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/accounts') return Promise.resolve({ data: [{ id: 9, platform: 'tiktok', handle: '@sem_token', tokens: [] }] })
      if (path === '/api/platform-health') return Promise.resolve({ platforms: {} })
      return Promise.resolve({})
    })

    render(<ToastProvider><AccountsPage user={{ planUnrestricted: true }} /></ToastProvider>)

    const tiktokCard = (await screen.findByText('@sem_token')).closest('article')
    expect(within(tiktokCard).getByText('Sem token')).toBeInTheDocument()
    expect(within(tiktokCard).getByText(/1 precisa de reconexão/)).toBeInTheDocument()
    expect(within(tiktokCard).getByRole('button', { name: 'Reconectar' })).toBeEnabled()
  })

  it('shows a failed authorization as a failure, not as a success', async () => {
    window.history.replaceState({}, '', '/app/integracoes?error=oauth_failed')
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/accounts') return Promise.resolve({ data: [] })
      if (path === '/api/platform-health') return Promise.resolve({ platforms: {} })
      return Promise.resolve({})
    })

    render(<ToastProvider><AccountsPage user={{ planUnrestricted: true }} /></ToastProvider>)

    const notice = (await screen.findByText('A autorização não foi concluída. Nenhuma conta foi sincronizada.')).closest('.ds-alert')
    expect(notice).toHaveAttribute('data-tone', 'danger')
    expect(window.location.search).toBe('')
  })

  it('offers the network that matches the pasted link', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/accounts') return Promise.resolve({ data: [] })
      if (path === '/api/platform-health') return Promise.resolve({ platforms: {} })
      return Promise.resolve({})
    })

    render(<ToastProvider><AccountsPage user={{ planUnrestricted: true }} /></ToastProvider>)
    fireEvent.change(await screen.findByLabelText('Link da Página'), { target: { value: 'https://www.tiktok.com/@minhaconta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Usar TikTok' }))

    expect(screen.getByLabelText('Plataforma')).toHaveValue('tiktok')
    expect(screen.queryByRole('button', { name: 'Usar TikTok' })).not.toBeInTheDocument()
  })
})
