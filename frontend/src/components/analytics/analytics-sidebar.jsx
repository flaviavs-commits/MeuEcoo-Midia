import { NETWORK_ORDER, PLAT_LABELS } from '../../lib/analytics-format.js'
import { NetworkGlyph } from '../ui/icon.jsx'

export function AnalyticsSidebar({ networks, activeNet, onSelect }) {
  const availableNetworks = new Set(networks)
  return (
    <nav className="rel-nets" aria-label="Redes sociais">
      <p className="rel-nets__label">Escolha uma rede</p>
      <div className="ds-netswitch rel-nets__list">
        <button
          type="button"
          className="ds-netswitch__opt"
          aria-pressed={activeNet === 'all'}
          aria-label="Todas as redes"
          onClick={() => onSelect('all')}
        >
          <NetworkGlyph network="all" size={16} />Todas as redes
        </button>
        {NETWORK_ORDER.map(net => {
          const available = availableNetworks.has(net)
          return (
            <button
              key={net}
              type="button"
              disabled={!available}
              className="ds-netswitch__opt"
              aria-pressed={net === activeNet}
              aria-label={`${PLAT_LABELS[net]}${available ? '' : ' — sem conexão'}`}
              onClick={() => available && onSelect(net)}
            >
              <NetworkGlyph network={net} size={16} />{PLAT_LABELS[net]}
              {!available && <span className="ds-netswitch__status">Sem conexão</span>}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
