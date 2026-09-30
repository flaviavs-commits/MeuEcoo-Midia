import { useId, useRef, useState } from 'react'
import { Icon } from './icon.jsx'
import { Popover, Sheet, moveMenuFocus as moveFocus } from './floating.jsx'
import { useIsPhone } from '../../lib/breakpoints.js'

// "…" button that groups secondary and destructive actions of one item:
// an anchored menu with a pointer, an action sheet on phones.
export function OverflowMenu({ label, items, size = 'sm', icon = 'dots', sheetTitle }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const menuId = useId()
  const phone = useIsPhone()
  const close = () => setOpen(false)

  function choose(item) {
    setOpen(false)
    // Focus returns to the trigger first; a dialog opened by onSelect can still take it.
    triggerRef.current?.focus()
    item.onSelect()
  }

  // A destructive action sits after a divider, apart from the everyday ones.
  const options = items.flatMap((item, index) => {
    const button = <button
      key={item.label}
      type="button"
      role="menuitem"
      className={`ds-menu__item${item.danger ? ' ds-menu__item--danger' : ''}`}
      disabled={item.disabled}
      onClick={() => choose(item)}
    >
      {item.icon && <Icon name={item.icon} />}{item.label}
    </button>
    const divide = item.danger && index > 0 && !items[index - 1].danger
    return divide ? [<div key={`${item.label}-sep`} role="separator" className="ds-menu__sep" />, button] : [button]
  })

  return <>
    <button
      type="button"
      ref={triggerRef}
      className={`ds-btn ds-btn--quiet ds-btn--icon${size === 'sm' ? ' ds-btn--sm' : ''}`}
      aria-label={label}
      aria-haspopup={phone ? 'dialog' : 'menu'}
      aria-expanded={open}
      aria-controls={open && !phone ? menuId : undefined}
      onClick={() => setOpen(current => !current)}
    >
      <Icon name={icon} />
    </button>
    {phone
      ? <Sheet
          open={open}
          onClose={close}
          title={sheetTitle || label}
          size="sm"
          footer={<button type="button" className="ds-btn ds-btn--secondary ds-btn--block" onClick={close}>Cancelar</button>}
        >
          <div className="ds-actionlist" role="menu" aria-label={label} onKeyDown={event => moveFocus(event, event.currentTarget)}>{options}</div>
        </Sheet>
      : <Popover open={open} anchorRef={triggerRef} onClose={close} role="menu" ariaLabel={label} id={menuId} className="ds-menu" placement="bottom-end">
          <div
            className="ds-menu__list"
            onKeyDown={event => moveFocus(event, event.currentTarget)}
            onBlur={event => {
              const next = event.relatedTarget
              if (next && !event.currentTarget.contains(next) && next !== triggerRef.current) close()
            }}
          >
            {options}
          </div>
        </Popover>}
  </>
}
