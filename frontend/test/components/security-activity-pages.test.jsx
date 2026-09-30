import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SecurityPage } from '../../src/pages/security-page.jsx'
import { ActivityPage } from '../../src/pages/activity-page.jsx'
import { ToastProvider } from '../../src/components/ui/toast.jsx'
import * as api from '../../src/lib/api.js'

describe('SecurityPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('acompanha o usuário que chega depois e não oferece reconfigurar um 2FA ativo', () => {
    const { rerender } = render(<ToastProvider><SecurityPage user={null} /></ToastProvider>)
    expect(screen.getByRole('button', { name: /Configurar 2FA/ })).toBeInTheDocument()

    rerender(<ToastProvider><SecurityPage user={{ totpEnabled: true }} /></ToastProvider>)
    expect(screen.getByText('2FA ativo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Configurar 2FA/ })).not.toBeInTheDocument()
  })

  it('avisa o app quando o 2FA é desativado', async () => {
    vi.spyOn(api, 'apiFetch').mockResolvedValue({})
    const onUserChange = vi.fn()
    render(<ToastProvider><SecurityPage user={{ totpEnabled: true }} onUserChange={onUserChange} /></ToastProvider>)

    fireEvent.change(screen.getByLabelText('Para desativar, informe um código atual'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Desativar 2FA' }))

    expect(await screen.findByText('2FA desativado')).toBeInTheDocument()
    expect(onUserChange).toHaveBeenCalledWith({ totpEnabled: false })
  })

  it('mostra a falha ao iniciar a configuração uma vez só, no campo', async () => {
    vi.spyOn(api, 'apiFetch').mockRejectedValue(new api.ApiError('Confirme sua senha atual antes de configurar o 2FA.', 403))
    render(<ToastProvider><SecurityPage user={{ totpEnabled: false }} /></ToastProvider>)

    fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: 'senha-errada' } })
    fireEvent.click(screen.getByRole('button', { name: /Configurar 2FA/ }))

    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1))
    expect(screen.getByRole('alert')).toHaveTextContent('Confirme sua senha atual antes de configurar o 2FA.')
  })

  it('oferece abrir no app autenticador e copiar a chave, e foca o resultado ao ativar', async () => {
    const setup = { otpauthUri: 'otpauth://totp/Meu%20Ecoo:a%40b.test?secret=ABC&issuer=Meu%20Ecoo', secret: 'ABCDEF234567', qrCodeDataUrl: 'data:image/png;base64,AAAA' }
    vi.spyOn(api, 'apiFetch').mockImplementation(path => Promise.resolve(path === '/api/me/2fa/setup' ? setup : { ok: true }))
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<ToastProvider><SecurityPage user={{ totpEnabled: false }} /></ToastProvider>)

    fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: 'correta' } })
    fireEvent.click(screen.getByRole('button', { name: /Configurar 2FA/ }))

    expect(await screen.findByRole('link', { name: /Abrir no app autenticador/ })).toHaveAttribute('href', setup.otpauthUri)
    fireEvent.click(screen.getByRole('button', { name: /Copiar chave/ }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('ABCDEF234567'))
    expect(await screen.findByRole('button', { name: /Chave copiada/ })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Código do autenticador'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /Ativar proteção/ }))

    const title = await screen.findByRole('heading', { name: 'Sua conta está protegida' })
    expect(title).toHaveFocus()
  })

  it('deixa o desativar dentro de uma área de gerenciamento', () => {
    render(<ToastProvider><SecurityPage user={{ totpEnabled: true }} /></ToastProvider>)
    const summary = screen.getByText('Gerenciar 2FA').closest('summary')
    expect(summary).not.toBeNull()
    expect(summary.closest('details')).not.toHaveAttribute('open')
    expect(summary.closest('details')).toContainElement(screen.getByRole('button', { name: 'Desativar 2FA' }))
  })
})

