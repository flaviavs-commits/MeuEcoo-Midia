import { Icon } from '../ui/icon.jsx'
import { formatSize } from './media-format.js'

const STATUS_TEXT = { queued: 'Na fila', uploading: 'Enviando', saving: 'Salvando na biblioteca', done: 'Adicionada' }

// The files of the current upload batch: progress while sending, then done or the reason it failed.
export function UploadQueue({ items, onRetry, onDismiss, onClear }) {
  if (!items.length) return null
  const done = items.filter(item => item.status === 'done').length
  const failed = items.filter(item => item.status === 'error').length
  const active = items.length - done - failed
  return <section className="lib-queue" aria-label="Envios">
    <div className="lib-queue__head">
      <p className="lib-queue__title" role="status">
        {active ? `Enviando ${items.length - active + 1} de ${items.length}…` : failed ? `${done} de ${items.length} enviados · ${failed} com problema` : `${done} ${done === 1 ? 'arquivo enviado' : 'arquivos enviados'}`}
      </p>
      {!active && <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm" onClick={onClear}>{failed ? 'Limpar enviados' : 'Fechar'}</button>}
    </div>
    <ul className="lib-queue__list">
      {items.map(item => <li className="lib-queue__item" data-status={item.status} key={item.id}>
        <span className="lib-queue__icon" aria-hidden="true"><Icon name={item.status === 'done' ? 'checkCircle' : item.status === 'error' ? 'alertCircle' : String(item.file.type).startsWith('video/') ? 'video' : 'image'} size={18} /></span>
        <span className="lib-queue__main">
          <span className="lib-queue__name" title={item.file.name}>{item.file.name}</span>
          {item.status === 'error'
            ? <span className="lib-queue__error">{item.error}</span>
            : <span className="lib-queue__meta">{formatSize(item.file.size)} · {STATUS_TEXT[item.status]}{item.status === 'uploading' ? ` ${Math.round((item.progress || 0) * 100)}%` : ''}</span>}
          {(item.status === 'uploading' || item.status === 'saving') && <span className="lib-queue__bar" role="progressbar" aria-label={`Envio de ${item.file.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((item.progress || 0) * 100)}>
            <span style={{ '--value': `${Math.round((item.progress || 0) * 100)}%` }} />
          </span>}
        </span>
        {item.status === 'error' && <span className="lib-queue__actions">
          {item.retryable && <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={() => onRetry(item.id)}>Tentar de novo</button>}
          <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-btn--sm" onClick={() => onDismiss(item.id)} aria-label={`Dispensar ${item.file.name}`}><Icon name="close" size={16} /></button>
        </span>}
      </li>)}
    </ul>
  </section>
}
