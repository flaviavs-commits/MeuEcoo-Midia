import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MediaLibraryPage, MEDIA_LIBRARY_SELECTION_KEY } from '../../src/pages/media-library-page.jsx'
import { ToastProvider } from '../../src/components/ui/toast.jsx'
import * as api from '../../src/lib/api.js'

const assets = [
  { id: 11, name: 'capa-campanha.png', url: 'https://cdn.example/capa.png', mimeType: 'image/png', sizeBytes: 540000, folder: 'Campanhas', tags: ['lancamento'] },
  { id: 12, name: 'bastidores.mp4', url: 'https://cdn.example/bastidores.mp4', mimeType: 'video/mp4', sizeBytes: 3200000, folder: 'Geral', tags: [] },
]
const folders = [{ name: 'Campanhas', assetCount: 1 }, { name: 'Geral', assetCount: 4 }]

function mockLibrary(overrides = {}) {
  return vi.spyOn(api, 'apiFetch').mockImplementation((path, options = {}) => {
    const custom = overrides[path]?.(options)
    if (custom) return custom
    if (path.startsWith('/api/media-assets?')) return Promise.resolve({ assets, hasMore: false })
    if (path === '/api/media-folders') return Promise.resolve({ folders })
    return Promise.resolve({})
  })
}

function renderPage(props = {}) {
  return render(<ToastProvider><MediaLibraryPage onNavigate={() => {}} {...props} /></ToastProvider>)
}

describe('MediaLibraryPage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  it('shows a failed load with a retry instead of an empty library', async () => {
    let failing = true
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path.startsWith('/api/media-assets?')) return failing ? Promise.reject(new Error('Tempo esgotado')) : Promise.resolve({ assets, hasMore: false })
      if (path === '/api/media-folders') return Promise.resolve({ folders })
      return Promise.resolve({})
    })

    renderPage()

    expect(await screen.findByText('Não foi possível carregar a biblioteca')).toBeInTheDocument()
    expect(screen.queryByText('Nenhuma mídia encontrada')).not.toBeInTheDocument()

    failing = false
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('capa-campanha.png')).toBeInTheDocument()
    expect(screen.queryByText('Não foi possível carregar a biblioteca')).not.toBeInTheDocument()
  })

  it('opens a preview from the thumbnail and uses the media in Meu Post from there', async () => {
    mockLibrary()
    const onNavigate = vi.fn()

    renderPage({ onNavigate })
    fireEvent.click(await screen.findByRole('button', { name: 'Visualizar capa-campanha.png' }))

    const dialog = await screen.findByRole('dialog', { name: 'capa-campanha.png' })
    expect(within(dialog).getByRole('img', { name: 'capa-campanha.png' })).toHaveAttribute('src', 'https://cdn.example/capa.png')
    expect(within(dialog).getByText('Campanhas')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Usar no Meu Post' }))

    expect(onNavigate).toHaveBeenCalledWith('agendador')
    expect(JSON.parse(sessionStorage.getItem(MEDIA_LIBRARY_SELECTION_KEY))).toMatchObject({ id: 11, url: 'https://cdn.example/capa.png', mimeType: 'image/png' })
  })

  it('names each folder with its count for screen readers', async () => {
    mockLibrary()

    renderPage()

    expect(await screen.findByRole('button', { name: 'Geral, 4 mídias' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Campanhas, 1 mídia' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Todas, 5 mídias' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('moves focus to the next media after one is removed', async () => {
    const apiFetchMock = mockLibrary({ '/api/media-assets/11': options => options.method === 'DELETE' ? Promise.resolve({ ok: true }) : null })
    vi.stubGlobal('confirm', vi.fn(() => true))

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Mais ações para “capa-campanha.png”' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remover da biblioteca' }))

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/media-assets/11', { method: 'DELETE' }))
    await waitFor(() => expect(screen.queryByText('capa-campanha.png')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Visualizar bastidores.mp4' })).toHaveFocus())
  })

  it('uploads every chosen file to the chosen folder and counts them in words', async () => {
    const apiFetchMock = mockLibrary({
      '/api/posts/upload-url': () => Promise.resolve({ uploadUrl: 'https://upload.example/put', mediaUrl: 'https://cdn.example/novo.png' }),
    })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })))

    const { container } = renderPage()
    await screen.findByText('capa-campanha.png')
    fireEvent.change(screen.getByRole('combobox', { name: 'Destino dos próximos uploads' }), { target: { value: 'Campanhas' } })
    const files = [new File(['a'], 'um.png', { type: 'image/png' }), new File(['b'], 'dois.png', { type: 'image/png' })]
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files } })

    expect(await screen.findByText('2 mídias adicionadas à biblioteca.')).toBeInTheDocument()
    const saved = apiFetchMock.mock.calls.filter(([path, options]) => path === '/api/media-assets' && options?.method === 'POST').map(([, options]) => JSON.parse(options.body))
    expect(saved).toEqual([
      expect.objectContaining({ name: 'um.png', folder: 'Campanhas', url: 'https://cdn.example/novo.png' }),
      expect.objectContaining({ name: 'dois.png', folder: 'Campanhas' }),
    ])
  })

  it('searches after a pause in typing', async () => {
    const apiFetchMock = mockLibrary()

    renderPage()
    await screen.findByText('capa-campanha.png')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar mídia' }), { target: { value: 'capa' } })

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/media-assets?search=capa&folder='))
  })
})