describe('ActivityPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('mostra e filtra os avisos de atenção gravados pelo servidor', async () => {
    vi.spyOn(api, 'apiFetch').mockResolvedValue({ logs: [
      { id: 1, type: 'ok', message: 'Post #1 publicado', platform: 'instagram', timestamp: '2026-09-20T10:00:00Z' },
      { id: 2, type: 'warn', message: 'Token instagram exige reconexão manual', platform: 'instagram', timestamp: '2026-09-20T11:00:00Z' },
    ] })
    render(<ToastProvider><ActivityPage /></ToastProvider>)

    await screen.findByText('Post #1 publicado')
    fireEvent.click(within(screen.getByRole('group', { name: 'Filtrar tipo de atividade' })).getByRole('button', { name: /Atenção/ }))

    expect(screen.getByText('Token instagram exige reconexão manual')).toBeInTheDocument()
    expect(screen.queryByText('Post #1 publicado')).not.toBeInTheDocument()
  })

  it('mostra o erro sem fingir que o histórico está vazio', async () => {
    vi.spyOn(api, 'apiFetch').mockRejectedValue(new Error('Servidor indisponível'))
    render(<ToastProvider><ActivityPage /></ToastProvider>)

    expect(await screen.findByText('Servidor indisponível')).toBeInTheDocument()
    expect(screen.queryByText('Nenhuma atividade registrada ainda.')).not.toBeInTheDocument()
  })

  it('não trata a falha ao limpar como falha de carga e mantém a lista', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation((path, options) => options?.method === 'DELETE'
      ? Promise.reject(new api.ApiError('Não foi possível limpar agora.', 500))
      : Promise.resolve({ logs: [{ id: 1, type: 'ok', message: 'Post #1 publicado', timestamp: '2026-09-20T10:00:00Z' }] }))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ToastProvider><ActivityPage /></ToastProvider>)
    await screen.findByText('Post #1 publicado')

    fireEvent.click(screen.getByRole('button', { name: 'Mais ações do histórico' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /Limpar histórico/ }))

    expect(await screen.findByText('Não foi possível limpar agora.')).toBeInTheDocument()
    expect(screen.queryByText('Não foi possível carregar o histórico')).not.toBeInTheDocument()
    expect(screen.getByText('Post #1 publicado')).toBeInTheDocument()
  })

  it('no celular filtra pela folha de filtros, com o mesmo estado da barra', async () => {
    const original = window.matchMedia
    window.matchMedia = query => ({ matches: query === '(max-width: 767px)', media: query, addEventListener() {}, removeEventListener() {} })
    try {
      vi.spyOn(api, 'apiFetch').mockResolvedValue({ logs: [
        { id: 1, type: 'ok', message: 'Post #1 publicado', timestamp: '2026-09-20T10:00:00Z' },
        { id: 2, type: 'err', message: 'Falha ao publicar no TikTok', timestamp: '2026-09-20T11:00:00Z' },
      ] })
      render(<ToastProvider><ActivityPage /></ToastProvider>)
      await screen.findByText('Post #1 publicado')
      expect(screen.queryByRole('group', { name: 'Filtrar tipo de atividade' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
      const sheet = await screen.findByRole('dialog', { name: 'Filtrar atividades' })
      fireEvent.click(within(sheet).getByRole('radio', { name: /Erros/ }))
      fireEvent.click(within(sheet).getByRole('button', { name: 'Aplicar filtros' }))

      await waitFor(() => expect(screen.queryByText('Post #1 publicado')).not.toBeInTheDocument())
      expect(screen.getByText('Falha ao publicar no TikTok')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Filtros, 1 ativo' })).toBeInTheDocument()
    } finally {
      window.matchMedia = original
    }
  })

  it('abre a mensagem inteira quando ela foi cortada em três linhas', async () => {
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function () { return this.classList.contains('atv-item__msg') ? 120 : 0 })
    const client = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function () { return this.classList.contains('atv-item__msg') ? 63 : 0 })
    vi.spyOn(api, 'apiFetch').mockResolvedValue({ logs: [{ id: 1, type: 'err', message: 'Falha longa '.repeat(30), timestamp: '2026-09-20T10:00:00Z' }] })
    render(<ToastProvider><ActivityPage /></ToastProvider>)

    const toggle = await screen.findByRole('button', { expanded: false, name: /Falha longa/ })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveTextContent('Ver menos')
    scroll.mockRestore()
    client.mockRestore()
  })
})
