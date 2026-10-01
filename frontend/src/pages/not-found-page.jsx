import { Icon } from '../components/ui/icon.jsx'

// /app/<algo que não existe>: diz isso e oferece o caminho de volta, em vez de abrir o Início calado.
export function NotFoundPage({ onNavigate }) {
  return <div className="ds-page" data-ds-root>
    <div className="ds-empty ds-empty--center" role="status">
      <span className="ds-icontile ds-icontile--lg" aria-hidden="true"><Icon name="search" /></span>
      <h1 className="ds-empty__title">Página não encontrada</h1>
      <p className="ds-empty__text">O endereço não leva a nenhuma área do Meu Ecoo Mídia. Ele pode ter mudado ou ter sido digitado com algum erro.</p>
      <div className="ds-empty__actions">
        <button type="button" className="ds-btn ds-btn--primary" onClick={() => onNavigate('dashboard')}><Icon name="home" size={16} />Ir para o Início</button>
        <button type="button" className="ds-btn ds-btn--secondary" onClick={() => onNavigate('agendador')}>Criar um post</button>
      </div>
    </div>
  </div>
}
