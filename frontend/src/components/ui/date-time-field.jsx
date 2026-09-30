import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Icon } from './icon.jsx'
import { Popover, Sheet } from './floating.jsx'
import { useIsPhone } from '../../lib/breakpoints.js'

// Values keep the <input type="datetime-local"> contract: "YYYY-MM-DDTHH:mm" in the
// browser's time zone (the same zone the scheduling code converts to ISO), or "".
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const WEEKDAY_NAMES = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, '0'))
const pad = number => String(number).padStart(2, '0')

export function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseValue(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(String(value || ''))
  if (!match) return null
  const [, year, month, day, hour = '09', minute = '00'] = match
  return { year: Number(year), month: Number(month) - 1, day: Number(day), hour, minute }
}

export function localTimeZoneName() {
  try {
    const part = new Intl.DateTimeFormat('pt-BR', { timeZoneName: 'long' }).formatToParts(new Date()).find(item => item.type === 'timeZoneName')
    return part?.value || Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return ''
  }
}

// First slot at least one hour ahead, on a quarter hour; a sensible default for scheduling.
function defaultTimeFor(dateKey) {
  const now = new Date()
  if (dateKey !== toDateKey(now)) return { hour: '09', minute: '00' }
  const next = new Date(now.getTime() + 60 * 60 * 1000)
  next.setMinutes(Math.ceil(next.getMinutes() / 15) * 15, 0, 0)
  if (toDateKey(next) !== dateKey) return { hour: '23', minute: '45' }
  return { hour: pad(next.getHours()), minute: pad(next.getMinutes()) }
}

export function formatDateTimeLabel(value) {
  const parsed = parseValue(value)
  if (!parsed) return ''
  return `${pad(parsed.day)}/${pad(parsed.month + 1)}/${parsed.year} · ${parsed.hour}:${parsed.minute}`
}

function monthMatrix(year, month) {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index))
}

