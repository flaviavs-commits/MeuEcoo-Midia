import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SchedulerPage } from '../../src/pages/scheduler-page.jsx'
import { ToastProvider } from '../../src/components/ui/toast.jsx'
import * as api from '../../src/lib/api.js'

const ACCOUNTS = [
  { id: 1, platform: 'instagram', handle: 'ecoomidia', ownerEmail: 'social@ecoomidia.com.br', tokens: [{ status: 'valid' }] },
  { id: 2, platform: 'tiktok', handle: 'ecoomidia', ownerEmail: 'social@ecoomidia.com.br', tokens: [{ status: 'expiring' }] }
]

function renderComposer(accounts = ACCOUNTS) {
  vi.spyOn(api, 'apiFetch').mockImplementation(path => {
    if (path === '/api/accounts') return Promise.resolve({ total: accounts.length, data: accounts })
    return Promise.resolve({ id: 9 })
  })
  return render(<ToastProvider><SchedulerPage onNavigate={vi.fn()} /></ToastProvider>)
}

describe('SchedulerPage', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('lists the accounts of the selected networks and blocks scheduling while issues remain', async () => {
    renderComposer()

    expect(screen.getByRole('heading', { name: 'Meu Post' })).toBeInTheDocument()
    expect(await screen.findByRole('checkbox', { name: 'Usar ecoomidia no Instagram' })).toBeChecked()
    // Only accounts of selected networks are listed; TikTok starts unselected.
    expect(screen.queryByRole('checkbox', { name: 'Usar ecoomidia no TikTok' })).not.toBeInTheDocument()

    const issues = await screen.findByRole('button', { name: /2 pendências antes de agendar/ })
    expect(screen.getByRole('button', { name: /^Agendar/ })).toBeDisabled()

    fireEvent.click(issues)
    expect(screen.getByRole('button', { name: /Escreva um texto ou anexe uma imagem\/vídeo\./ })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Texto do Instagram'), { target: { value: 'Legenda nova' } })
    expect(await screen.findByRole('button', { name: /1 pendência antes de agendar/ })).toBeInTheDocument()
  })

  it('switches between scheduling and publishing now', async () => {
    renderComposer()
    await screen.findByRole('checkbox', { name: 'Usar ecoomidia no Instagram' })

    expect(screen.getByLabelText('Data e hora')).toBeRequired()
    fireEvent.click(screen.getByRole('radio', { name: /Publicar agora/ }))

    expect(screen.queryByLabelText('Data e hora')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Publicar agora/ })).toBeInTheDocument()
  })

  it('shows one text tab per selected network', async () => {
    renderComposer()
    await screen.findByRole('checkbox', { name: 'Usar ecoomidia no Instagram' })

    fireEvent.click(screen.getByRole('checkbox', { name: /TikTok/ }))

    expect(await screen.findByRole('checkbox', { name: 'Usar ecoomidia no TikTok' })).toBeChecked()
    const tiktokTab = within(screen.getByRole('tablist', { name: 'Texto por rede' })).getByRole('tab', { name: /TikTok/ })
    fireEvent.click(tiktokTab)
    expect(tiktokTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Título chamativo')).toBeInTheDocument()
  })

  it('offers to connect an account when none is connected', async () => {
    renderComposer([])

    expect(await screen.findByText('Nenhuma conta conectada. Conecte uma conta antes de continuar.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: /Conectar conta/ })).toBeInTheDocument())
  })
})

describe('SchedulerPage — resultado, data e envio', () => {
  const FACEBOOK = [{ id: 3, platform: 'facebook', handle: 'ecoomidia', name: 'Ecoo Mídia', ownerEmail: 'social@ecoomidia.com.br', tokens: [{ status: 'valid' }] }]

  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  // Deixa só o Facebook marcado, com texto: nenhuma pendência de validação.
  async function facebookOnly() {
    const networks = await screen.findByRole('group', { name: 'Redes sociais' })
    fireEvent.click(within(networks).getByRole('checkbox', { name: /Facebook/ }))
    fireEvent.click(within(networks).getByRole('checkbox', { name: /Instagram/ }))
    fireEvent.change(await screen.findByLabelText('Texto do Facebook'), { target: { value: 'Bastidores da semana' } })
  }

  it('keeps the per-network result when a partial publication notice is closed', async () => {
    let posted = false
    vi.spyOn(api, 'apiFetch').mockImplementation((path, options = {}) => {
      if (path === '/api/accounts') return Promise.resolve({ data: FACEBOOK })
      if (path === '/api/posts' && options.method === 'POST') { posted = true; return Promise.resolve({ id: 77 }) }
      if (path.startsWith('/api/logs/events/since/')) {
        return Promise.resolve({ events: posted ? [{ id: 5, event_name: 'post_published', payload: { id: 77, status: 'partial', platforms: ['facebook'], results: [
          { platform: 'facebook', account: '@ecoomidia', success: true },
          { platform: 'facebook', account: '@lojaecoo', success: false, error: 'Token expirado' },
        ] } }] : [] })
      }
      return Promise.resolve({ id: 9 })
    })
    render(<ToastProvider><SchedulerPage onNavigate={vi.fn()} /></ToastProvider>)
    await facebookOnly()
    fireEvent.click(screen.getByRole('radio', { name: /Publicar agora/ }))

    const submit = await screen.findByRole('button', { name: /^Publicar agora/ })
    await waitFor(() => expect(submit).toBeEnabled())
    fireEvent.click(submit)

    expect(await screen.findByRole('dialog', { name: 'Publicação parcial' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }))

    expect(screen.queryByRole('dialog', { name: 'Publicação parcial' })).not.toBeInTheDocument()
    expect(screen.getByText('Resultado da última tentativa')).toBeInTheDocument()
    expect(screen.getByText('Token expirado')).toBeInTheDocument()
  })

  it('never says it is ready to schedule while the date is empty', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => path === '/api/accounts' ? Promise.resolve({ data: FACEBOOK }) : Promise.resolve({ id: 9 }))
    render(<ToastProvider><SchedulerPage onNavigate={vi.fn()} /></ToastProvider>)
    await facebookOnly()

    expect(await screen.findByRole('button', { name: /Escolha a data e a hora/ })).toBeInTheDocument()
    expect(screen.queryByText(/Pronto para agendar/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Agendar/ })).toBeDisabled()
  })

  it('saves a template once even when the button is clicked twice', async () => {
    const templates = []
    let finish
    vi.spyOn(api, 'apiFetch').mockImplementation((path, options = {}) => {
      if (path === '/api/accounts') return Promise.resolve({ data: ACCOUNTS })
      if (path === '/api/drafts' && String(options.body).includes('"isTemplate":true')) {
        templates.push(options.body)
        return new Promise(resolve => { finish = resolve })
      }
      return Promise.resolve({ id: 9 })
    })
    render(<ToastProvider><SchedulerPage onNavigate={vi.fn()} /></ToastProvider>)
    await screen.findByRole('checkbox', { name: 'Usar ecoomidia no Instagram' })
    fireEvent.change(screen.getByLabelText('Texto do Instagram'), { target: { value: 'Legenda do modelo' } })

    const save = screen.getByRole('button', { name: 'Salvar como modelo' })
    fireEvent.click(save)
    fireEvent.click(save)

    expect(templates).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled()
    finish({ id: 12 })
    expect(await screen.findByRole('button', { name: 'Salvar como modelo' })).toBeEnabled()
  })
})

