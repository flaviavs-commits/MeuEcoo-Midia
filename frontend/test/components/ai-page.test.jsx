import { fireEvent, render, screen, within } from '@testing-library/react'
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
})
