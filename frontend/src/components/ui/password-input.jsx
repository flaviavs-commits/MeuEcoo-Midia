import { forwardRef, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Icon } from './icon.jsx'

/*
 * Campo de senha com o botão de mostrar/ocultar dentro da própria borda.
 * Troca só o atributo type do mesmo <input>: o valor, o foco, a posição do
 * cursor e o preenchimento do gerenciador de senhas continuam onde estavam.
 * Visibilidade controlada (visible + onVisibleChange) ou interna.
 */
export const PasswordInput = forwardRef(function PasswordInput({
  visible: controlledVisible,
  onVisibleChange,
  className = '',
  wrapperClassName = '',
  ...inputProps
}, forwardedRef) {
  const [innerVisible, setInnerVisible] = useState(false)
  const visible = controlledVisible ?? innerVisible
  const inputRef = useRef(null)
  const caret = useRef(null)

  const setInput = useCallback(node => {
    inputRef.current = node
    if (typeof forwardedRef === 'function') forwardedRef(node)
    else if (forwardedRef) forwardedRef.current = node
  }, [forwardedRef])

  // Alguns navegadores levam o cursor para o fim ao trocar o type; devolve
  // a seleção que a pessoa tinha antes do clique.
  useLayoutEffect(() => {
    const saved = caret.current
    const input = inputRef.current
    caret.current = null
    if (!saved || !input || document.activeElement !== input) return
    try { input.setSelectionRange(saved.start, saved.end, saved.direction) } catch { /* tipo sem seleção */ }
  }, [visible])

  function toggle() {
    const input = inputRef.current
    if (input && document.activeElement === input) {
      caret.current = { start: input.selectionStart, end: input.selectionEnd, direction: input.selectionDirection }
    }
    const next = !visible
    if (controlledVisible === undefined) setInnerVisible(next)
    onVisibleChange?.(next)
  }

  return <span className={`ds-password${wrapperClassName ? ` ${wrapperClassName}` : ''}`} data-visible={visible ? '' : undefined}>
    <input
      ref={setInput}
      {...inputProps}
      type={visible ? 'text' : 'password'}
      className={`ds-input ds-password__input${className ? ` ${className}` : ''}`}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
    />
    <button
      type="button"
      className="ds-password__toggle"
      aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
      aria-controls={inputProps.id}
      disabled={inputProps.disabled}
      // Clique com mouse ou toque não tira o foco do campo (nem fecha o teclado virtual).
      onMouseDown={event => event.preventDefault()}
      onClick={toggle}
    >
      <Icon name={visible ? 'eyeOff' : 'eye'} size={18} />
    </button>
  </span>
})
