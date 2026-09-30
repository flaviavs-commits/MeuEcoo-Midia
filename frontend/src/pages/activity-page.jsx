import { useCallback, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import { useApiResource } from '../hooks/use-api-resource.js'
import { useToast } from '../components/ui/toast.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { OverflowMenu } from '../components/ui/overflow-menu.jsx'

const HISTORY_LIMIT = 200
// Filtros no plural; o selo de cada linha usa o singular. O servidor também grava
// "warn" (token para reconectar, sincronização), que o sino já chama de "Atenção".
const TYPE_LABELS = { err: 'Erros', warn: 'Atenção', ok: 'Sucesso', info: 'Informações' }
const TYPE_META = {
  err: { label: 'Erro', status: 'failed', icon: 'alertCircle' },
  warn: { label: 'Atenção', status: 'warning', icon: 'alertTriangle' },
  ok: { label: 'Sucesso', status: 'ok', icon: 'checkCircle' },
  info: { label: 'Informação', status: 'muted', icon: 'info' },
}
const PLATFORM_LABELS = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok' }

function dayKey(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'sem-data' : date.toLocaleDateString('sv-SE')
}

function dayLabel(key) {
  if (key === 'sem-data') return 'Sem data'
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (key === today.toLocaleDateString('sv-SE')) return 'Hoje'
  if (key === yesterday.toLocaleDateString('sv-SE')) return 'Ontem'
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: year === today.getFullYear() ? undefined : 'numeric' })
}

