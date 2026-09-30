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

// The upload PUT goes through XMLHttpRequest (it reports progress); this fake answers it at once.
function stubUploads({ status = 200 } = {}) {
  const sent = []
  class FakeRequest {
    constructor() { this.upload = {}; this.headers = {} }
    open(method, url) { this.method = method; this.url = url }
    setRequestHeader(name, value) { this.headers[name] = value }
    send(body) {
      sent.push({ method: this.method, url: this.url, headers: this.headers, body })
      queueMicrotask(() => {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 })
        this.status = status
        this.responseText = '{}'
        this.onload?.()
      })
    }
  }
  vi.stubGlobal('XMLHttpRequest', FakeRequest)
  return sent
}

async function openAssetMenu(name) {
  fireEvent.click(await screen.findByRole('button', { name: `Mais ações para “${name}”` }))
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
    expect(screen.queryByText('Ainda não há mídias aqui')).not.toBeInTheDocument()

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

    renderPage()
    await openAssetMenu('capa-campanha.png')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remover da biblioteca' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remover “capa-campanha.png” da biblioteca?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remover' }))

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/media-assets/11', { method: 'DELETE' }))
    await waitFor(() => expect(screen.queryByText('capa-campanha.png')).not.toBeInTheDocument())
    expect(await screen.findByText('Mídia removida.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Visualizar bastidores.mp4' })).toHaveFocus())
  })

  it('keeps the media when the removal is cancelled', async () => {
    const apiFetchMock = mockLibrary()

    renderPage()
    await openAssetMenu('capa-campanha.png')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remover da biblioteca' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remover “capa-campanha.png” da biblioteca?' })
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(apiFetchMock.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false)
    expect(screen.getByText('capa-campanha.png')).toBeInTheDocument()
  })

  it('uploads every chosen file to the open folder and counts them in words', async () => {
    const apiFetchMock = mockLibrary({
      '/api/posts/upload-url': () => Promise.resolve({ uploadUrl: 'https://upload.example/put', mediaUrl: 'https://cdn.example/novo.png' }),
    })
    const puts = stubUploads()

    const { container } = renderPage()
    await screen.findByText('capa-campanha.png')
    fireEvent.click(screen.getByRole('button', { name: 'Campanhas, 1 mídia' }))
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/media-assets?search=&folder=Campanhas'))
    const files = [new File(['a'], 'um.png', { type: 'image/png' }), new File(['b'], 'dois.png', { type: 'image/png' })]
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files } })

    expect(await screen.findByText('2 mídias adicionadas à biblioteca.')).toBeInTheDocument()
    const saved = apiFetchMock.mock.calls.filter(([path, options]) => path === '/api/media-assets' && options?.method === 'POST').map(([, options]) => JSON.parse(options.body))
    expect(saved).toEqual([
      expect.objectContaining({ name: 'um.png', folder: 'Campanhas', url: 'https://cdn.example/novo.png' }),
      expect.objectContaining({ name: 'dois.png', folder: 'Campanhas' }),
    ])
    expect(puts).toEqual([
      expect.objectContaining({ method: 'PUT', url: 'https://upload.example/put', headers: { 'Content-Type': 'image/png' }, body: files[0] }),
      expect.objectContaining({ method: 'PUT', url: 'https://upload.example/put', body: files[1] }),
    ])
    expect(within(screen.getByRole('region', { name: 'Envios' })).getByText('2 arquivos enviados')).toBeInTheDocument()
  })

  it('takes dropped files, refuses the ones the backend would refuse and says why', async () => {
    const apiFetchMock = mockLibrary({
      '/api/posts/upload-url': () => Promise.resolve({ uploadUrl: 'https://upload.example/put', mediaUrl: 'https://cdn.example/novo.png' }),
    })
    stubUploads()
    const big = new File(['v'], 'filme.mp4', { type: 'video/mp4' })
    Object.defineProperty(big, 'size', { value: 201 * 1024 * 1024 })
    const files = [new File(['a'], 'foto.jpg', { type: 'image/jpeg' }), new File(['t'], 'roteiro.pdf', { type: 'application/pdf' }), big]

    renderPage()
    await screen.findByText('capa-campanha.png')
    const shelf = screen.getByRole('region', { name: 'Mídias salvas' })
    fireEvent.dragEnter(shelf, { dataTransfer: { types: ['Files'], files: [] } })
    expect(screen.getByText('Geral', { selector: 'strong' })).toBeInTheDocument()
    fireEvent.drop(shelf, { dataTransfer: { types: ['Files'], files } })

    expect(await screen.findByText('1 mídia adicionada à biblioteca.')).toBeInTheDocument()
    const queue = screen.getByRole('region', { name: 'Envios' })
    expect(within(queue).getByText(/Formato não aceito/)).toBeInTheDocument()
    expect(within(queue).getByText('O arquivo passa de 200 MB.')).toBeInTheDocument()
    expect(within(queue).getByText('1 de 3 enviados · 2 com problema')).toBeInTheDocument()
    const signed = apiFetchMock.mock.calls.filter(([path]) => path === '/api/posts/upload-url').map(([, options]) => JSON.parse(options.body).filename)
    expect(signed).toEqual(['foto.jpg'])
    const saved = apiFetchMock.mock.calls.filter(([path, options]) => path === '/api/media-assets' && options?.method === 'POST').map(([, options]) => JSON.parse(options.body))
    expect(saved).toEqual([expect.objectContaining({ name: 'foto.jpg', folder: 'Geral' })])
  })

  it('keeps a failed upload in the list with a retry that sends it again', async () => {
    mockLibrary({
      '/api/posts/upload-url': () => Promise.resolve({ uploadUrl: 'https://upload.example/put', mediaUrl: 'https://cdn.example/novo.png' }),
    })
    const failed = stubUploads({ status: 500 })

    const { container } = renderPage()
    await screen.findByText('capa-campanha.png')
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [new File(['a'], 'um.png', { type: 'image/png' })] } })

    const queue = await screen.findByRole('region', { name: 'Envios' })
    expect(await within(queue).findByText('O armazenamento recusou o arquivo. Tente de novo.')).toBeInTheDocument()
    const retried = stubUploads()
    fireEvent.click(within(queue).getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('1 mídia adicionada à biblioteca.')).toBeInTheDocument()
    expect(failed).toHaveLength(1)
    expect(retried).toEqual([expect.objectContaining({ method: 'PUT', url: 'https://upload.example/put' })])
  })

  it('edits the name, folder and tags of a media', async () => {
    const apiFetchMock = mockLibrary({ '/api/media-assets/11': options => options.method === 'PATCH' ? Promise.resolve({ ok: true }) : null })

    renderPage()
    await openAssetMenu('capa-campanha.png')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Editar informações' }))
    const dialog = await screen.findByRole('dialog', { name: 'Editar mídia' })
    fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: 'capa-verao.png' } })
    fireEvent.click(within(dialog).getByRole('combobox', { name: 'Pasta' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Geral' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remover a tag lancamento' }))
    const tagInput = within(dialog).getByLabelText('Tags')
    fireEvent.change(tagInput, { target: { value: '#Verão' } })
    fireEvent.keyDown(tagInput, { key: 'Enter' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText('Mídia atualizada.')).toBeInTheDocument()
    const patch = apiFetchMock.mock.calls.find(([path, options]) => path === '/api/media-assets/11' && options?.method === 'PATCH')
    expect(JSON.parse(patch[1].body)).toEqual({ name: 'capa-verao.png', folder: 'Geral', tags: ['verão'] })
    expect(screen.getByRole('button', { name: 'Visualizar capa-verao.png' })).toBeInTheDocument()
  })

  it('does not save a media without a name', async () => {
    const apiFetchMock = mockLibrary()

    renderPage()
    await openAssetMenu('capa-campanha.png')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Editar informações' }))
    const dialog = await screen.findByRole('dialog', { name: 'Editar mídia' })
    fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: '  ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Dê um nome para a mídia.')
    expect(apiFetchMock.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false)
  })

  it('moves a media to another folder and keeps its tags', async () => {
    const apiFetchMock = mockLibrary({ '/api/media-assets/11': options => options.method === 'PATCH' ? Promise.resolve({ ok: true }) : null })

    renderPage()
    await openAssetMenu('capa-campanha.png')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Mover para pasta' }))
    const dialog = await screen.findByRole('dialog', { name: 'Mover para pasta' })
    expect(within(dialog).getByRole('radio', { name: 'Campanhas (atual)' })).toHaveAttribute('aria-checked', 'true')
    expect(within(dialog).getByRole('button', { name: 'Mover' })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Geral' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mover' }))

    expect(await screen.findByText('Mídia movida para “Geral”.')).toBeInTheDocument()
    const patch = apiFetchMock.mock.calls.find(([path, options]) => path === '/api/media-assets/11' && options?.method === 'PATCH')
    expect(JSON.parse(patch[1].body)).toEqual({ name: 'capa-campanha.png', folder: 'Geral', tags: ['lancamento'] })
  })

  it('creates a folder and opens it', async () => {
    const apiFetchMock = mockLibrary({
      '/api/media-folders': options => options.method === 'POST' ? Promise.resolve({ folder: { name: 'Verão', assetCount: 0 } }) : null,
    })

    renderPage()
    await screen.findByText('capa-campanha.png')
    fireEvent.click(screen.getByRole('button', { name: 'Nova pasta' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nova pasta' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Criar pasta' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Dê um nome para a pasta.')
    fireEvent.change(within(dialog).getByLabelText('Nome da nova pasta'), { target: { value: 'Verão' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Criar pasta' }))

    expect(await screen.findByText('Pasta “Verão” criada. O que você enviar agora entra nela.')).toBeInTheDocument()
    const created = apiFetchMock.mock.calls.filter(([path, options]) => path === '/api/media-folders' && options?.method === 'POST')
    expect(created.map(([, options]) => JSON.parse(options.body))).toEqual([{ name: 'Verão' }])
    expect(screen.getByRole('button', { name: 'Verão, 0 mídias' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/media-assets?search=&folder=Ver%C3%A3o'))
  })

  it('searches after a pause in typing', async () => {
    const apiFetchMock = mockLibrary()

    renderPage()
    await screen.findByText('capa-campanha.png')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar mídia' }), { target: { value: 'capa' } })

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/media-assets?search=capa&folder='))
  })
})