function CalendarPanel({ value, onChange, onDone, disablePast, required, timeZone }) {
  const parsed = parseValue(value)
  const today = new Date()
  const todayKey = toDateKey(today)
  const [view, setView] = useState(() => parsed ? { year: parsed.year, month: parsed.month } : { year: today.getFullYear(), month: today.getMonth() })
  const [focusKey, setFocusKey] = useState(() => parsed ? `${parsed.year}-${pad(parsed.month + 1)}-${pad(parsed.day)}` : todayKey)
  const gridRef = useRef(null)
  const moveFocusRef = useRef(false)
  const titleId = useId()
  const days = useMemo(() => monthMatrix(view.year, view.month), [view])
  const selectedKey = parsed ? `${parsed.year}-${pad(parsed.month + 1)}-${pad(parsed.day)}` : ''
  // "setembro de 2026" -> "Setembro de 2026" (só a primeira letra; o CSS capitalize pegaria o "de")
  const monthName = new Date(view.year, view.month, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const monthLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1)

  useEffect(() => {
    if (!moveFocusRef.current) return
    moveFocusRef.current = false
    gridRef.current?.querySelector(`[data-day="${focusKey}"]`)?.focus()
  }, [focusKey, view])

  function selectDay(date) {
    const key = toDateKey(date)
    const time = parsed ? { hour: parsed.hour, minute: parsed.minute } : defaultTimeFor(key)
    onChange(`${key}T${time.hour}:${time.minute}`)
    setFocusKey(key)
    if (date.getMonth() !== view.month) setView({ year: date.getFullYear(), month: date.getMonth() })
  }

  function setTime(part, next) {
    const key = selectedKey || todayKey
    const base = parsed ? { hour: parsed.hour, minute: parsed.minute } : defaultTimeFor(key)
    onChange(`${key}T${part === 'hour' ? next : base.hour}:${part === 'minute' ? next : base.minute}`)
  }

  function shiftMonth(delta) {
    const next = new Date(view.year, view.month + delta, 1)
    setView({ year: next.getFullYear(), month: next.getMonth() })
  }

  function onGridKey(event) {
    const current = new Date(`${focusKey}T12:00`)
    const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    let next = null
    if (steps[event.key]) next = new Date(current.getFullYear(), current.getMonth(), current.getDate() + steps[event.key])
    else if (event.key === 'PageUp') next = new Date(current.getFullYear(), current.getMonth() - 1, current.getDate())
    else if (event.key === 'PageDown') next = new Date(current.getFullYear(), current.getMonth() + 1, current.getDate())
    else if (event.key === 'Home') next = new Date(current.getFullYear(), current.getMonth(), current.getDate() - current.getDay())
    else if (event.key === 'End') next = new Date(current.getFullYear(), current.getMonth(), current.getDate() + (6 - current.getDay()))
    if (!next) return
    event.preventDefault()
    moveFocusRef.current = true
    setFocusKey(toDateKey(next))
    if (next.getMonth() !== view.month || next.getFullYear() !== view.year) setView({ year: next.getFullYear(), month: next.getMonth() })
  }

  const weeks = Array.from({ length: 6 }, (_, row) => days.slice(row * 7, row * 7 + 7))

  // Calendário e horário são dois blocos: empilhados na folha do celular, lado a lado no
  // painel do desktop (assim ele cabe acima ou abaixo de um campo dentro de um diálogo).
  return <div className="ds-dtp">
    <div className="ds-dtp__cal">
    <div className="ds-dtp__head">
      <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-btn--sm" aria-label="Mês anterior" onClick={() => shiftMonth(-1)}><Icon name="chevronLeft" size={18} /></button>
      <p className="ds-dtp__month" id={titleId} aria-live="polite">{monthLabel}</p>
      <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-btn--sm" aria-label="Próximo mês" onClick={() => shiftMonth(1)}><Icon name="chevronRight" size={18} /></button>
    </div>
    <div className="ds-dtp__grid" role="grid" aria-labelledby={titleId} ref={gridRef} onKeyDown={onGridKey}>
      <div className="ds-dtp__row" role="row">
        {WEEKDAYS.map((label, index) => <span key={index} className="ds-dtp__wd" role="columnheader" aria-label={WEEKDAY_NAMES[index]}>{label}</span>)}
      </div>
      {weeks.map((week, row) => <div className="ds-dtp__row" role="row" key={row}>
        {week.map(date => {
          const key = toDateKey(date)
          const outside = date.getMonth() !== view.month
          const past = disablePast && key < todayKey
          return <span role="gridcell" key={key} aria-selected={key === selectedKey}>
            <button
              type="button"
              className="ds-dtp__day"
              data-day={key}
              data-outside={outside || undefined}
              data-today={key === todayKey || undefined}
              aria-pressed={key === selectedKey}
              aria-label={date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              tabIndex={key === focusKey ? 0 : -1}
              disabled={past}
              onClick={() => selectDay(date)}
            >{date.getDate()}</button>
          </span>
        })}
      </div>)}
    </div>
    </div>
    <div className="ds-dtp__side">
    <div className="ds-dtp__time">
      <p className="ds-label" id={`${titleId}-time`}>Horário</p>
      <div className="ds-dtp__timefields" role="group" aria-labelledby={`${titleId}-time`}>
        <span className="ds-select ds-dtp__select">
          <select className="ds-select__control" aria-label="Hora" value={parsed?.hour ?? ''} onChange={event => setTime('hour', event.target.value)}>
            {!parsed && <option value="">--</option>}
            {HOURS.map(hour => <option key={hour} value={hour}>{hour}</option>)}
          </select>
          <Icon name="chevronDown" className="ds-select__chev" />
        </span>
        <span className="ds-dtp__colon" aria-hidden="true">:</span>
        <span className="ds-select ds-dtp__select">
          <select className="ds-select__control" aria-label="Minuto" value={parsed?.minute ?? ''} onChange={event => setTime('minute', event.target.value)}>
            {!parsed && <option value="">--</option>}
            {MINUTES.map(minute => <option key={minute} value={minute}>{minute}</option>)}
          </select>
          <Icon name="chevronDown" className="ds-select__chev" />
        </span>
      </div>
      {timeZone && <p className="ds-meta ds-dtp__tz">Fuso: {timeZone}</p>}
    </div>
    <div className="ds-dtp__foot">
      <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm" onClick={() => { const now = new Date(); setView({ year: now.getFullYear(), month: now.getMonth() }); selectDay(now) }}>Hoje</button>
      <span className="ds-dtp__footend">
        {!required && value && <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm" onClick={() => onChange('')}>Limpar</button>}
        <button type="button" className="ds-btn ds-btn--primary ds-btn--sm" onClick={onDone}>Concluir</button>
      </span>
    </div>
    </div>
  </div>
}

/*
 * One date + time control for the whole product (pt-BR, 24h): an anchored panel on
 * desktop, a bottom sheet on phones. A visually hidden native input keeps form
 * validation ("required") working exactly like the old datetime-local field.
 */
export function DateTimeField({ id, value, onChange, required = false, invalid = false, describedBy, disablePast = false, placeholder = 'Escolher data e horário', sheetTitle = 'Data e horário' }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const phone = useIsPhone()
  const timeZone = useMemo(localTimeZoneName, [])
  const label = formatDateTimeLabel(value)
  const panel = <CalendarPanel value={value} onChange={onChange} onDone={() => { setOpen(false); triggerRef.current?.focus() }} disablePast={disablePast} required={required} timeZone={timeZone} />

  return <span className="ds-dtf">
    <button
      type="button"
      id={id}
      ref={triggerRef}
      className="ds-dtf__trigger"
      role="combobox"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-required={required || undefined}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      data-empty={!label || undefined}
      onClick={() => setOpen(current => !current)}
    >
      <Icon name="calendar" size={18} />
      <span className="ds-dtf__value">{label || placeholder}</span>
    </button>
    <input
      className="ds-dtf__native"
      tabIndex={-1}
      aria-hidden="true"
      required={required}
      value={value || ''}
      onChange={() => {}}
      onFocus={() => { triggerRef.current?.focus(); setOpen(true) }}
    />
    {phone
      ? <Sheet open={open} onClose={() => setOpen(false)} title={sheetTitle} size="sm">{panel}</Sheet>
      : <Popover open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} placement="bottom-start" className="ds-dtf__popover" ariaLabel={sheetTitle}>{panel}</Popover>}
  </span>
}

// Time of day only (24h), for recurring routines: two compact selects.
export function TimeField({ id, value, onChange, labelledBy }) {
  const [hour = '', minute = ''] = String(value || '').split(':')
  const update = (nextHour, nextMinute) => onChange(`${nextHour || '09'}:${nextMinute || '00'}`)
  return <span className="ds-timefield" role="group" aria-labelledby={labelledBy}>
    <span className="ds-select">
      <select id={id} className="ds-select__control" aria-label="Hora" value={hour} onChange={event => update(event.target.value, minute)}>
        {!hour && <option value="">--</option>}
        {HOURS.map(item => <option key={item} value={item}>{item}</option>)}
      </select>
      <Icon name="chevronDown" className="ds-select__chev" />
    </span>
    <span className="ds-dtp__colon" aria-hidden="true">:</span>
    <span className="ds-select">
      <select className="ds-select__control" aria-label="Minuto" value={minute} onChange={event => update(hour, event.target.value)}>
        {!minute && <option value="">--</option>}
        {MINUTES.map(item => <option key={item} value={item}>{item}</option>)}
      </select>
      <Icon name="chevronDown" className="ds-select__chev" />
    </span>
  </span>
}
