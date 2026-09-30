import { fmtNum } from '../../lib/analytics-format.js'
import { Icon } from '../ui/icon.jsx'

export function EngagementTypeBar({ icon, label, value, max }) {
  const percent = value == null || !max ? 0 : (value / max) * 100
  return (
    <div className="ds-hbar">
      <span className="ds-hbar__label">{icon && <Icon name={icon} size={16} />}{label}</span>
      <span className="ds-hbar__track" aria-hidden="true"><span className="ds-hbar__fill" style={{ '--v': `${percent}%` }} /></span>
      <span className="ds-hbar__value">{fmtNum(value)}</span>
    </div>
  )
}