describe('SchedulerPage — contas que não publicam', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear() })
  afterEach(() => vi.restoreAllMocks())

  function renderWith(accounts) {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => path === '/api/accounts' ? Promise.resolve({ data: accounts }) : Promise.resolve({}))
    const onNavigate = vi.fn()
    const view = render(<ToastProvider><SchedulerPage onNavigate={onNavigate} /></ToastProvider>)
    return { onNavigate, ...view }
  }

  it('avisa quando uma conta precisa ser reconectada e leva para Contas', async () => {
    const { onNavigate } = renderWith([
      { id: 1, platform: 'instagram', handle: 'ecoomidia', tokens: [{ status: 'valid' }] },
      { id: 2, platform: 'tiktok', handle: 'loja', tokens: [{ status: 'expired' }] },
    ])

    const dialog = await screen.findByRole('dialog', { name: 'Uma conta precisa ser reconectada' })
    expect(dialog).toHaveTextContent('@loja (TikTok)')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ir para Contas' }))

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('integracoes'))
  })

  it('avisa quando nenhuma rede está conectada', async () => {
    renderWith([])

    expect(await screen.findByRole('dialog', { name: 'Conecte uma conta para publicar' })).toBeInTheDocument()
  })

  it('não avisa quando as contas funcionam, nem de novo depois de "Agora não"', async () => {
    const valid = [{ id: 1, platform: 'instagram', handle: 'ecoomidia', tokens: [{ status: 'expiring' }] }]
    const first = renderWith(valid)
    await waitFor(() => expect(screen.getAllByText(/ecoomidia/).length).toBeGreaterThan(0))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    first.unmount()
    vi.restoreAllMocks()

    const broken = [{ id: 7, platform: 'facebook', name: 'Ecoo Mídia', tokens: [{ status: 'error' }] }]
    const second = renderWith(broken)
    const dialog = await screen.findByRole('dialog', { name: 'Uma conta precisa ser reconectada' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Agora não' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(second.onNavigate).not.toHaveBeenCalled()
    second.unmount()
    vi.restoreAllMocks()

    renderWith(broken)
    await waitFor(() => expect(screen.getAllByText(/Ecoo Mídia/).length).toBeGreaterThan(0))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
