import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SmartlinksPage } from '../../src/pages/smartlinks-page.jsx'
import { ToastProvider } from '../../src/components/ui/toast.jsx'
import * as api from '../../src/lib/api.js'

function mockApi() {
  const created = []
  const apiFetchMock = vi.spyOn(api, 'apiFetch').mockImplementation((path, options = {}) => {
    if (path === '/api/smartlinks' && options.method === 'POST') {
      created.push(JSON.parse(options.body))
      return Promise.resolve({ id: 1, slug: 'loja-ecoo', publicUrl: '/go/loja-ecoo' })
    }
    if (path === '/api/smartlinks') return Promise.resolve({ smartlinks: [] })
    return Promise.resolve({})
  })
  return { apiFetchMock, created }
}

async function fillRequired() {
  fireEvent.change(await screen.findByLabelText('Nome interno'), { target: { value: 'Loja Ecoo' } })
  fireEvent.change(screen.getByLabelText('Um link por linha'), { target: { value: 'Instagram | https://instagram.com/ecoo\nhttp://sem-https.com' } })
}

describe('SmartlinksPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('envia a URL personalizada que aparece na prévia', async () => {
    const { created } = mockApi()
    render(<ToastProvider><SmartlinksPage /></ToastProvider>)

    await fillRequired()
    fireEvent.change(screen.getByLabelText('URL personalizada'), { target: { value: 'minha-loja' } })
    expect(screen.getByText(/\/go\/minha-loja$/)).toBeInTheDocument()
    expect(screen.getByText(/1 link válido · 1 linha será ignorada/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Criar Smartlink' }))

    await waitFor(() => expect(created).toHaveLength(1))
    expect(created[0]).toMatchObject({ name: 'Loja Ecoo', slug: 'minha-loja', theme: { logoUrl: null } })
    expect(created[0].items[0]).toEqual({ label: 'Instagram', url: 'https://instagram.com/ecoo' })
  })

  it('deixa o servidor gerar o endereço quando a URL fica em branco', async () => {
    const { created } = mockApi()
    render(<ToastProvider><SmartlinksPage /></ToastProvider>)

    await fillRequired()
    fireEvent.click(screen.getByRole('button', { name: 'Criar Smartlink' }))

    await waitFor(() => expect(created).toHaveLength(1))
    expect(created[0]).not.toHaveProperty('slug')
  })

  const PAGE = {
    id: 5, name: 'Loja', title: 'Loja Ecoo', slug: 'loja-ecoo', theme: {},
    items: Array.from({ length: 7 }, (_, index) => ({ id: index + 1, label: `Link ${index + 1}`, url: `https://exemplo.com/${index + 1}`, clicks: index * 10 })),
  }

  function mockWithPages(extra = {}) {
    return vi.spyOn(api, 'apiFetch').mockImplementation((path, options = {}) => {
      if (extra[`${options.method || 'GET'} ${path}`]) return extra[`${options.method || 'GET'} ${path}`]()
      if (path === '/api/smartlinks') return Promise.resolve({ smartlinks: [PAGE] })
      return Promise.reject(new Error(`rota não mockada: ${path}`))
    })
  }

  it('mostra a falha de carga em vez do formulário de primeira página', async () => {
    let falhar = true
    vi.spyOn(api, 'apiFetch').mockImplementation(() => falhar ? Promise.reject(new api.ApiError('Serviço indisponível.', 503)) : Promise.resolve({ smartlinks: [PAGE] }))
    render(<ToastProvider><SmartlinksPage /></ToastProvider>)

    expect(await screen.findByText('Não foi possível carregar seus Smartlinks')).toBeInTheDocument()
    expect(screen.queryByText('Crie sua primeira página de links')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Nome interno')).not.toBeInTheDocument()

    falhar = false
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('heading', { level: 3, name: 'Loja Ecoo' })).toBeInTheDocument()
  })

  it('copia o endereço público e confirma na hora', async () => {
    mockWithPages()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<ToastProvider><SmartlinksPage /></ToastProvider>)

    fireEvent.click(await screen.findByRole('button', { name: 'Copiar link de Loja Ecoo' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/go/loja-ecoo`))
    expect(await screen.findByRole('button', { name: 'Copiado: link de Loja Ecoo' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Link copiado.')
  })

  it('mostra os primeiros links e abre o resto sob demanda', async () => {
    mockWithPages()
    render(<ToastProvider><SmartlinksPage /></ToastProvider>)

    const lista = await screen.findByRole('list', { name: 'Links de Loja Ecoo' })
    expect(within(lista).getAllByRole('listitem')).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: 'Ver todos os 7 links' }))
    expect(within(lista).getAllByRole('listitem')).toHaveLength(7)
  })

  it('não exclui duas vezes enquanto a primeira exclusão está em andamento', async () => {
    const apiFetch = mockWithPages({ 'DELETE /api/smartlinks/5': () => new Promise(() => {}) })
    render(<ToastProvider><SmartlinksPage /></ToastProvider>)

    const menu = await screen.findByRole('button', { name: 'Mais ações para Loja Ecoo' })
    fireEvent.click(menu)
    fireEvent.click(await screen.findByRole('menuitem', { name: /Excluir/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Excluir o Smartlink “Loja Ecoo”?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.click(menu)
    const segunda = await screen.findByRole('menuitem', { name: /Excluindo/ })
    expect(segunda).toBeDisabled()
    fireEvent.click(segunda)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(apiFetch.mock.calls.filter(([, options]) => options?.method === 'DELETE')).toHaveLength(1)
  })

  it('abre o formulário de novo Smartlink numa folha modal que fecha no Escape', async () => {
    mockWithPages()
    render(<ToastProvider><SmartlinksPage /></ToastProvider>)
    const novo = await screen.findByRole('button', { name: 'Novo Smartlink' })
    novo.focus()
    fireEvent.click(novo)

    const sheet = await screen.findByRole('dialog', { name: 'Sua central de links' })
    expect(sheet).toHaveAttribute('aria-modal', 'true')
    expect(within(sheet).getByLabelText('Nome interno')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(novo).toHaveFocus()
  })
})
