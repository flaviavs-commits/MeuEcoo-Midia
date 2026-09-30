import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AiPage } from '../../src/pages/ai-page.jsx'
import { ToastProvider } from '../../src/components/ui/toast.jsx'
import * as api from '../../src/lib/api.js'

function mockApi() {
  return vi.spyOn(api, 'apiFetch').mockImplementation(path => {
    if (path.startsWith('/api/ai/activity-log')) return Promise.resolve({ logs: [
      { id: 1, acao: 'generate', detalhes: '3 post(s)', status: 'sucesso', criadoEm: '2026-09-20T10:00:00Z' },
      { id: 2, acao: 'image-generate', detalhes: 'Limite atingido', status: 'erro', criadoEm: '2026-09-21T10:00:00Z' },
    ] })
    if (path.startsWith('/api/accounts')) return Promise.resolve({ data: [] })
    return Promise.resolve({})
  })
}

describe('AiPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('mostra o status da atividade em linguagem clara', async () => {
    mockApi()
    render(<ToastProvider><AiPage /></ToastProvider>)

    fireEvent.click(screen.getByRole('tab', { name: /Atividade/ }))
    const list = await screen.findByRole('list')
    expect(within(list).getByText('Concluído')).toBeInTheDocument()
    expect(within(list).getByText('Falhou')).toBeInTheDocument()
    expect(within(list).queryByText('sucesso')).not.toBeInTheDocument()
  })

  it('pede a instrução antes de chamar o gerador', async () => {
    const apiFetchMock = mockApi()
    render(<ToastProvider><AiPage /></ToastProvider>)

    fireEvent.click(screen.getByRole('button', { name: 'Gerar ideias' }))

    expect(await screen.findByText('Descreva o que você quer publicar para receber as ideias.')).toBeInTheDocument()
    expect(screen.getByLabelText('O que você quer publicar?')).toHaveAttribute('aria-invalid', 'true')
    expect(apiFetchMock.mock.calls.some(([path]) => path === '/api/ai/generate')).toBe(false)
  })

  function mockWithIdeas() {
    const base = mockApi().getMockImplementation()
    return vi.spyOn(api, 'apiFetch').mockImplementation((path, options) => path === '/api/ai/generate'
      ? Promise.resolve({ posts: [{ texto: 'Primeira ideia', plataformas: ['instagram'] }, { texto: 'Segunda ideia', plataformas: ['instagram'] }] })
      : base(path, options))
  }

  it('leva o foco até as sugestões depois de gerar', async () => {
    mockWithIdeas()
    render(<ToastProvider><AiPage /></ToastProvider>)

    fireEvent.change(screen.getByLabelText('O que você quer publicar?'), { target: { value: 'ideias para a cafeteria' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gerar ideias' }))

    await screen.findByText('Primeira ideia')
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: /Sugestões/ })).toHaveFocus())
  })

  it('escolhe a rede numa folha modal que fecha no Escape e devolve o foco', async () => {
    mockWithIdeas()
    render(<ToastProvider><AiPage /></ToastProvider>)
    fireEvent.change(screen.getByLabelText('O que você quer publicar?'), { target: { value: 'ideias para a cafeteria' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gerar ideias' }))
    await screen.findByText('Primeira ideia')

    const publish = screen.getAllByRole('button', { name: /Gerar imagem e publicar/ })[0]
    publish.focus()
    fireEvent.click(publish)
    const sheet = await screen.findByRole('dialog', { name: 'Escolha a rede social' })
    expect(sheet).toHaveAttribute('aria-modal', 'true')
    expect(within(sheet).getByRole('radiogroup', { name: 'Rede social para publicação' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Escolha a rede social' })).not.toBeInTheDocument())
    expect(publish).toHaveFocus()
  })

  it('não limpa a atividade duas vezes enquanto a primeira limpeza está em andamento', async () => {
    const base = mockApi().getMockImplementation()
    const apiFetch = vi.spyOn(api, 'apiFetch').mockImplementation((path, options) => options?.method === 'DELETE' ? new Promise(() => {}) : base(path, options))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ToastProvider><AiPage /></ToastProvider>)
    fireEvent.click(screen.getByRole('tab', { name: /Atividade/ }))
    await screen.findByText('Concluído')

    const clear = screen.getByRole('button', { name: /Limpar histórico/ })
    fireEvent.click(clear)
    fireEvent.click(clear)

    await waitFor(() => expect(screen.getByRole('button', { name: /Limpando/ })).toBeDisabled())
    expect(apiFetch.mock.calls.filter(([, options]) => options?.method === 'DELETE')).toHaveLength(1)
    expect(window.confirm).toHaveBeenCalledTimes(1)
  })
})
