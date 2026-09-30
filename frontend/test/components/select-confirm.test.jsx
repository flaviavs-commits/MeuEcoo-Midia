import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Select } from '../../src/components/ui/select.jsx'
import { useConfirm } from '../../src/components/ui/confirm-dialog.jsx'

const formats = [
  { value: 'post', label: 'Feed (imagem/carrossel)' },
  { value: 'reels', label: 'Reels' },
  { value: 'story', label: 'Story' },
]

function Harness({ onChange = () => {} }) {
  const [value, setValue] = useState('post')
  return <>
    <label htmlFor="fmt">Formato</label>
    <Select id="fmt" value={value} options={formats} onChange={next => { setValue(next); onChange(next) }} />
  </>
}

describe('Select', () => {
  it('opens a listbox with the chosen option checked and picks another by click', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    const trigger = screen.getByRole('combobox', { name: 'Formato' })
    expect(trigger).toHaveTextContent('Feed (imagem/carrossel)')
    fireEvent.click(trigger)

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Feed (imagem/carrossel)' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('option', { name: 'Reels' }))

    expect(onChange).toHaveBeenCalledWith('reels')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveTextContent('Reels')
    expect(trigger).toHaveFocus()
  })

  it('works from the keyboard: arrows move, Enter chooses, Escape closes without changing', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const trigger = screen.getByRole('combobox', { name: 'Formato' })

    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const list = screen.getByRole('listbox')
    await waitFor(() => expect(list).toHaveFocus())
    expect(list).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Feed (imagem/carrossel)' }).id)
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(list).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Story' }).id)
    fireEvent.keyDown(list, { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith('story')

    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('jumps to an option by typing its first letter', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Formato' }), { key: 's' })
    expect(onChange).toHaveBeenCalledWith('story')
  })
})

function ConfirmHarness({ onResult }) {
  const { confirm, confirmDialog } = useConfirm()
  return <>
    <button type="button" onClick={async () => onResult(await confirm({ title: 'Excluir esta ideia?', description: 'Ela sai do Baú de vez.', confirmLabel: 'Excluir', tone: 'danger' }))}>Excluir ideia</button>
    {confirmDialog}
  </>
}

describe('useConfirm', () => {
  it('asks in a DS dialog, with Cancelar focused, and resolves with the choice', async () => {
    const onResult = vi.fn()
    render(<ConfirmHarness onResult={onResult} />)

    fireEvent.click(screen.getByRole('button', { name: 'Excluir ideia' }))
    const dialog = await screen.findByRole('dialog', { name: 'Excluir esta ideia?' })
    expect(dialog).toHaveTextContent('Ela sai do Baú de vez.')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus())

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Excluir' })) })
    expect(onResult).toHaveBeenLastCalledWith(true)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Excluir ideia' }))
    await screen.findByRole('dialog', { name: 'Excluir esta ideia?' })
    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(onResult).toHaveBeenLastCalledWith(false)
  })
})
