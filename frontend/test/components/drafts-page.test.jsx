import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { DraftsPage } from '../../src/pages/drafts-page.jsx'
import { ToastProvider } from '../../src/components/ui/toast.jsx'
import * as api from '../../src/lib/api.js'

const longUrl = 'https://exemplo.com/campanha/primavera?utm_source=instagram&utm_medium=social&utm_campaign=lancamento-colecao-2026'

function renderPage(props = {}) {
  return render(<ToastProvider><DraftsPage onNavigate={() => {}} {...props} /></ToastProvider>)
}

describe('DraftsPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('shows the counts in one line and tells media and networks in text', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path.startsWith('/api/drafts?')) {
        return Promise.resolve({ drafts: [
          { id: 1, title: 'Roteiro de Reels', text: 'Três dicas rápidas.', platforms: ['instagram', 'tiktok'], mediaItems: [{ path: '/v.mp4', type: 'video' }, { path: '/a.png', type: 'image' }] },
          { id: 2, title: 'Modelo de publicação', text: 'Gancho em uma frase.', platforms: ['facebook'], is_template: true },
        ] })
      }
      return Promise.resolve({})
    })

    renderPage()

    const counts = (await screen.findByText('ideias salvas')).closest('p')
    expect(counts).toHaveTextContent('2 ideias salvas')
    expect(counts).toHaveTextContent('1 modelo')
    expect(counts).toHaveTextContent('1 com mídia')
    const reels = screen.getByRole('heading', { name: 'Roteiro de Reels' }).closest('li')
    expect(within(reels).getByText('Vídeo e mais 1 mídia')).toBeInTheDocument()
    expect(within(reels).getByText('Redes: Instagram e TikTok')).toBeInTheDocument()
    const template = screen.getByRole('heading', { name: 'Modelo de publicação' }).closest('li')
    expect(within(template).getByText('Somente texto')).toBeInTheDocument()
  })

  it('caps the theme at the 4000 characters the idea generator accepts', async () => {
    vi.spyOn(api, 'apiFetch').mockResolvedValue({ drafts: [] })

    renderPage()

    const theme = await screen.findByLabelText('Tema ou instrução')
    expect(theme).toHaveAttribute('maxLength', '4000')
    expect(screen.getByText('0/4000')).toBeInTheDocument()
  })

  it('generates ideas with the same request as before and saves each one', async () => {
    const apiFetchMock = vi.spyOn(api, 'apiFetch').mockImplementation((path, options = {}) => {
      if (path === '/api/drafts' && options.method === 'POST') return Promise.resolve({ draft: {} })
      if (path.startsWith('/api/drafts?')) return Promise.resolve({ drafts: [] })
      if (path === '/api/ai/generate') return Promise.resolve({ posts: [{ titulo: 'Ideia A', texto: 'Texto A' }, { titulo: 'Ideia B', texto: 'Texto B' }] })
      return Promise.resolve({})
    })

    renderPage()
    fireEvent.change(await screen.findByLabelText('Tema ou instrução'), { target: { value: 'bastidores da gravação' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gerar ideias' }))

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/ai/generate', {
      method: 'POST',
      timeoutMs: 60_000,
      body: JSON.stringify({ instrucao: 'bastidores da gravação', plataformas: ['instagram'], quantidade: 3, tom: 'profissional' }),
    }))
    await waitFor(() => expect(apiFetchMock.mock.calls.filter(([path, options]) => path === '/api/drafts' && options?.method === 'POST')).toHaveLength(2))
    expect(await screen.findByLabelText('Tema ou instrução')).toHaveValue('')
  })

  it('asks for a theme before generating', async () => {
    const apiFetchMock = vi.spyOn(api, 'apiFetch').mockResolvedValue({ drafts: [] })

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar ideias' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Escreva um tema ou instrução para o sistema inteligente gerar ideias.')
    expect(apiFetchMock).not.toHaveBeenCalledWith('/api/ai/generate', expect.anything())
  })

  it('expands a long idea text in place, with the toggle pointing at the text it controls', async () => {
    vi.spyOn(api, 'apiFetch').mockResolvedValue({ drafts: [{ id: 3, title: 'Campanha', text: `Link da campanha: ${longUrl} ${'mais texto '.repeat(20)}`, platforms: ['instagram'] }] })

    renderPage()

    const more = await screen.findByRole('button', { name: 'Ver texto completo' })
    const text = screen.getByText(longUrl, { exact: false })
    expect(more).toHaveAttribute('aria-controls', text.id)
    fireEvent.click(more)
    expect(screen.getByRole('button', { name: 'Mostrar menos' })).toHaveAttribute('aria-expanded', 'true')
    expect(text).toHaveAttribute('data-expanded', 'true')
  })

  it('moves focus to the next idea after one is deleted', async () => {
    let drafts = [
      { id: 1, title: 'Primeira ideia', text: 'Um', platforms: ['instagram'] },
      { id: 2, title: 'Segunda ideia', text: 'Dois', platforms: ['instagram'] },
    ]
    vi.spyOn(api, 'apiFetch').mockImplementation((path, options = {}) => {
      if (path === '/api/drafts/1' && options.method === 'DELETE') {
        drafts = drafts.filter(draft => draft.id !== 1)
        return Promise.resolve({ ok: true })
      }
      if (path.startsWith('/api/drafts?')) return Promise.resolve({ drafts })
      return Promise.resolve({})
    })

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Mais ações para “Primeira ideia”' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Excluir' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Excluir esta ideia?' })).getByRole('button', { name: 'Excluir' }))

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Primeira ideia' })).not.toBeInTheDocument())
    const next = within(screen.getByRole('heading', { name: 'Segunda ideia' }).closest('li')).getByRole('button', { name: 'Criar post' })
    await waitFor(() => expect(next).toHaveFocus())
  })

  it('shows a failed delete as its own message and keeps the list', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation((path, options = {}) => {
      if (path === '/api/drafts/1' && options.method === 'DELETE') return Promise.reject(new api.ApiError('Não foi possível excluir a ideia agora.', 500))
      if (path.startsWith('/api/drafts?')) return Promise.resolve({ drafts: [{ id: 1, title: 'Primeira ideia', text: 'Um', platforms: ['instagram'] }] })
      return Promise.resolve({})
    })

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Mais ações para “Primeira ideia”' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Excluir' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Excluir esta ideia?' })).getByRole('button', { name: 'Excluir' }))

    const alerts = await screen.findAllByRole('alert')
    expect(alerts.some(alert => alert.textContent.includes('Não foi possível excluir a ideia agora.'))).toBe(true)
    expect(screen.queryByText('Não foi possível carregar as ideias')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Primeira ideia' })).toBeInTheDocument()
  })

  it('shows a failed load with a retry instead of an empty chest or zero counts', async () => {
    let failing = true
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path.startsWith('/api/drafts?')) return failing ? Promise.reject(new Error('Tempo esgotado')) : Promise.resolve({ drafts: [{ id: 9, title: 'De volta', text: 'Texto', platforms: [] }] })
      return Promise.resolve({})
    })

    renderPage()

    expect(await screen.findByText('Não foi possível carregar as ideias')).toBeInTheDocument()
    expect(screen.queryByText(/Seu baú está vazio/)).not.toBeInTheDocument()
    expect(screen.queryByText('ideias salvas')).not.toBeInTheDocument()

    failing = false
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByRole('heading', { name: 'De volta' })).toBeInTheDocument()
  })

  it('opens an idea in Meu Post with its text and networks', async () => {
    vi.spyOn(api, 'apiFetch').mockResolvedValue({ drafts: [{ id: 4, title: 'Enquete', text: 'Qual formato vocês preferem?', platforms: ['instagram', 'facebook'] }] })
    const onNavigate = vi.fn()

    renderPage({ onNavigate })
    fireEvent.click(await screen.findByRole('button', { name: 'Criar post' }))

    expect(onNavigate).toHaveBeenCalledWith('agendador')
    expect(JSON.parse(localStorage.getItem('meu-ecoo:scheduler-autosave'))).toMatchObject({ text: 'Qual formato vocês preferem?', selected: ['instagram', 'facebook'], publishNow: false })
  })

  it('empties the chest only after the DS confirmation', async () => {
    const apiFetchMock = vi.spyOn(api, 'apiFetch').mockImplementation((path, options = {}) => {
      if (path === '/api/drafts' && options.method === 'DELETE') return Promise.resolve({ ok: true })
      if (path.startsWith('/api/drafts?')) return Promise.resolve({ drafts: [{ id: 1, title: 'Primeira ideia', text: 'Um', platforms: ['instagram'] }, { id: 2, title: 'Segunda ideia', text: 'Dois', platforms: ['facebook'] }] })
      return Promise.resolve({})
    })

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Mais ações do Baú de Ideias' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Esvaziar Baú' }))
    const dialog = await screen.findByRole('dialog', { name: 'Esvaziar o Baú de Ideias?' })
    expect(dialog).toHaveTextContent('Todas as 2 ideias salvas serão excluídas. Não dá para desfazer.')
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    expect(apiFetchMock.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Esvaziar' }))

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/drafts', { method: 'DELETE' }))
    expect(await screen.findByText('Baú de Ideias esvaziado.')).toBeInTheDocument()
  })

  it('lê todas as páginas de ideias, não só as primeiras', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/drafts?limit=100&offset=0') return Promise.resolve({ drafts: [{ id: 1, title: 'Da primeira página', text: 'Um', platforms: ['instagram'] }], hasMore: true })
      if (path === '/api/drafts?limit=100&offset=1') return Promise.resolve({ drafts: [{ id: 2, title: 'Da segunda página', text: 'Dois', platforms: ['instagram'] }], hasMore: false })
      return Promise.resolve({})
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Da segunda página' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Da primeira página' })).toBeInTheDocument()
  })

  it('quando uma das ideias não grava, diz quantas entraram e recarrega a lista (sem duplicar ao tentar de novo)', async () => {
    let posts = 0
    const apiFetchMock = vi.spyOn(api, 'apiFetch').mockImplementation((path, options = {}) => {
      if (path === '/api/drafts' && options.method === 'POST') {
        posts += 1
        return posts === 2 ? Promise.reject(new api.ApiError('Não foi possível salvar a ideia.', 500)) : Promise.resolve({ draft: {} })
      }
      if (path.startsWith('/api/drafts?')) return Promise.resolve({ drafts: [] })
      if (path === '/api/ai/generate') return Promise.resolve({ posts: [{ titulo: 'A', texto: 'Texto A' }, { titulo: 'B', texto: 'Texto B' }, { titulo: 'C', texto: 'Texto C' }] })
      return Promise.resolve({})
    })

    renderPage()
    fireEvent.change(await screen.findByLabelText('Tema ou instrução'), { target: { value: 'bastidores' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gerar ideias' }))

    expect(await screen.findAllByText('2 de 3 ideias foram salvas no Baú de Ideias. As outras não entraram; gere de novo se quiser mais.')).not.toHaveLength(0)
    expect(apiFetchMock.mock.calls.filter(([path]) => path.startsWith('/api/drafts?')).length).toBeGreaterThan(1)
  })
})

