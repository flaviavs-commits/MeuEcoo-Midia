import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api.js'
import { useToast } from '../ui/toast.jsx'
import { Icon } from '../ui/icon.jsx'
import { Select } from '../ui/select.jsx'
import { useConfirm } from '../ui/confirm-dialog.jsx'

const FREQUENCIES = [{ value: 'monthly', label: 'Mensal' }, { value: 'weekly', label: 'Semanal' }]

export function ReportSchedulePanel() {
  const [schedules, setSchedules] = useState([])
  const [loadError, setLoadError] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState(null)
  const [form, setForm] = useState({ name: 'Relatório mensal', email: '', frequency: 'monthly' })
  const notify = useToast()
  const { confirm, confirmDialog } = useConfirm()
  const load = useCallback(() => apiFetch('/api/report-schedules')
    .then(data => { setSchedules(data.schedules || []); setLoadError(false) })
    .catch(error => { setLoadError(true); throw error })
    .finally(() => setLoaded(true)), [])

  useEffect(() => { load().catch(() => {}) }, [load])

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    try {
      await apiFetch('/api/report-schedules', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          recipients: form.email.split(',').map(item => item.trim()).filter(Boolean),
          frequency: form.frequency
        })
      })
      setForm(current => ({ ...current, email: '' }))
      notify('Agendamento salvo. O primeiro envio foi iniciado para os destinatários.')
      load().catch(() => {})
    } catch (error) {
      notify(error.message, 'error')
      // O servidor salva antes de enviar: recarregar evita duplicar um
      // agendamento que foi gravado mesmo quando o envio falhou.
      load().catch(() => {})
    } finally {
      setSaving(false)
    }
  }

  async function remove(schedule) {
    if (removingId) return
    const ok = await confirm({
      title: `Remover o agendamento “${schedule.name}”?`,
      description: 'Os próximos envios deste relatório serão cancelados.',
      confirmLabel: 'Remover',
    })
    if (!ok) return
    setRemovingId(schedule.id)
    try {
      await apiFetch(`/api/report-schedules/${schedule.id}`, { method: 'DELETE' })
      setSchedules(current => current.filter(item => item.id !== schedule.id))
      notify('Agendamento removido.')
    } catch (error) {
      notify(error.message, 'error')
    } finally {
      setRemovingId(null)
    }
  }

  return <div className="rel-mail">
    <p className="rel-mail__lede">Ao agendar, o sistema gera e envia o PDF completo agora e mantém os próximos envios no ciclo escolhido.</p>
    <p className="ds-hint rel-mail__scope"><Icon name="info" size={16} />O relatório enviado cobre os últimos 30 dias de todas as redes, independentemente dos filtros desta página.</p>

    <form className="rel-mail__form" onSubmit={save}>
      <div className="ds-field">
        <label className="ds-label" htmlFor="rel-mail-name">Nome do relatório</label>
        <input id="rel-mail-name" className="ds-input" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Nome do relatório" required />
      </div>
      <div className="ds-field">
        <label className="ds-label" htmlFor="rel-mail-to">E-mails do relatório</label>
        <input id="rel-mail-to" className="ds-input" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} placeholder="nome@empresa.com, outra@empresa.com" required aria-describedby="rel-mail-to-hint" />
        <p className="ds-hint" id="rel-mail-to-hint">Separe vários e-mails por vírgula.</p>
      </div>
      <div className="ds-field">
        <label className="ds-label" htmlFor="rel-mail-frequency">Frequência do relatório</label>
        <Select id="rel-mail-frequency" value={form.frequency} onChange={frequency => setForm(current => ({ ...current, frequency }))} options={FREQUENCIES} sheetTitle="Frequência do relatório" />
      </div>
      <button type="submit" className="ds-btn ds-btn--primary ds-btn--block" disabled={saving}>
        {saving ? <><span className="ds-spinner" aria-hidden="true" />Agendando e enviando…</> : <><Icon name="send" />Agendar</>}
      </button>
    </form>

    <div className="rel-mail__list">
      <h3 className="rel-subhead__title">Agendamentos</h3>
      {loadError
        ? <p className="ds-fieldmsg" role="alert"><Icon name="alertCircle" size={16} />Não foi possível carregar os agendamentos.</p>
        : schedules.length
          ? <ul className="ds-list">{schedules.map(schedule => <li className="ds-list-item" key={schedule.id}>
            <div className="ds-list-item__body">
              <p className="ds-list-item__title">{schedule.name}</p>
              <p className="ds-list-item__meta">
                <span>{schedule.frequency === 'weekly' ? 'Semanal' : 'Mensal'}</span>
                <span>próximo {schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleDateString('pt-BR') : '—'}</span>
                {schedule.lastSentAt && <span>último envio {new Date(schedule.lastSentAt).toLocaleDateString('pt-BR')}</span>}
              </p>
            </div>
            <div className="ds-list-item__trail"><button type="button" className="ds-btn ds-btn--danger ds-btn--sm" onClick={() => remove(schedule)} disabled={removingId === schedule.id} aria-label={`Remover ${schedule.name}`}><Icon name="trash" size={16} />Remover</button></div>
          </li>)}</ul>
          : loaded && <p className="ds-hint">Nenhum agendamento ainda.</p>}
    </div>
    {confirmDialog}
  </div>
}
