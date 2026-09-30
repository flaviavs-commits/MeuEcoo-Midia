import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Icon } from './icon.jsx'

const TOAST_TONES = { error: 'danger', warning: 'warning', info: 'info' }
const TOAST_ICONS = { error: 'alertCircle', warning: 'alertTriangle', info: 'info' }

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Set())

  useEffect(() => () => {
    for (const timer of timers.current) window.clearTimeout(timer)
    timers.current.clear()
  }, [])

  const notify = useCallback((message, type = 'success') => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts(current => [...current, { id, message, type }])
    const timer = window.setTimeout(() => {
      timers.current.delete(timer)
      setToasts(current => current.filter(toast => toast.id !== id))
    }, 4200)
    timers.current.add(timer)
  }, [])

  const dismiss = useCallback(id => setToasts(current => current.filter(toast => toast.id !== id)), [])

  return <ToastContext.Provider value={notify}>
    {children}
    <div className="ds-toasts" data-ds-root aria-live="polite" aria-atomic="true">
      {toasts.map(toast => <div className="ds-toast" data-tone={TOAST_TONES[toast.type]} key={toast.id} role={toast.type === 'error' ? 'alert' : 'status'}>
        <Icon name={TOAST_ICONS[toast.type] || 'checkCircle'} className="ds-toast__icon" />
        <p className="ds-toast__msg">{toast.message}</p>
        <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-btn--sm ds-toast__close" onClick={() => dismiss(toast.id)} aria-label="Fechar aviso"><Icon name="close" size={16} /></button>
      </div>)}
    </div>
  </ToastContext.Provider>
}

export function useToast() {
  const notify = useContext(ToastContext)
  if (!notify) throw new Error('useToast precisa estar dentro de ToastProvider')
  return notify
}
