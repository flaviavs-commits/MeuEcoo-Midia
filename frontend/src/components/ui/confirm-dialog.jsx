import { useCallback, useRef, useState } from 'react'
import { Sheet } from './floating.jsx'

/*
 * DS confirmation, in place of the browser's confirm(): an icon, a title, what will happen, and two
 * buttons. "Cancelar" takes focus first, so Enter never destroys anything by accident.
 *
 *   const { confirm, confirmDialog } = useConfirm()
 *   if (!(await confirm({ title: 'Excluir esta ideia?', confirmLabel: 'Excluir', tone: 'danger' }))) return
 *   ...render {confirmDialog} once in the page.
 *
 * Escape, the scrim and "Cancelar" all resolve to false. No provider: each page owns its dialog.
 */
export function useConfirm() {
  const [request, setRequest] = useState(null)
  const resolver = useRef(null)

  const confirm = useCallback(options => new Promise(resolve => {
    resolver.current?.(false)
    resolver.current = resolve
    setRequest(options)
  }), [])

  const settle = useCallback(result => {
    resolver.current?.(result)
    resolver.current = null
    setRequest(null)
  }, [])

  const confirmDialog = <ConfirmDialog
    open={Boolean(request)}
    {...(request || {})}
    onConfirm={() => settle(true)}
    onCancel={() => settle(false)}
  />
  return { confirm, confirmDialog }
}

export function ConfirmDialog({
  open, title, description, details, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', tone = 'danger', icon,
  onConfirm, onCancel,
}) {
  const icons = { danger: 'trash', warning: 'alertTriangle', neutral: 'info' }
  return <Sheet
    open={open}
    onClose={onCancel}
    title={title || 'Confirmar ação'}
    description={description}
    icon={icon || icons[tone] || 'info'}
    tone={tone}
    size="sm"
    className="ds-confirm"
    footer={<>
      <button type="button" className="ds-btn ds-btn--secondary" data-autofocus onClick={onCancel}>{cancelLabel}</button>
      <button type="button" className={`ds-btn ${tone === 'danger' ? 'ds-btn--danger-solid' : 'ds-btn--primary'}`} onClick={onConfirm}>{confirmLabel}</button>
    </>}
  >
    {details && <div className="ds-confirm__details">{details}</div>}
  </Sheet>
}
