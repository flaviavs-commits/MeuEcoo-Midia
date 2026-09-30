import { fireEvent, render, screen, within } from '@testing-library/react'
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
})
