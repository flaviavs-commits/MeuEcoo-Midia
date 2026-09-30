import { useEffect, useRef } from 'react'
import { Icon } from './icon.jsx'

const PLATFORM_LABELS = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok' }

// Resultado por rede de uma publicação ("Publicadas" / "Não publicadas").
export function PublicationResultGroups({ summary }) {
  if (!summary) return null
  return <div className="pub-results">
    {summary.published?.length > 0 && <div className="pub-results__group" data-tone="success">
      <p className="pub-results__label">Publicadas</p>
      <ul>{summary.published.map(label => <li key={label}><Icon name="check" size={16} /><span>{label}</span></li>)}</ul>
    </div>}
    {summary.failures?.length > 0 && <div className="pub-results__group" data-tone="danger">
      <p className="pub-results__label">Não publicadas</p>
      <ul>{summary.failures.map(item => <li key={`${item.label}-${item.error}`}><Icon name="close" size={16} /><span><strong>{item.label}</strong><small>{item.error}</small></span></li>)}</ul>
    </div>}
  </div>
}

export function PublicationStatusModal({ status, platforms, progress, onReview, onClose }) {
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const statusType = status?.type
  const isProcessing = statusType === 'processing'

  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  // Foco inicial no diálogo a cada mudança de estado da publicação.
  useEffect(() => {
    if (!statusType) return
    const dialog = dialogRef.current
    const target = dialog?.querySelector('.pub-status__close') || dialog
    target?.focus({ preventScroll: true })
  }, [statusType])

  // Esc fecha somente quando o fechamento já é permitido (durante o
  // processamento o diálogo continua sem saída, como antes).
  useEffect(() => {
    if (!statusType || isProcessing) return undefined
    const onKey = event => { if (event.key === 'Escape') onCloseRef.current?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [statusType, isProcessing])

  if (!status) return null

  const isSuccess = status.type === 'success'
  const isScheduled = status.type === 'scheduled'
  const isWarning = status.type === 'warning'
  const title = isProcessing
    ? 'Publicando seu post'
    : isSuccess
      ? 'Publicação confirmada'
      : isScheduled
        ? 'Seu post está na agenda'
        : isWarning
          ? 'Publicação parcial'
          : 'Não foi possível concluir a publicação'
  const kicker = isProcessing
    ? 'PUBLICAÇÃO EM ANDAMENTO'
    : isSuccess || isScheduled
      ? 'TUDO CERTO!'
      : 'PRECISA DE ATENÇÃO'
  const tone = isProcessing ? 'info' : isSuccess || isScheduled ? 'success' : isWarning ? 'warning' : 'danger'
  const platformList = [...new Set((platforms || []).map(platform => PLATFORM_LABELS[platform] || platform))]

  return <div
    className="ds-scrim pub-status-scrim"
    data-ds-root
    role="presentation"
    onMouseDown={event => { if (!isProcessing && event.target === event.currentTarget) onClose() }}
  >
    <section ref={dialogRef} tabIndex={-1} className="ds-modal ds-modal--sm pub-status" data-tone={tone} role="dialog" aria-modal="true" aria-labelledby="scheduler-publication-title" aria-describedby="scheduler-publication-description">
      <header className="ds-modal__head">
        <div className="ds-modal__heading pub-status__heading">
          <span className="pub-status__mark" aria-hidden="true">
            {isProcessing ? <span className="ds-spinner" /> : <Icon name={isSuccess || isScheduled ? 'check' : 'alertTriangle'} />}
          </span>
          <p className="ds-eyebrow">{kicker}</p>
          <h2 className="ds-modal__title" id="scheduler-publication-title">{title}</h2>
        </div>
        {!isProcessing && <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-modal__close pub-status__close" onClick={onClose} aria-label="Fechar confirmação"><Icon name="close" /></button>}
      </header>

      <div className="ds-modal__body pub-status__body">
        <p id="scheduler-publication-description" className="pub-status__desc">
          {isProcessing
            ? progress || status.message
            : isScheduled
              ? <>Ele será publicado em <strong>{status.date || 'o horário escolhido'}</strong>.</>
              : isSuccess
                ? 'A publicação foi confirmada pelo Meu Post e já foi enviada para as redes selecionadas.'
                : status.message}
        </p>
        {isSuccess && status.message && <p className="ds-hint">{status.message}</p>}

        {isProcessing
          ? <div className="pub-status__waiting" role="status" aria-live="polite">
              <div className="ds-progress pub-status__track" aria-hidden="true"><span className="ds-progress__bar" /></div>
              <span>Estamos aguardando a confirmação das redes sociais.</span>
            </div>
          : isScheduled
            ? <div className="pub-status__schedule">
                <p className="pub-results__label">Redes selecionadas</p>
                <div className="pub-status__chips">{(status.platformList?.length ? status.platformList : platformList).map(platform => <span className="ds-badge" data-tone="success" key={platform}>✓ {platform}</span>)}</div>
                <p className="ds-hint">Você pode acompanhar ou editar esse agendamento no calendário.</p>
              </div>
            : status.resultSummary
              ? <PublicationResultGroups summary={status.resultSummary} />
              : platformList.length > 0 && <div className="pub-status__chips">{platformList.map(platform => <span className="ds-badge" data-tone={isSuccess ? 'success' : 'outline'} key={platform}>✓ {platform}</span>)}</div>}
      </div>

      {!isProcessing && <footer className="ds-modal__foot pub-status__foot">
        {(isWarning || status.type === 'error') && onReview && <button type="button" className="ds-btn ds-btn--secondary" onClick={onReview}><Icon name="compose" />Revisar no editor</button>}
        <button type="button" className={`ds-btn ${isSuccess || isScheduled ? 'ds-btn--primary' : 'ds-btn--quiet'}`} onClick={onClose}>{isSuccess || isScheduled ? 'Fechar confirmação' : 'Fechar aviso'}</button>
      </footer>}
    </section>
  </div>
}
