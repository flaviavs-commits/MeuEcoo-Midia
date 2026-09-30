import { useEffect, useState } from 'react'
import { Icon, NetworkGlyph } from './icon.jsx'
import { Sheet } from './floating.jsx'

// Phone entry point for the page filters; the count only includes active filters.
export function FiltersButton({ count = 0, open = false, onClick, label = 'Filtros' }) {
  return <button
    type="button"
    className="ds-btn ds-btn--secondary ds-filterbtn"
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-label={count ? `${label}, ${count} ${count === 1 ? 'ativo' : 'ativos'}` : label}
    onClick={onClick}
  >
    <Icon name="filter" size={18} />
    <span className="ds-filterbtn__label">{label}</span>
    {count > 0 && <span className="ds-filterbtn__count ds-num" aria-hidden="true">{count}</span>}
  </button>
}

/*
 * Phone filters: edits a draft of the same filter object the desktop toolbar edits.
 * Nothing reaches the page until "Aplicar filtros"; closing the sheet discards the draft.
 * children(draft, setDraft) renders the groups.
 */
export function FilterSheet({ open, onClose, value, emptyValue, onApply, title = 'Filtros', children }) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (open) setDraft(value)
    // Only a fresh opening resets the draft; value changes while open come from this sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return <Sheet
    open={open}
    onClose={onClose}
    title={title}
    className="ds-filtersheet"
    footer={<>
      <button type="button" className="ds-btn ds-btn--quiet" onClick={() => setDraft(emptyValue)}>Limpar</button>
      <button type="button" className="ds-btn ds-btn--primary" onClick={() => { onApply(draft); onClose() }}>Aplicar filtros</button>
    </>}
  >
    {children(draft, setDraft)}
  </Sheet>
}

export function FilterGroup({ title, children }) {
  return <fieldset className="ds-filtergroup">
    <legend className="ds-filtergroup__title">{title}</legend>
    <div className="ds-filtergroup__options">{children}</div>
  </fieldset>
}

// Touch-sized single/multi choice used inside filter sheets and compact toolbars.
export function FilterOption({ selected, onSelect, children, network, icon, type = 'radio' }) {
  return <button
    type="button"
    className="ds-filteropt"
    role={type === 'radio' ? 'radio' : 'checkbox'}
    aria-checked={selected}
    onClick={onSelect}
  >
    {network ? <NetworkGlyph network={network} size={18} /> : icon ? <Icon name={icon} size={18} /> : null}
    <span>{children}</span>
    <Icon name="check" size={16} className="ds-filteropt__check" />
  </button>
}
