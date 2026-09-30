import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ContentQueuesPage } from '../../src/pages/content-queues-page.jsx'
import { ToastProvider } from '../../src/components/ui/toast.jsx'
import * as api from '../../src/lib/api.js'

const QUEUE = {
  id: 9, name: 'Dicas da semana', active: true, platforms: ['facebook'],
  content: { text: 'Uma dica por semana' }, recurrence: { days: [1, 3], time: '10:00' }, nextRunAt: '2026-10-05T13:00:00.000Z',
}
const PAUSED = { ...QUEUE, id: 10, name: 'Bastidores', active: false, nextRunAt: null }

function mockApi({ queues = [], post, patch, getError } = {}) {
  return vi.spyOn(api, 'apiFetch').mockImplementation((path, options = {}) => {
    if (path === '/api/content-queues' && options.method === 'POST') return post ? post(JSON.parse(options.body)) : Promise.resolve({ id: 99 })
    if (path.startsWith('/api/content-queues/') && options.method === 'PATCH') return patch ? patch(JSON.parse(options.body)) : Promise.resolve({})
    if (path === '/api/content-queues') return getError ? getError() : Promise.resolve({ queues })
    return Promise.reject(new Error(`rota não mockada: ${path}`))
  })
}

async function fillFacebookRoutine() {
  fireEvent.change(await screen.findByLabelText('Nome da rotina'), { target: { value: 'Promo de sexta' } })
  fireEvent.change(screen.getByLabelText('Texto da publicação'), { target: { value: 'Passe na loja!' } })
  const redes = screen.getByRole('group', { name: 'Redes da rotina' })
  fireEvent.click(within(redes).getByRole('button', { name: /Instagram/ }))
  fireEvent.click(within(redes).getByRole('button', { name: /Facebook/ }))
}

describe('ContentQueuesPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('envia o horário do seletor exatamente como HH:mm', async () => {
    const bodies = []
    mockApi({ post: body => { bodies.push(body); return Promise.resolve({ id: 99 }) } })
    render(<ToastProvider><ContentQueuesPage /></ToastProvider>)

    await fillFacebookRoutine()
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '14' } })
    fireEvent.change(screen.getByLabelText('Minuto'), { target: { value: '35' } })
    expect(screen.getByRole('status')).toHaveTextContent('às 14:35')
    fireEvent.click(screen.getByRole('button', { name: 'Criar rotina' }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({ name: 'Promo de sexta', platforms: ['facebook'], recurrence: { days: [1, 3, 5], time: '14:35' } })
  })

  it('não cria a rotina duas vezes com dois cliques seguidos', async () => {
    const apiFetch = mockApi({ post: () => new Promise(() => {}) })
    render(<ToastProvider><ContentQueuesPage /></ToastProvider>)

    await fillFacebookRoutine()
    const criar = screen.getByRole('button', { name: 'Criar rotina' })
    fireEvent.click(criar)
    fireEvent.click(criar)

    await waitFor(() => expect(screen.getByRole('button', { name: /Criando rotina/ })).toBeDisabled())
    expect(apiFetch.mock.calls.filter(([path, options]) => path === '/api/content-queues' && options?.method === 'POST')).toHaveLength(1)
  })

  it('mostra a falha de carga em vez de "nenhuma rotina criada"', async () => {
    let falhar = true
    mockApi({ getError: () => falhar ? Promise.reject(new api.ApiError('Serviço indisponível.', 503)) : Promise.resolve({ queues: [QUEUE] }) })
    render(<ToastProvider><ContentQueuesPage /></ToastProvider>)

    expect(await screen.findByText('Não foi possível carregar suas rotinas')).toBeInTheDocument()
    expect(screen.queryByText('Nenhuma rotina criada ainda')).not.toBeInTheDocument()

    falhar = false
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('heading', { level: 3, name: 'Dicas da semana' })).toBeInTheDocument()
  })

  it('pausa pela confirmação do servidor e não dispara duas vezes', async () => {
    const patches = []
    let resolvePatch
    mockApi({ queues: [QUEUE, PAUSED], patch: body => { patches.push(body); return new Promise(resolve => { resolvePatch = resolve }) } })
    render(<ToastProvider><ContentQueuesPage /></ToastProvider>)

    const pausar = await screen.findByRole('button', { name: 'Pausar rotina' })
    fireEvent.click(pausar)
    fireEvent.click(pausar)
    expect(screen.getByRole('button', { name: 'Ativar rotina' })).toBeDisabled()

    expect(patches).toEqual([{ active: false, recurrence: QUEUE.recurrence }])
    resolvePatch({})
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ativar rotina' })).not.toBeDisabled())
  })

  it('no celular filtra a situação pela folha de filtros', async () => {
    const original = window.matchMedia
    window.matchMedia = query => ({ matches: query === '(max-width: 767px)', media: query, addEventListener() {}, removeEventListener() {} })
    try {
      mockApi({ queues: [QUEUE, PAUSED] })
      render(<ToastProvider><ContentQueuesPage /></ToastProvider>)
      await screen.findByRole('heading', { level: 3, name: 'Bastidores' })
      expect(screen.queryByRole('group', { name: 'Filtrar rotinas' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
      const sheet = await screen.findByRole('dialog', { name: 'Filtrar rotinas' })
      fireEvent.click(within(sheet).getByRole('radio', { name: /Pausadas/ }))
      fireEvent.click(within(sheet).getByRole('button', { name: 'Aplicar filtros' }))

      await waitFor(() => expect(screen.queryByRole('heading', { level: 3, name: 'Dicas da semana' })).not.toBeInTheDocument())
      expect(screen.getByRole('heading', { level: 3, name: 'Bastidores' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Filtros, 1 ativo' })).toBeInTheDocument()
    } finally {
      window.matchMedia = original
    }
  })
})
