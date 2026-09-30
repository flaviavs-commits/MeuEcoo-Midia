import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
})