export function ActivityPage() {
  const [type, setType] = useState('all')
  const [search, setSearch] = useState('')
  const load = useCallback(() => apiFetch(`/api/logs?limit=${HISTORY_LIMIT}`).then(data => data.logs || []), [])
  const { value: logs, loading, error, setError, reload } = useApiResource(load, [])
  const notify = useToast()

  const visibleLogs = useMemo(() => {
    const query = search.trim().toLowerCase()
    return logs.filter(log => (type === 'all' || log.type === type) && (!query || `${log.message} ${log.platform || ''}`.toLowerCase().includes(query)))
  }, [logs, search, type])

  const counts = useMemo(() => logs.reduce((total, log) => ({ ...total, [log.type]: (total[log.type] || 0) + 1 }), {}), [logs])

  const groups = useMemo(() => {
    const byDay = new Map()
    for (const log of visibleLogs) {
      const key = dayKey(log.timestamp)
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key).push(log)
    }
    return [...byDay.entries()]
  }, [visibleLogs])

  async function clearHistory() {
    if (!window.confirm('Limpar todo o histórico de atividades da sua conta?')) return
    try { await apiFetch('/api/logs', { method: 'DELETE' }); await reload(); notify('Histórico limpo.') }
    catch (caught) { setError(caught.message); notify(caught.message, 'error') }
  }

  const filtered = Boolean(search.trim()) || type !== 'all'
  const firstLoad = loading && !logs.length
  const clearFilters = () => { setSearch(''); setType('all') }

  return <div className="ds-page atv" data-ds-root>
    <header className="ds-pagehead atv-head">
      <div className="ds-pagehead__text">
        <p className="ds-eyebrow">Histórico</p>
        <h1 className="ds-pagehead__title">Atividades</h1>
        <p className="ds-pagehead__lede">Acompanhe publicações, conexões, renovações e falhas recentes.</p>
      </div>
      <div className="ds-pagehead__actions">
        <button type="button" className="ds-btn ds-btn--secondary" onClick={() => reload().catch(() => {})} disabled={loading}>
          {loading ? <span className="ds-spinner" aria-hidden="true" /> : <Icon name="refresh" />}Atualizar
        </button>
        <OverflowMenu label="Mais ações do histórico" size="md" items={[
          { label: 'Limpar histórico', icon: 'trash', danger: true, disabled: !logs.length, onSelect: clearHistory },
        ]} />
      </div>
    </header>

    <div className="ds-filterbar atv-tools">
      <label className="ds-inputwrap atv-tools__search">
        <Icon name="search" />
        <input className="ds-input" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por mensagem ou rede…" aria-label="Buscar atividade" />
      </label>
      <div className="ds-seg atv-types" role="group" aria-label="Filtrar tipo de atividade">
        <button type="button" className="ds-seg__opt" aria-pressed={type === 'all'} onClick={() => setType('all')}>Todos <span className="atv-count ds-num">{logs.length}</span></button>
        {Object.entries(TYPE_LABELS).map(([key, label]) => (key !== 'warn' || counts.warn) && <button type="button" className="ds-seg__opt" aria-pressed={type === key} onClick={() => setType(key)} key={key}>
          {label} <span className="atv-count ds-num">{counts[key] || 0}</span>
        </button>)}
      </div>
    </div>

    {error && <div className="ds-alert" data-tone="danger" role="alert">
      <Icon name="alertCircle" className="ds-alert__icon" />
      <p className="ds-alert__title">Não foi possível carregar o histórico</p>
      <p className="ds-alert__text">{error}</p>
      <div className="ds-alert__actions"><button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={() => reload().catch(() => {})} disabled={loading}>Tentar de novo</button></div>
    </div>}

    {firstLoad
      ? <div aria-busy="true"><p className="ds-sr-only" role="status">Carregando histórico…</p>{[1, 2, 3, 4].map(item => <span className="ds-skel atv-skel" key={item} />)}</div>
      : visibleLogs.length
        ? <div className="atv-days" aria-busy={loading || undefined}>
            <p className="ds-meta atv-total" aria-live="polite">{filtered ? `${visibleLogs.length} de ${logs.length} atividades` : `${logs.length} ${logs.length === 1 ? 'atividade' : 'atividades'}`}{logs.length >= HISTORY_LIMIT ? ` · mostrando as ${HISTORY_LIMIT} mais recentes` : ''}</p>
            {groups.map(([key, items]) => <section className="atv-day" key={key} aria-labelledby={`atv-day-${key}`}>
              <h2 className="atv-day__title" id={`atv-day-${key}`}>{dayLabel(key)}</h2>
              <ul className="atv-list">
                {items.map(log => {
                  const meta = TYPE_META[log.type] || { label: 'Atividade', status: 'muted', icon: 'activity' }
                  const time = log.timestamp ? new Date(log.timestamp) : null
                  const validTime = time && !Number.isNaN(time.getTime())
                  return <li className="atv-item" key={log.id} data-type={log.type || 'info'}>
                    <span className="atv-item__icon" data-status={meta.status} aria-hidden="true"><Icon name={meta.icon} size={18} /></span>
                    <div className="atv-item__main">
                      <p className="atv-item__msg">{log.message}</p>
                      <p className="ds-meta">
                        <span className="ds-status ds-status--soft" data-status={meta.status}>{meta.label}</span>
                        {log.platform && <span>{PLATFORM_LABELS[log.platform] || log.platform}</span>}
                        {validTime ? <time dateTime={time.toISOString()}>{time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time> : <span>Agora</span>}
                      </p>
                    </div>
                  </li>
                })}
              </ul>
            </section>)}
          </div>
        : !error || logs.length
          ? <div className="ds-empty ds-empty--center atv-empty">
              <span className="ds-icontile ds-icontile--lg" aria-hidden="true"><Icon name={filtered ? 'search' : 'activity'} /></span>
              <h2 className="ds-empty__title ds-empty__title--sm">{filtered ? 'Nenhuma atividade corresponde aos filtros.' : 'Nenhuma atividade registrada ainda.'}</h2>
              <p className="ds-empty__text">{filtered ? 'Tente outro termo ou volte a ver todos os tipos.' : 'Publicações, conexões de contas e falhas aparecem aqui assim que acontecerem.'}</p>
              {filtered && <div className="ds-empty__actions"><button type="button" className="ds-btn ds-btn--secondary" onClick={clearFilters}>Limpar filtros</button></div>}
            </div>
          : null}
  </div>
}
