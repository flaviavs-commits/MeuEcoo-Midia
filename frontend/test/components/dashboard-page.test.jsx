import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { DashboardPage } from '../../src/pages/dashboard-page.jsx'
import * as api from '../../src/lib/api.js'

// O Início busca os posts por status (/api/posts?status=…): o mock responde cada status com os posts dele
// ('failed' nos dados de teste conta como 'error').
const isPostsList = path => path.startsWith('/api/posts?status=')
function postsByStatus(path, posts) {
  const status = new URLSearchParams(path.split('?')[1]).get('status')
  return { posts: posts.filter(post => post.status === status || (status === 'error' && post.status === 'failed')), hasMore: false }
}

describe('DashboardPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows a loading message before data arrives, not the empty state', async () => {
    const resolvePosts = []
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (isPostsList(path)) return new Promise(resolve => { resolvePosts.push(resolve) })
      return Promise.resolve({ accounts: [] })
    })

    render(<DashboardPage />)

    expect(screen.getByText('Carregando publicações...')).toBeInTheDocument()
    expect(screen.queryByText('Nenhuma publicação encontrada.')).not.toBeInTheDocument()

    resolvePosts.forEach(resolve => resolve({ posts: [] }))
    await waitFor(() => expect(screen.getByText('Seu Início ainda está vazio')).toBeInTheDocument())
    expect(screen.queryByText('Visualizações')).not.toBeInTheDocument()
    expect(screen.queryByText('Publicações recentes')).not.toBeInTheDocument()
  })

  it('renders fetched posts once loaded', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (isPostsList(path)) return Promise.resolve(postsByStatus(path, [{ id: 1, text: 'Meu post', status: 'scheduled' }]))
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
      if (isPostsList(path)) return Promise.resolve(postsByStatus(path, [{ id: 262, text: 'Meu post', platforms: ['instagram'], status: 'failed', errorMessage: 'This exact content is already scheduled.' }]))
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

  it('keeps the "Agendar agora" call and sends the performance details to Relatórios', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (isPostsList(path)) return Promise.resolve(postsByStatus(path, [{ id: 5, text: 'Publicado ontem', status: 'published' }]))
      if (path === '/api/accounts') return Promise.resolve({ accounts: [{ id: 1, platform: 'instagram' }] })
      return Promise.resolve({ metrics: [] })
    })
    const onNavigate = vi.fn()

    render(<DashboardPage onNavigate={onNavigate} />)

    expect(await screen.findByRole('button', { name: 'Agendar agora' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Relatórios' }))
    expect(onNavigate).toHaveBeenCalledWith('analytics')
    // the summary keeps only what matters: no performance filters, charts or post search here
    expect(screen.queryByRole('group', { name: 'Filtrar performance por rede social' })).not.toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('does not say there are no failures while the posts are still loading', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (isPostsList(path)) return new Promise(() => {})
      return Promise.resolve({ accounts: [] })
    })

    render(<DashboardPage />)

    expect(await screen.findByText('Carregando publicações...')).toBeInTheDocument()
    expect(screen.queryByText('Nenhuma falha registrada')).not.toBeInTheDocument()
  })

  it('does not claim an empty schedule when the posts could not be loaded', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (isPostsList(path)) return Promise.reject(new Error('Falha de rede'))
      if (path === '/api/accounts') return Promise.resolve({ accounts: [{ id: 1, platform: 'instagram' }] })
      return Promise.resolve({ metrics: [] })
    })

    render(<DashboardPage onNavigate={() => {}} />)

    expect(await screen.findByText(/Não foi possível carregar a agenda/)).toBeInTheDocument()
    expect(screen.queryByText(/Nenhum agendamento próximo/)).not.toBeInTheDocument()
  })

  it('shows the 7-day figures only after the metrics arrive', async () => {
    let resolveMetrics
    const apiFetch = vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (isPostsList(path)) return Promise.resolve(postsByStatus(path, [{ id: 5, text: 'Publicado ontem', status: 'published' }]))
      if (path === '/api/accounts') return Promise.resolve({ accounts: [{ id: 1, platform: 'instagram' }] })
      if (path.startsWith('/api/posts/analytics')) return new Promise(resolve => { resolveMetrics = resolve })
      return Promise.resolve({})
    })

    render(<DashboardPage onNavigate={() => {}} />)

    expect(await screen.findByRole('heading', { name: 'Últimos 7 dias' })).toBeInTheDocument()
    expect(screen.queryByText('Visualizações')).not.toBeInTheDocument()
    expect(screen.queryByText(/Nenhuma publicação com métricas/)).not.toBeInTheDocument()

    resolveMetrics({ metrics: [] })
    expect(await screen.findByText('Nenhuma publicação com métricas nos últimos 7 dias.')).toBeInTheDocument()
    expect(apiFetch).toHaveBeenCalledWith('/api/posts/analytics?days=7', { timeoutMs: 45_000 })
  })

  it('separates the metrics error from the retry sentence', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (isPostsList(path)) return Promise.resolve(postsByStatus(path, [{ id: 5, text: 'Publicado ontem', status: 'published' }]))
      if (path === '/api/accounts') return Promise.resolve({ accounts: [{ id: 1, platform: 'instagram' }] })
      if (path.startsWith('/api/posts/analytics')) return Promise.reject(new Error('Não foi possível concluir a operação'))
      return Promise.resolve({})
    })

    render(<DashboardPage onNavigate={() => {}} />)

    expect(await screen.findByText('Não foi possível concluir a operação. Uma nova tentativa acontece automaticamente.')).toBeInTheDocument()
  })

  it('names the networks of an alert in text, not only with logos', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (isPostsList(path)) return Promise.resolve(postsByStatus(path, [{ id: 7, text: 'Falhou em duas redes', platforms: ['instagram', 'facebook'], status: 'failed', errorMessage: 'This exact content is already scheduled.' }]))
      if (path === '/api/accounts') return Promise.resolve({ accounts: [] })
      return Promise.resolve({ metrics: [] })
    })

    render(<DashboardPage onNavigate={() => {}} />)

    const [alertTitle] = await screen.findAllByText('Falhou em duas redes')
    expect(within(alertTitle.closest('li')).getByText('Instagram e Facebook')).toBeInTheDocument()
  })

  it('sums the last 7 days into views, interactions and interaction rate', async () => {
    const metrics = [100, 200, 300].map((views, index) => ({
      postId: index + 1,
      platform: 'instagram',
      text: `Post ${index + 1}`,
      publishedAt: new Date(2026, 8, 20 + index, 12).toISOString(),
      metrics: { views, likes: views / 20, comments: views / 20 },
    }))
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (isPostsList(path)) return Promise.resolve(postsByStatus(path, [{ id: 5, text: 'Publicado ontem', status: 'published' }]))
      if (path === '/api/accounts') return Promise.resolve({ accounts: [{ id: 1, platform: 'instagram' }] })
      if (path.startsWith('/api/posts/analytics')) return Promise.resolve({ metrics })
      return Promise.resolve({})
    })

    render(<DashboardPage onNavigate={() => {}} />)

    const views = await screen.findByText('Visualizações')
    expect(views.nextElementSibling).toHaveTextContent('600')
    expect(screen.getByText('Interações').nextElementSibling).toHaveTextContent('60')
    expect(screen.getByText('Taxa de interação').nextElementSibling).toHaveTextContent('10%')
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
      if (isPostsList(path)) return Promise.resolve(postsByStatus(path, posts))
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

  it('busca cada status do Início e marca "+" quando há mais posts do que a primeira página', async () => {
    const apiFetch = vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/posts?status=scheduled&limit=100') return Promise.resolve({ posts: [
        { id: 1, text: 'Primeiro da fila', status: 'scheduled', scheduledAt: '2026-10-05T12:00:00.000Z', platforms: ['instagram'] },
        { id: 2, text: 'Segundo da fila', status: 'scheduled', scheduledAt: '2026-10-06T12:00:00.000Z', platforms: ['instagram'] },
      ], hasMore: true })
      if (isPostsList(path)) return Promise.resolve({ posts: [], hasMore: false })
      if (path === '/api/accounts') return Promise.resolve({ data: [{ id: 1, platform: 'instagram' }] })
      return Promise.resolve({ metrics: [] })
    })

    render(<DashboardPage onNavigate={() => {}} />)

    expect(await screen.findByText('Primeiro da fila')).toBeInTheDocument()
    expect(screen.getByText('Agendadas').nextElementSibling).toHaveTextContent('2+')
    for (const status of ['scheduled', 'error', 'partial', 'published']) {
      expect(apiFetch).toHaveBeenCalledWith(`/api/posts?status=${status}&limit=100`)
    }
    expect(apiFetch).not.toHaveBeenCalledWith('/api/posts')
  })
})

