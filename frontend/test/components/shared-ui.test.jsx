import { useRef, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { ToastProvider, useToast } from '../../src/components/ui/toast.jsx'
import { PlanGate } from '../../src/components/ui/plan-gate.jsx'
import { OverflowMenu } from '../../src/components/ui/overflow-menu.jsx'
import { Popover, Sheet } from '../../src/components/ui/floating.jsx'

function NotifyButton({ message, type }) {
  const notify = useToast()
  return <button type="button" onClick={() => notify(message, type)}>Avisar</button>
}

describe('Toast', () => {
  it('anuncia sucesso como status e fecha pelo botão', () => {
    render(<ToastProvider><NotifyButton message="Perfil salvo." /></ToastProvider>)

    fireEvent.click(screen.getByRole('button', { name: 'Avisar' }))
    expect(screen.getByRole('status')).toHaveTextContent('Perfil salvo.')

    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }))
    expect(screen.queryByText('Perfil salvo.')).not.toBeInTheDocument()
  })

  it('anuncia erro como alerta', () => {
    render(<ToastProvider><NotifyButton message="Falhou." type="error" /></ToastProvider>)

    fireEvent.click(screen.getByRole('button', { name: 'Avisar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Falhou.')
  })
})

describe('PlanGate', () => {
  it('leva ao perfil para escolher o plano quando o pagamento está pendente', () => {
    render(<PlanGate currentPlan="basico" moduleName="ai" planActive={false} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Escolha um plano para começar' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Escolher plano' })).toHaveAttribute('href', '/app/perfil')
  })

  it('explica o upgrade quando o plano atual não inclui o módulo', () => {
    render(<PlanGate currentPlan="basico" moduleName="smartlinks" planActive />)

    expect(screen.getByRole('heading', { level: 1, name: 'Smartlinks' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Conhecer os planos' })).toHaveAttribute('href', '/app/perfil')
  })
})

describe('OverflowMenu', () => {
  function renderMenu(onSelect = vi.fn()) {
    render(<div>
      <OverflowMenu label="Mais ações para Loja" items={[{ label: 'Editar', icon: 'compose', onSelect }, { label: 'Excluir', icon: 'trash', danger: true, onSelect: vi.fn() }]} />
      <button type="button">Fora</button>
    </div>)
    return { trigger: screen.getByRole('button', { name: 'Mais ações para Loja' }), onSelect }
  }

  it('abre com foco na primeira opção e fecha com Escape devolvendo o foco', () => {
    const { trigger } = renderMenu()
    fireEvent.click(trigger)
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('devolve o foco ao botão depois de escolher uma opção', () => {
    const { trigger, onSelect } = renderMenu()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('fecha quando o foco sai do menu', () => {
    const { trigger } = renderMenu()
    fireEvent.click(trigger)
    fireEvent.blur(screen.getByRole('menuitem', { name: 'Editar' }), { relatedTarget: screen.getByRole('button', { name: 'Fora' }) })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('Popover dentro de uma folha', () => {
  function EditDialog() {
    const [sheetOpen, setSheetOpen] = useState(true)
    const [pickerOpen, setPickerOpen] = useState(false)
    const anchorRef = useRef(null)
    return <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Editar publicação">
      <button type="button" ref={anchorRef} onClick={() => setPickerOpen(true)}>Escolher data</button>
      <Popover open={pickerOpen} anchorRef={anchorRef} onClose={() => setPickerOpen(false)} ariaLabel="Calendário">
        <button type="button">Hoje</button>
        <button type="button">Concluir</button>
      </Popover>
    </Sheet>
  }

  it('um Escape fecha só a camada de cima', () => {
    render(<EditDialog />)
    fireEvent.click(screen.getByRole('button', { name: 'Escolher data' }))
    expect(screen.getByRole('dialog', { name: 'Calendário' })).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('button', { name: 'Hoje' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Calendário' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Editar publicação' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Escolher data' })).toHaveFocus()

    fireEvent.keyDown(screen.getByRole('button', { name: 'Escolher data' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Editar publicação' })).not.toBeInTheDocument()
  })

  it('Tab depois do último item fecha o popover e volta ao botão que o abriu', () => {
    render(<EditDialog />)
    fireEvent.click(screen.getByRole('button', { name: 'Escolher data' }))
    const last = screen.getByRole('button', { name: 'Concluir' })
    last.focus()

    fireEvent.keyDown(last, { key: 'Tab' })
    expect(screen.queryByRole('dialog', { name: 'Calendário' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Escolher data' })).toHaveFocus()
    expect(screen.getByRole('dialog', { name: 'Editar publicação' })).toBeInTheDocument()
  })
})
