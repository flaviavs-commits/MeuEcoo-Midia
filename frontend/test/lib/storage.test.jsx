import { render, screen } from '@testing-library/react'
import { oneOf, readStored, readStoredJson, writeStored } from '../../src/lib/storage.js'
import { markTutorialCompleted } from '../../src/lib/tutorial.js'
import { CalendarPage } from '../../src/pages/calendar-page.jsx'
import { ToastProvider } from '../../src/components/ui/toast.jsx'
import * as api from '../../src/lib/api.js'

function blockStorage() {
  const blocked = () => { throw new DOMException('blocked', 'SecurityError') }
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked)
}

describe('armazenamento do navegador', () => {
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

  it('lê o padrão e não lança quando o navegador bloqueia o storage', () => {
    blockStorage()
    expect(readStored('x', 'padrão')).toBe('padrão')
    expect(readStoredJson('x', { ok: true })).toEqual({ ok: true })
    expect(writeStored('x', 'y')).toBe(false)
  })

  it('aceita só valores previstos', () => {
    localStorage.setItem('modo', 'grade-antiga')
    expect(oneOf(readStored('modo'), ['calendar', 'list'], 'calendar')).toBe('calendar')
    expect(readStoredJson('modo', null)).toBeNull()
  })

  it('o Calendário abre com o storage bloqueado, e o tutorial ainda fecha', async () => {
    blockStorage()
    vi.spyOn(api, 'apiFetch').mockResolvedValue({ posts: [] })
    render(<ToastProvider><CalendarPage onNavigate={vi.fn()} /></ToastProvider>)
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(() => markTutorialCompleted()).not.toThrow()
  })
})
