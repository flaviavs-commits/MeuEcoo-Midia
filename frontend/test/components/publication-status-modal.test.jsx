import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { PublicationStatusModal } from '../../src/components/ui/publication-status-modal.jsx'

describe('PublicationStatusModal', () => {
  it('shows the scheduled confirmation in the publication modal', () => {
    const onClose = vi.fn()

    render(<PublicationStatusModal
      status={{ type: 'scheduled', date: 'quarta-feira, 2 de setembro de 2026 às 15:50', platformList: ['Instagram'] }}
      platforms={['instagram']}
      onClose={onClose}
    />)

    expect(screen.getByRole('dialog', { name: 'Seu post está na agenda' })).toBeInTheDocument()
    expect(screen.getByText('TUDO CERTO!')).toBeInTheDocument()
    expect(screen.getByText(/Ele será publicado em/)).toBeInTheDocument()
    expect(screen.getByText('quarta-feira, 2 de setembro de 2026 às 15:50')).toBeInTheDocument()
    expect(screen.getByText('Redes selecionadas')).toBeInTheDocument()
    expect(screen.getByText('✓ Instagram')).toBeInTheDocument()
    expect(screen.getByText('Você pode acompanhar ou editar esse agendamento no calendário.')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar confirmação' })[1])
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('PublicationStatusModal — foco', () => {
  function Harness() {
    const [open, setOpen] = useState(false)
    return <>
      <button type="button" onClick={() => setOpen(true)}>Agendar</button>
      {open && <PublicationStatusModal status={{ type: 'scheduled', date: 'amanhã às 10:00', platformList: ['Instagram'] }} platforms={['instagram']} onClose={() => setOpen(false)} />}
    </>
  }

  it('returns focus to the control that opened it and keeps Tab inside', () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Agendar' })
    trigger.focus()
    fireEvent.click(trigger)

    const [closeIcon, closeFooter] = screen.getAllByRole('button', { name: 'Fechar confirmação' })
    expect(closeIcon).toHaveFocus()
    closeFooter.focus()
    fireEvent.keyDown(closeFooter, { key: 'Tab' })
    expect(closeIcon).toHaveFocus()

    fireEvent.click(closeFooter)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})

describe('PublicationStatusModal — processamento longo', () => {
  afterEach(() => vi.useRealTimers())

  it('no começo não tem saída; depois de um tempo deixa continuar em segundo plano (botão e Esc)', async () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<PublicationStatusModal status={{ type: 'processing', message: 'Publicando no Instagram' }} platforms={['instagram']} onClose={onClose} />)

    expect(screen.queryByRole('button', { name: 'Continuar em segundo plano' })).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()

    await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar em segundo plano' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
