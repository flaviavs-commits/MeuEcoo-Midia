import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { autoUpdate, flip, offset, shift, size, useFloating } from '@floating-ui/react-dom'
import { Icon } from './icon.jsx'
import { MEDIA, useMediaQuery } from '../../lib/breakpoints.js'

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(', ')

function focusablesIn(root) {
  return root ? [...root.querySelectorAll(FOCUSABLE)] : []
}

const MENU_ITEMS = '[role="menuitem"]:not([disabled]), [role="menuitemcheckbox"]:not([disabled]), [role="menuitemradio"]:not([disabled])'

// Arrow keys, Home and End move between the items of a menu.
export function moveMenuFocus(event, container) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const items = [...container.querySelectorAll(MENU_ITEMS)]
  if (!items.length) return
  const index = items.indexOf(document.activeElement)
  let next = 0
  if (event.key === 'ArrowDown') next = (index + 1) % items.length
  if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length
  if (event.key === 'End') next = items.length - 1
  items[next].focus()
}

export function trapTab(event, root) {
  const items = focusablesIn(root)
  if (!items.length) { event.preventDefault(); return }
  const first = items[0]
  const last = items[items.length - 1]
  const inside = root.contains(document.activeElement)
  if (event.shiftKey && (document.activeElement === first || !inside)) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && (document.activeElement === last || !inside)) { event.preventDefault(); first.focus() }
}

// Keeps the latest callback without re-running effects that depend on it.
function useLatest(value) {
  const ref = useRef(value)
  useEffect(() => { ref.current = value })
  return ref
}

// Open sheets and popovers, innermost last. A date picker inside a dialog, for
// example: Escape and Tab belong to the top layer only, so one Escape closes one
// layer instead of the whole stack.
const openLayers = []

function useLayer(active) {
  const entry = useRef(null)
  useEffect(() => {
    if (!active) return undefined
    const layer = {}
    entry.current = layer
    openLayers.push(layer)
    return () => {
      const index = openLayers.indexOf(layer)
      if (index >= 0) openLayers.splice(index, 1)
    }
  }, [active])
  return useCallback(() => openLayers[openLayers.length - 1] === entry.current, [])
}

let scrollLocks = 0
let lockedOverflow = ''

export function useScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined
    const root = document.documentElement
    if (scrollLocks === 0) { lockedOverflow = root.style.overflow; root.style.overflow = 'hidden' }
    scrollLocks += 1
    return () => {
      scrollLocks -= 1
      if (scrollLocks === 0) root.style.overflow = lockedOverflow
    }
  }, [active])
}

/*
 * Anchored floating panel rendered in a portal, so no overflow parent can clip it.
 * Flips and shifts to stay inside the viewport and caps its height to the space left.
 */
