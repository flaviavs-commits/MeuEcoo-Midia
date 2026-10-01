import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AiAssistantWidget } from '../../src/components/ai/ai-assistant-widget.jsx'
import * as api from '../../src/lib/api.js'

describe('AiAssistantWidget', () => {
  afterEach(() => vi.restoreAllMocks())

  it('starts closed and does not render the panel', () => {
    render(<AiAssistantWidget />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir assistente inteligente' })).toBeInTheDocument()
  })

  it('renders nothing at all when hidden (e.g. on the AI page itself)', () => {
    const { container } = render(<AiAssistantWidget hidden />)
    expect(container.firstChild).toBeNull()
  })

  it('opens the chat panel on click and closes on Escape', () => {
    render(<AiAssistantWidget />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir assistente inteligente' }))
    expect(screen.getByRole('dialog', { name: 'Assistente inteligente' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sends a message to the operational agent, shows the reply, and persists both turns', async () => {
    const apiFetchMock = vi.spyOn(api, 'apiFetch').mockImplementation((path, options = {}) => {
      if (path === '/api/ai/agent') return Promise.resolve({ message: 'Ideia gerada pelo sistema inteligente' })
      if (path === '/api/ai/chat-messages') return Promise.resolve({ ok: true })
      return Promise.reject(new Error(`unexpected call to ${path}`))
    })

    render(<AiAssistantWidget />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir assistente inteligente' }))
    fireEvent.change(screen.getByLabelText('Mensagem para o Assistente inteligente'), { target: { value: 'crie um post de lançamento' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    expect(screen.getByText('crie um post de lançamento')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Ideia gerada pelo sistema inteligente')).toBeInTheDocument())

    const chatMessageCalls = apiFetchMock.mock.calls.filter(([path]) => path === '/api/ai/chat-messages')
    expect(chatMessageCalls).toHaveLength(2)
  })

  it('renders an image returned by the agent', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/ai/agent') return Promise.resolve({ message: 'Imagem criada', data: { image: 'data:image/png;base64,abc', modelo: 'modelo-teste' } })
      return Promise.resolve({ ok: true })
    })

    render(<AiAssistantWidget />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir assistente inteligente' }))
    fireEvent.change(screen.getByLabelText('Mensagem para o Assistente inteligente'), { target: { value: 'crie uma imagem' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(screen.getByAltText('Imagem criada pelo sistema inteligente')).toHaveAttribute('src', 'data:image/png;base64,abc'))
  })

  it('encaminha a imagem gerada para o Meu Post', async () => {
    const onNavigate = vi.fn()
    const postDraft = { image: 'data:image/png;base64,abc', text: 'Legenda sugerida' }
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/ai/agent') return Promise.resolve({ message: 'Imagem criada', data: { image: postDraft.image, postDraft } })
      return Promise.resolve({ ok: true })
    })

    render(<AiAssistantWidget onNavigate={onNavigate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir assistente inteligente' }))
    fireEvent.change(screen.getByLabelText('Mensagem para o Assistente inteligente'), { target: { value: 'crie uma imagem para meu post' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    const continueButton = await screen.findByRole('button', { name: 'Usar no Meu Post' })
    fireEvent.click(continueButton)
    expect(onNavigate).toHaveBeenCalledWith('agendador')
    expect(JSON.parse(sessionStorage.getItem('meu-ecoo:ai-post-draft'))).toMatchObject(postDraft)
    sessionStorage.removeItem('meu-ecoo:ai-post-draft')
    window.__socialAiPostDraft = null
  })

  it('does not expose the selected model in the agent interface', () => {
    render(<AiAssistantWidget />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir assistente inteligente' }))
    expect(screen.queryByRole('combobox', { name: 'Modelo do sistema' })).not.toBeInTheDocument()
  })

  it('shows an error message if the agent fails, without crashing the widget', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/ai/agent') return Promise.reject(new Error('Falha ao interpretar pedido'))
      return Promise.resolve({ ok: true })
    })

    render(<AiAssistantWidget />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir assistente inteligente' }))
    fireEvent.change(screen.getByLabelText('Mensagem para o Assistente inteligente'), { target: { value: 'oi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Falha ao interpretar pedido'))
  })

  it('usa timeout estendido e explica amigavelmente quando o sistema inteligente demora', async () => {
    const apiFetchMock = vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/ai/agent') return Promise.reject(Object.assign(new Error('Tempo esgotado'), { status: 408 }))
      return Promise.resolve({ ok: true })
    })

    render(<AiAssistantWidget />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir assistente inteligente' }))
    fireEvent.change(screen.getByLabelText('Mensagem para o Assistente inteligente'), { target: { value: 'crie uma imagem' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('O sistema inteligente está levando mais tempo que o esperado'))
    const agentCall = apiFetchMock.mock.calls.find(([path]) => path === '/api/ai/agent')
    expect(agentCall[1]).toEqual(expect.objectContaining({ timeoutMs: 120000 }))
  })

  it('leva o foco para o campo ao abrir e devolve ao botão ao fechar com Escape', () => {
    render(<AiAssistantWidget />)
    const toggle = screen.getByRole('button', { name: 'Abrir assistente inteligente' })
    fireEvent.click(toggle)
    expect(screen.getByLabelText('Mensagem para o Assistente inteligente')).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir assistente inteligente' })).toHaveFocus()
  })

  describe('no celular', () => {
    let original
    beforeEach(() => {
      original = window.matchMedia
      window.matchMedia = query => ({ matches: query === '(max-width: 767px)' || query === '(max-width: 1023px)', media: query, addEventListener() {}, removeEventListener() {} })
    })
    afterEach(() => { window.matchMedia = original })

    it('abre como folha modal e devolve o foco ao botão ao fechar', async () => {
      render(<AiAssistantWidget />)
      const toggle = screen.getByRole('button', { name: 'Abrir assistente inteligente' })
      toggle.focus()
      fireEvent.click(toggle)

      const sheet = await screen.findByRole('dialog', { name: 'Assistente inteligente' })
      expect(sheet).toHaveAttribute('aria-modal', 'true')
      expect(sheet).toContainElement(screen.getByLabelText('Mensagem para o Assistente inteligente'))

      fireEvent.click(screen.getByRole('button', { name: 'Fechar assistente' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(screen.getByRole('button', { name: 'Abrir assistente inteligente' })).toHaveFocus()
    })

    it('recolhe o botão enquanto um campo da página está em foco', () => {
      const { container } = render(<><input aria-label="Campo da página" /><AiAssistantWidget /></>)
      const widget = container.querySelector('.aiw')
      expect(widget).not.toHaveAttribute('data-away')

      fireEvent.focusIn(screen.getByLabelText('Campo da página'))
      expect(widget).toHaveAttribute('data-away', 'true')

      fireEvent.focusOut(screen.getByLabelText('Campo da página'), { relatedTarget: document.body })
      expect(widget).not.toHaveAttribute('data-away')
    })
  })

  it('does not submit an empty or whitespace-only message', () => {
    const apiFetchMock = vi.spyOn(api, 'apiFetch')
    render(<AiAssistantWidget />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir assistente inteligente' }))
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Mensagem para o Assistente inteligente'), { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled()
    expect(apiFetchMock.mock.calls.some(([path]) => path === '/api/ai/agent')).toBe(false)
  })

  it('na conversa comum não leva ao Assistente; pedidos de página navegam (e "tokens" vira Contas)', async () => {
    const replies = [
      { message: 'Claro, posso ajudar.', navigation: 'ai' },
      { message: 'Calendário aberto.', navigation: 'calendario' },
      { message: 'Tokens.', navigation: 'tokens' },
    ]
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/ai/agent') return Promise.resolve(replies.shift())
      return Promise.resolve({ ok: true })
    })
    const onNavigate = vi.fn()
    render(<AiAssistantWidget onNavigate={onNavigate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir assistente inteligente' }))
    const send = async (text, reply) => {
      fireEvent.change(screen.getByLabelText('Mensagem para o Assistente inteligente'), { target: { value: text } })
      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
      await screen.findByText(reply)
    }

    await send('oi', 'Claro, posso ajudar.')
    expect(onNavigate).not.toHaveBeenCalled()
    await send('abre o calendário', 'Calendário aberto.')
    expect(onNavigate).toHaveBeenLastCalledWith('calendario')
    await send('meus tokens', 'Tokens.')
    expect(onNavigate).toHaveBeenLastCalledWith('integracoes')
  })
})

