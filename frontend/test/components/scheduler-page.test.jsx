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
