import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { apiFetch, rememberSession } from '../../lib/api.js'
import { Icon } from '../ui/icon.jsx'

/*
 * The signed-in session (/api/me) and whether the server answers. A 401 is handled by apiFetch
 * (back to the login); any other failure means the server did not answer as expected, and the
 * app says so once, at the top, instead of every block repeating a generic error.
 *   status: 'checking' | 'ok' | 'down' | 'retrying' (asking again after 'down')
 * retry() asks again; when the server is back, `generation` changes so the page can remount
 * and load its data again. The browser coming back online retries on its own.
 */
export function useSession() {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('checking')
  const [generation, setGeneration] = useState(0)
  const wasDown = useRef(false)
  const active = useRef(true)

  const check = useCallback(() => {
    setStatus(current => (current === 'down' || current === 'retrying' ? 'retrying' : 'checking'))
    return apiFetch('/api/me').then(currentUser => {
      if (!active.current) return
      rememberSession()
      setUser(currentUser)
      setStatus('ok')
      if (wasDown.current) setGeneration(value => value + 1)
      wasDown.current = false
    }).catch(error => {
      if (!active.current || error?.status === 401) return
      wasDown.current = true
      setStatus('down')
    })
  }, [])

  useEffect(() => {
    active.current = true
    check()
    const onOnline = () => { if (wasDown.current) check() }
    window.addEventListener('online', onOnline)
    return () => {
      active.current = false
      window.removeEventListener('online', onOnline)
    }
  }, [check])

  const updateUser = useCallback(patch => setUser(current => ({ ...(current || {}), ...patch })), [])
  return { user, updateUser, status, generation, retry: check }
}

// Pages read this to skip their own "couldn't load" banner while the global one is up.
export const ServerStatusContext = createContext('ok')
export function useServerDown() {
  const status = useContext(ServerStatusContext)
  return status === 'down' || status === 'retrying'
}

export function ConnectionBanner({ status, onRetry }) {
  if (status !== 'down' && status !== 'retrying') return null
  return <div className="ds-alert ds-connbanner" data-tone="warning" role="alert" data-ds-root>
    <Icon name="alertTriangle" className="ds-alert__icon" />
    <p className="ds-alert__title">O servidor não respondeu</p>
    <p className="ds-alert__text">Suas publicações e agendamentos continuam salvos. Algumas informações podem não aparecer até a conexão voltar.</p>
    <div className="ds-alert__actions">
      <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={onRetry} disabled={status === 'retrying'}>
        {status === 'retrying' ? <><span className="ds-spinner" aria-hidden="true" />Tentando…</> : <><Icon name="refresh" size={16} />Tentar de novo</>}
      </button>
    </div>
  </div>
}
