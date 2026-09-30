import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Icon } from './icon.jsx'
import { Popover, Sheet } from './floating.jsx'
import { useIsPhone } from '../../lib/breakpoints.js'

/*
 * DS select: replaces the browser's <select>. The trigger is a combobox button; the options
 * open in an anchored listbox (a sheet on phones) with the chosen one checked.
 * Keyboard: ↑/↓/Home/End move, Enter/Space choose, Esc closes, letters jump to a match.
 * options: [{ value, label, hint?, icon?, disabled? }]; values are compared as strings.
 */
export function Select({
  value, onChange, options, id, placeholder = 'Selecione', disabled = false, className = '', size = 'md',
  sheetTitle, name, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, 'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [width, setWidth] = useState(0)
  const triggerRef = useRef(null)
  const listRef = useRef(null)
  const typed = useRef({ text: '', at: 0 })
  const phone = useIsPhone()
  const listId = useId()
  const optionId = index => `${listId}-o${index}`
  const current = options.findIndex(option => String(option.value) === String(value))
  const selected = options[current]

  function firstEnabled(from, step) {
    for (let index = from; index >= 0 && index < options.length; index += step) {
      if (!options[index].disabled) return index
    }
    return -1
  }

  function openList(start = current) {
    if (disabled) return
    setActive(start >= 0 && !options[start]?.disabled ? start : firstEnabled(0, 1))
    setWidth(triggerRef.current?.getBoundingClientRect().width || 0)
    setOpen(true)
  }

  function close(returnFocus = true) {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true })
  }

  function choose(index) {
    const option = options[index]
    if (!option || option.disabled) return
    close()
    if (String(option.value) !== String(value)) onChange?.(option.value)
  }

  // Typing jumps to the next option that starts with the typed text (letters typed quickly add up).
  function jumpTo(letter, from) {
    const now = Date.now()
    typed.current = { text: now - typed.current.at < 600 ? typed.current.text + letter : letter, at: now }
    const query = typed.current.text.toLowerCase()
    const startAt = typed.current.text.length > 1 ? Math.max(from, 0) : from + 1
    for (let step = 0; step < options.length; step += 1) {
      const index = (((startAt + step) % options.length) + options.length) % options.length
      if (!options[index].disabled && String(options[index].label).toLowerCase().startsWith(query)) return index
    }
    return -1
  }

  function onTriggerKeyDown(event) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      openList(event.key === 'ArrowUp' && current < 0 ? firstEnabled(options.length - 1, -1) : current)
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      const match = jumpTo(event.key, current)
      if (match >= 0 && String(options[match].value) !== String(value)) onChange?.(options[match].value)
    }
  }

  function onListKeyDown(event) {
    const moves = {
      ArrowDown: () => firstEnabled(active + 1, 1),
      ArrowUp: () => firstEnabled(active - 1, -1),
      Home: () => firstEnabled(0, 1),
      End: () => firstEnabled(options.length - 1, -1),
    }
    if (moves[event.key]) {
      event.preventDefault()
      const next = moves[event.key]()
      if (next >= 0) setActive(next)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      choose(active)
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      const match = jumpTo(event.key, active)
      if (match >= 0) setActive(match)
    }
  }

  // Focus stays on the listbox; the active option is announced and kept in view.
  useEffect(() => {
    if (!open || active < 0) return
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active])

  useLayoutEffect(() => {
    if (open && phone) listRef.current?.focus({ preventScroll: true })
  }, [open, phone])

  const list = <div
    ref={listRef}
    id={listId}
    role="listbox"
    tabIndex={0}
    data-autofocus
    aria-label={sheetTitle || ariaLabel}
    aria-labelledby={sheetTitle || ariaLabel ? undefined : ariaLabelledBy}
    aria-activedescendant={active >= 0 ? optionId(active) : undefined}
    className={`ds-listbox${phone ? ' ds-listbox--sheet' : ''}`}
    style={phone ? undefined : { minWidth: width || undefined }}
    onKeyDown={onListKeyDown}
  >
    {options.map((option, index) => {
      const isSelected = index === current
      return <div
        key={String(option.value)}
        id={optionId(index)}
        role="option"
        aria-selected={isSelected}
        aria-disabled={option.disabled || undefined}
        data-active={index === active || undefined}
        className="ds-listbox__option"
        onMouseMove={() => { if (!option.disabled && index !== active) setActive(index) }}
        onClick={() => choose(index)}
      >
        {option.icon && <span className="ds-listbox__icon" aria-hidden="true">{option.icon}</span>}
        <span className="ds-listbox__text">
          <span className="ds-listbox__label">{option.label}</span>
          {option.hint && <span className="ds-listbox__hint">{option.hint}</span>}
        </span>
        <Icon name="check" size={16} className="ds-listbox__check" />
      </div>
    })}
  </div>

  return <>
    <button
      ref={triggerRef}
      type="button"
      id={id}
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      disabled={disabled}
      className={`ds-selectx ds-selectx--${size} ${className}`.trim()}
      onClick={() => (open ? close(false) : openList())}
      onKeyDown={onTriggerKeyDown}
    >
      {selected?.icon && <span className="ds-selectx__icon" aria-hidden="true">{selected.icon}</span>}
      <span className={`ds-selectx__value${selected ? '' : ' ds-selectx__value--empty'}`}>{selected ? selected.label : placeholder}</span>
      <Icon name="chevronDown" size={16} className="ds-selectx__chev" />
    </button>
    {name && <input type="hidden" name={name} value={value ?? ''} />}
    {phone
      ? <Sheet open={open} onClose={() => setOpen(false)} title={sheetTitle || ariaLabel || 'Escolha uma opção'} size="sm" className="ds-selectsheet">{list}</Sheet>
      : <Popover open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} role="presentation" placement="bottom-start" className="ds-selectpop" gap={4}>{list}</Popover>}
  </>
}