export function Popover({
  open, anchorRef, onClose, children, className = '', placement = 'bottom-end', id,
  role = 'dialog', ariaLabel, ariaLabelledBy, initialFocus = 'first', returnFocus = true, gap = 6,
}) {
  const panelRef = useRef(null)
  const onCloseRef = useLatest(onClose)
  const isTopLayer = useLayer(open)
  const { refs, floatingStyles, isPositioned } = useFloating({
    open,
    placement,
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(gap),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(140, Math.floor(availableHeight))}px`
        },
      }),
    ],
  })

  useLayoutEffect(() => {
    refs.setReference(anchorRef?.current || null)
  }, [anchorRef, refs, open])

  const setPanel = useCallback(node => {
    panelRef.current = node
    refs.setFloating(node)
  }, [refs])

  useEffect(() => {
    if (!open) return undefined
    const onPointer = event => {
      if (panelRef.current?.contains(event.target) || anchorRef?.current?.contains(event.target)) return
      onCloseRef.current?.('outside')
    }
    const onKey = event => {
      if (!isTopLayer()) return
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current?.('escape')
        if (returnFocus) anchorRef?.current?.focus?.()
        return
      }
      // Tab past either end leaves the panel: close it and land back on the trigger,
      // so focus never wanders behind a dialog while the panel stays open.
      const panel = panelRef.current
      if (event.key !== 'Tab' || !panel?.contains(document.activeElement)) return
      const items = focusablesIn(panel)
      const edge = event.shiftKey ? items[0] : items[items.length - 1]
      if (items.length && document.activeElement !== edge) return
      event.preventDefault()
      onCloseRef.current?.('tab')
      anchorRef?.current?.focus?.()
    }
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, anchorRef, returnFocus, onCloseRef, isTopLayer])

  useEffect(() => {
    if (!open || initialFocus === 'none') return
    const panel = panelRef.current
    const target = panel?.querySelector('[data-autofocus]')
      || panel?.querySelector(MENU_ITEMS)
      || focusablesIn(panel)[0]
    target?.focus({ preventScroll: true })
  }, [open, initialFocus])

  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={setPanel}
      id={id}
      className={`ds-popover ds-floating ${className}`.trim()}
      style={{ ...floatingStyles, opacity: isPositioned ? 1 : 0 }}
      role={role}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      data-ds-root
    >
      {children}
    </div>,
    document.body,
  )
}

/*
 * Visual label for icon-only controls on devices with a fine pointer, and on keyboard focus.
 * The control keeps its own accessible name; the tooltip is decoration, never the only label.
 */
export function Tooltip({ label, children, placement = 'right', disabled = false, className = '' }) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef(null)
  const timer = useRef(null)
  const finePointer = useMediaQuery(MEDIA.finePointer)
  const { refs, floatingStyles } = useFloating({
    open,
    placement,
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [offset(10), flip({ padding: 8 }), shift({ padding: 8 })],
  })

  useLayoutEffect(() => { refs.setReference(anchorRef.current) }, [refs])
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])

  const show = delay => {
    if (disabled) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(true), delay)
  }
  const hide = () => {
    clearTimeout(timer.current)
    setOpen(false)
  }

  return <span
    ref={anchorRef}
    className={`ds-tipanchor ${className}`.trim()}
    onMouseEnter={() => { if (finePointer) show(300) }}
    onMouseLeave={hide}
    onFocus={event => { if (event.target.matches?.(':focus-visible')) show(0) }}
    onBlur={hide}
    onKeyDown={event => { if (event.key === 'Escape') hide() }}
  >
    {children}
    {open && !disabled && typeof document !== 'undefined' && createPortal(
      <span ref={refs.setFloating} className="ds-tooltip" style={floatingStyles} aria-hidden="true" data-ds-root>{label}</span>,
      document.body,
    )}
  </span>
}

/*
 * Modal surface: bottom sheet on phones, centred dialog from 768px. Traps focus, closes on
 * Escape and on the backdrop, locks page scroll and returns focus to where it came from.
 * The body is the only place allowed to scroll.
 */
export function Sheet({
  open, onClose, title, description, children, footer, className = '', size = 'md',
  closeLabel = 'Fechar', hideTitle = false, eyebrow,
}) {
  const panelRef = useRef(null)
  const titleId = useId()
  const descId = useId()
  const onCloseRef = useLatest(onClose)
  const isTopLayer = useLayer(open)
  useScrollLock(open)

  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    const panel = panelRef.current
    const target = panel?.querySelector('[data-autofocus]') || focusablesIn(panel?.querySelector('.ds-sheet__body'))[0] || focusablesIn(panel)[0]
    target?.focus({ preventScroll: true })
    const onKey = event => {
      if (!isTopLayer()) return
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current?.()
      } else if (event.key === 'Tab') {
        trapTab(event, panelRef.current)
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      if (previous?.isConnected && typeof previous.focus === 'function') previous.focus({ preventScroll: true })
    }
  }, [open, onCloseRef, isTopLayer])

  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <div
      className="ds-scrim ds-scrim--sheet"
      data-ds-root
      role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget) onCloseRef.current?.() }}
    >
      <section
        ref={panelRef}
        className={`ds-sheet ds-sheet--${size} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
      >
        <header className="ds-sheet__head">
          <div className="ds-sheet__heading">
            {eyebrow && <p className="ds-eyebrow">{eyebrow}</p>}
            <h2 className={hideTitle ? 'ds-sr-only' : 'ds-sheet__title'} id={titleId}>{title}</h2>
            {description && <p className="ds-sheet__desc" id={descId}>{description}</p>}
          </div>
          <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-sheet__close" aria-label={closeLabel} onClick={() => onCloseRef.current?.()}>
            <Icon name="close" />
          </button>
        </header>
        <div className="ds-sheet__body">{children}</div>
        {footer && <footer className="ds-sheet__foot">{footer}</footer>}
      </section>
    </div>,
    document.body,
  )
}

export { Sheet as Dialog }
