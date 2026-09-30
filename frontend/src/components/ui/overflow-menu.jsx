import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from './icon.jsx'

// "…" button that groups secondary and destructive actions of one item.
export function OverflowMenu({ label, items, size = 'sm' }) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return undefined
    menuRef.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus()
    const handlePointer = event => {
      if (anchorRef.current && !anchorRef.current.contains(event.target)) setOpen(false)
    }
    const handleKey = event => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  function handleMenuKey(event) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const options = [...menuRef.current.querySelectorAll('[role="menuitem"]:not([disabled])')]
    const index = options.indexOf(document.activeElement)
    let next = 0
    if (event.key === 'ArrowDown') next = (index + 1) % options.length
    if (event.key === 'ArrowUp') next = (index - 1 + options.length) % options.length
    if (event.key === 'End') next = options.length - 1
    options[next]?.focus()
  }

  function handleBlur(event) {
    if (open && !anchorRef.current?.contains(event.relatedTarget)) setOpen(false)
  }

  function choose(item) {
    setOpen(false)
    // Focus returns to the trigger first; a dialog opened by onSelect can still take it.
    triggerRef.current?.focus()
    item.onSelect()
  }

  return <span className="ds-menuanchor" ref={anchorRef} onBlur={handleBlur}>
    <button
      type="button"
      ref={triggerRef}
      className={`ds-btn ds-btn--quiet ds-btn--icon${size === 'sm' ? ' ds-btn--sm' : ''}`}
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      onClick={() => setOpen(current => !current)}
    >
      <Icon name="dots" />
    </button>
    {open && <div className="ds-popover ds-menu" role="menu" id={menuId} aria-label={label} ref={menuRef} onKeyDown={handleMenuKey}>
      {items.map(item => <button
        key={item.label}
        type="button"
        role="menuitem"
        className={`ds-menu__item${item.danger ? ' ds-menu__item--danger' : ''}`}
        disabled={item.disabled}
        onClick={() => choose(item)}
      >
        {item.icon && <Icon name={item.icon} />}{item.label}
      </button>)}
    </div>}
  </span>
}
