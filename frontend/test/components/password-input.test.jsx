import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { PasswordInput } from '../../src/components/ui/password-input.jsx'

function Field(props) {
  return <>
    <label htmlFor="senha">Senha</label>
    <PasswordInput id="senha" name="password" autoComplete="current-password" defaultValue="Senha@123" {...props} />
  </>
}

describe('PasswordInput', () => {
  it('alterna entre oculto e visível no mesmo campo, sem perder o valor', () => {
    render(<Field />)
    const input = screen.getByLabelText('Senha')

    expect(input).toHaveAttribute('type', 'password')
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(screen.getByLabelText('Senha')).toBe(input)
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveValue('Senha@123')

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }))
    expect(input).toHaveAttribute('type', 'password')
  })

  it('clique no botão não tira o foco do campo', () => {
    render(<Field />)
    const input = screen.getByLabelText('Senha')
    input.focus()
    input.setSelectionRange(3, 3)

    const toggle = screen.getByRole('button', { name: 'Mostrar senha' })
    expect(fireEvent.mouseDown(toggle)).toBe(false)
    fireEvent.click(toggle)

    expect(input).toHaveFocus()
    expect(input.selectionStart).toBe(3)
  })

  it('é um botão real, ligado ao campo, e acompanha o campo desativado', () => {
    render(<Field disabled />)
    const toggle = screen.getByRole('button', { name: 'Mostrar senha' })
    expect(toggle).toHaveAttribute('type', 'button')
    expect(toggle).toHaveAttribute('aria-controls', 'senha')
    expect(toggle).toBeDisabled()
  })

  it('mantém os atributos de autocomplete e desliga correção automática', () => {
    render(<Field autoComplete="new-password" />)
    const input = screen.getByLabelText('Senha')
    expect(input).toHaveAttribute('autocomplete', 'new-password')
    expect(input).toHaveAttribute('autocapitalize', 'none')
    expect(input).toHaveAttribute('spellcheck', 'false')
  })

  it('aceita visibilidade controlada e repassa a ref', () => {
    const ref = createRef()
    const onVisibleChange = vi.fn()
    render(<Field ref={ref} visible onVisibleChange={onVisibleChange} />)

    expect(ref.current).toBe(screen.getByLabelText('Senha'))
    expect(ref.current).toHaveAttribute('type', 'text')
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }))
    expect(onVisibleChange).toHaveBeenCalledWith(false)
  })
})
