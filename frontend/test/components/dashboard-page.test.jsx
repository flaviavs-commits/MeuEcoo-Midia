import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { DashboardPage } from '../../src/pages/dashboard-page.jsx'
import * as api from '../../src/lib/api.js'

describe('DashboardPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows a loading message before data arrives, not the empty state', async () => {
    let resolvePosts
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/posts') return new Promise(resolve => { resolvePosts = resolve })
      return Promise.resolve({ accounts: [] })
    })

    render(<DashboardPage />)

    expect(screen.getByText('Carregando publicações...')).toBeInTheDocument()
    expect(screen.queryByText('Nenhuma publicação encontrada.')).not.toBeInTheDocument()

    resolvePosts({ posts: [] })
    await waitFor(() => expect(screen.getByText('Seu Início ainda está vazio')).toBeInTheDocument())
    expect(screen.queryByText('Visualizações')).not.toBeInTheDocument()
    expect(screen.queryByText('Publicações recentes')).not.toBeInTheDocument()
  })

  it('renders fetched posts once loaded', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/posts') return Promise.resolve({ posts: [{ id: 1, text: 'Meu post', status: 'scheduled' }] })
      return Promise.resolve({ accounts: [{ id: 1 }] })
    })

    render(<DashboardPage />)

    await waitFor(() => expect(screen.getByText('Meu post')).toBeInTheDocument())
    expect(screen.getAllByText('1')).toHaveLength(3)
  })

  it('shows an error message if the fetch fails', async () => {
    vi.spyOn(api, 'apiFetch').mockRejectedValue(new Error('Falha de rede'))

    render(<DashboardPage />)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Falha de rede'))
  })

  it('opens content failures in the editor with the original post attached', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/posts') return Promise.resolve({ posts: [{ id: 262, text: 'Meu post', platforms: ['instagram'], status: 'failed', errorMessage: 'This exact content is already scheduled.' }] })
      if (path === '/api/accounts') return Promise.resolve({ accounts: [] })
      return Promise.resolve({ metrics: [] })
    })
    const onNavigate = vi.fn()

    render(<DashboardPage onNavigate={onNavigate} />)

    const [button] = await screen.findAllByRole('button', { name: 'Revisar no editor' })
    button.click()

    expect(onNavigate).toHaveBeenCalledWith('agendador')
    expect(JSON.parse(localStorage.getItem('meu-ecoo:scheduler-autosave'))).toMatchObject({ sourceFailureId: 262, publishNow: true, selected: ['instagram'] })
  })

  it('keeps the performance, period and search names and the "Agendar agora" call', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/posts') return Promise.resolve({ posts: [{ id: 5, text: 'Publicado ontem', status: 'published' }] })
      if (path === '/api/accounts') return Promise.resolve({ accounts: [{ id: 1, platform: 'instagram' }] })
      return Promise.resolve({ metrics: [] })
    })

    render(<DashboardPage onNavigate={() => {}} />)

    expect(await screen.findByRole('group', { name: 'Filtrar performance por rede social' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Período da performance' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Buscar publicação no dashboard' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Agendar agora' })).toBeInTheDocument()
  })

  it('does not say there are no failures while the posts are still loading', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/posts') return new Promise(() => {})
      return Promise.resolve({ accounts: [] })
    })

    render(<DashboardPage />)

    expect(await screen.findByText('Carregando publicações...')).toBeInTheDocument()
    expect(screen.queryByText('Nenhuma falha registrada')).not.toBeInTheDocument()
  })

  it('does not claim an empty schedule when the posts could not be loaded', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/posts') return Promise.reject(new Error('Falha de rede'))
      if (path === '/api/accounts') return Promise.resolve({ accounts: [{ id: 1, platform: 'instagram' }] })
      return Promise.resolve({ metrics: [] })
    })

    render(<DashboardPage onNavigate={() => {}} />)

    expect(await screen.findByText(/Não foi possível carregar a agenda/)).toBeInTheDocument()
    expect(screen.queryByText(/Nenhum agendamento próximo/)).not.toBeInTheDocument()
  })

  it('shows the period readings only after the metrics arrive', async () => {
    let resolveMetrics
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/posts') return Promise.resolve({ posts: [{ id: 5, text: 'Publicado ontem', status: 'published' }] })
      if (path === '/api/accounts') return Promise.resolve({ accounts: [{ id: 1, platform: 'instagram' }] })
      if (path.startsWith('/api/posts/analytics')) return new Promise(resolve => { resolveMetrics = resolve })
      return Promise.resolve({})
    })

    render(<DashboardPage onNavigate={() => {}} />)

    expect(await screen.findByText('Publicado ontem')).toBeInTheDocument()
    expect(screen.queryByText('Leituras do período')).not.toBeInTheDocument()
    expect(screen.queryByText(/Ainda não há dados suficientes/)).not.toBeInTheDocument()

    resolveMetrics({ metrics: [] })
    expect(await screen.findByText('Leituras do período')).toBeInTheDocument()
  })

  it('separates the metrics error from the retry sentence', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/posts') return Promise.resolve({ posts: [{ id: 5, text: 'Publicado ontem', status: 'published' }] })
      if (path === '/api/accounts') return Promise.resolve({ accounts: [{ id: 1, platform: 'instagram' }] })
      if (path.startsWith('/api/posts/analytics')) return Promise.reject(new Error('Não foi possível concluir a operação'))
      return Promise.resolve({})
    })

    render(<DashboardPage onNavigate={() => {}} />)

    expect(await screen.findByText('Não foi possível concluir a operação. Uma nova tentativa acontece automaticamente.')).toBeInTheDocument()
  })

  it('names the networks of an alert in text, not only with logos', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/posts') return Promise.resolve({ posts: [{ id: 7, text: 'Falhou em duas redes', platforms: ['instagram', 'facebook'], status: 'failed', errorMessage: 'This exact content is already scheduled.' }] })
      if (path === '/api/accounts') return Promise.resolve({ accounts: [] })
      return Promise.resolve({ metrics: [] })
    })

    render(<DashboardPage onNavigate={() => {}} />)

    const [alertTitle] = await screen.findAllByText('Falhou em duas redes')
    expect(within(alertTitle.closest('li')).getByText('Instagram e Facebook')).toBeInTheDocument()
  })

  it('charts every publishing day of a longer period, one column per week', async () => {
    const metrics = Array.from({ length: 10 }, (_, index) => ({
      postId: index + 1,
      platform: 'instagram',
      text: `Post ${index + 1}`,
      publishedAt: new Date(2026, 8, 1 + index * 2, 12).toISOString(),
      metrics: { views: 100, likes: 10 },
    }))
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/posts') return Promise.resolve({ posts: [{ id: 5, text: 'Publicado ontem', status: 'published' }] })
      if (path === '/api/accounts') return Promise.resolve({ accounts: [{ id: 1, platform: 'instagram' }] })
      if (path.startsWith('/api/posts/analytics')) return Promise.resolve({ metrics })
      return Promise.resolve({})
    })

    render(<DashboardPage onNavigate={() => {}} />)

    expect(await screen.findByRole('img', { name: /Visualizações por semana de publicação/ })).toBeInTheDocument()
    const rows = screen.getAllByRole('row', { hidden: true }).slice(1)
    expect(rows).toHaveLength(3)
    expect(rows.reduce((total, row) => total + Number(row.cells[1].textContent.replace(/\D/g, '')), 0)).toBe(1000)
  })

  it('keeps keyboard focus in the attention list after deleting an alert', async () => {
    let posts = [
      { id: 1, text: 'Primeira falha', platforms: ['instagram'], status: 'failed', errorMessage: 'This exact content is already scheduled.' },
      { id: 2, text: 'Segunda falha', platforms: ['facebook'], status: 'failed', errorMessage: 'This exact content is already scheduled.' },
    ]
    vi.spyOn(api, 'apiFetch').mockImplementation((path, options = {}) => {
      if (path === '/api/posts/1' && options.method === 'DELETE') {
        posts = posts.filter(post => post.id !== 1)
        return Promise.resolve({ ok: true })
      }
      if (path === '/api/posts') return Promise.resolve({ posts })
      if (path === '/api/accounts') return Promise.resolve({ accounts: [] })
      return Promise.resolve({ metrics: [] })
    })

    render(<DashboardPage onNavigate={() => {}} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Mais ações para “Primeira falha”' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Excluir alerta' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Excluir esta publicação com falha?' })).getByRole('button', { name: 'Excluir' }))

    await waitFor(() => expect(screen.queryByText('Primeira falha')).not.toBeInTheDocument())
    const [nextTitle] = screen.getAllByText('Segunda falha')
    const nextReview = within(nextTitle.closest('li')).getByRole('button', { name: 'Revisar no editor' })
    await waitFor(() => expect(nextReview).toHaveFocus())
  })
})
