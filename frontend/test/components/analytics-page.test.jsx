import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AnalyticsPage } from '../../src/pages/analytics-page.jsx'
import { ReportSchedulePanel } from '../../src/components/analytics/report-schedule-panel.jsx'
import { ToastProvider } from '../../src/components/ui/toast.jsx'
import * as api from '../../src/lib/api.js'

vi.mock('react-chartjs-2', () => ({
  Line: props => <canvas role="img" aria-label={props['aria-label']} />,
  Bar: props => <canvas role="img" aria-label={props['aria-label']} />,
  Doughnut: props => <canvas role="img" aria-label={props['aria-label']} />,
}))

const INSTAGRAM = { id: 7, platform: 'instagram', handle: 'ecoomidia', tokens: [{ status: 'valid', accountName: 'Ecoo Mídia' }] }
const ANALYTICS = {
  metrics: [{ platform: 'instagram', publishedAt: new Date().toISOString(), text: 'Bastidores', metrics: { views: 100, likes: 10, comments: 2, shares: 1 } }],
  accountAnalytics: { platforms: {}, followerStats: { accounts: [] } },
}

function mockApi({ accounts = () => Promise.resolve({ data: [INSTAGRAM] }), analytics = ANALYTICS, schedules = [], remove } = {}) {
  return vi.spyOn(api, 'apiFetch').mockImplementation((path, options = {}) => {
    if (path.startsWith('/api/posts/analytics')) return Promise.resolve(analytics)
    if (path === '/api/posts/tiktok-videos') return Promise.resolve({ videos: [] })
    if (path === '/api/accounts') return accounts()
    if (path.startsWith('/api/report-schedules/') && options.method === 'DELETE') return remove ? remove() : Promise.resolve({})
    if (path === '/api/report-schedules') return Promise.resolve({ schedules })
    return Promise.reject(new Error(`rota não mockada: ${path}`))
  })
}

const renderPage = () => render(<ToastProvider><AnalyticsPage onNavigate={vi.fn()} /></ToastProvider>)

describe('AnalyticsPage', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('leva o foco ao painel da rede escolhida, pela lista do fim e pelo "Ver rede" do comparativo', async () => {
    mockApi()
    renderPage()

    const pick = await screen.findByRole('region', { name: 'Escolha uma rede para ver o relatório detalhado' })
    fireEvent.click(within(pick).getByRole('button', { name: 'Instagram' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Instagram' })))

    fireEvent.click(screen.getByRole('button', { name: 'Todas as redes' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ver rede Instagram' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Instagram' })))
  })

  it('dá nome aos gráficos com os valores que eles mostram', async () => {
    mockApi()
    renderPage()

    expect(await screen.findByRole('img', { name: /^Posts por plataforma\. Instagram 1$/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Resultados por dia de publicação\. Visualizações: .+ 100/ })).toBeInTheDocument()
  })

  it('abre os relatórios por e-mail num diálogo que fecha com Escape e devolve o foco', async () => {
    mockApi()
    renderPage()

    const open = await screen.findByRole('button', { name: 'Relatórios por e-mail' })
    open.focus()
    fireEvent.click(open)
    const dialog = await screen.findByRole('dialog', { name: 'Relatórios por e-mail' })
    await waitFor(() => expect(dialog).toContainElement(document.activeElement))

    fireEvent.keyDown(document.activeElement, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.activeElement).toBe(open)
  })

  it('sem redes por falha na conferência, mostra a falha e tenta de novo também as contas', async () => {
    let fail = true
    const apiFetch = mockApi({
      accounts: () => fail ? Promise.reject(new api.ApiError('Serviço indisponível.', 503)) : Promise.resolve({ data: [INSTAGRAM] }),
      analytics: { metrics: [], accountAnalytics: { platforms: {}, followerStats: { accounts: [] } } },
    })
    renderPage()

    expect(await screen.findByText('Não foi possível conferir suas redes agora')).toBeInTheDocument()
    expect(screen.getByText(/Serviço indisponível\./)).toBeInTheDocument()
    expect(screen.queryByText('Ainda não há métricas para mostrar')).not.toBeInTheDocument()

    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('region', { name: 'Escolha uma rede para ver o relatório detalhado' })).toBeInTheDocument()
    expect(apiFetch.mock.calls.filter(([path]) => path === '/api/accounts')).toHaveLength(2)
  })
})

describe('ReportSchedulePanel', () => {
  afterEach(() => vi.restoreAllMocks())

  it('não remove o mesmo agendamento duas vezes com dois cliques seguidos', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const apiFetch = mockApi({ schedules: [{ id: 3, name: 'Relatório mensal', frequency: 'monthly' }], remove: () => new Promise(() => {}) })
    render(<ToastProvider><ReportSchedulePanel /></ToastProvider>)

    const remove = await screen.findByRole('button', { name: 'Remover Relatório mensal' })
    fireEvent.click(remove)
    fireEvent.click(remove)

    await waitFor(() => expect(remove).toBeDisabled())
    expect(apiFetch.mock.calls.filter(([, options]) => options?.method === 'DELETE')).toHaveLength(1)
  })
})
