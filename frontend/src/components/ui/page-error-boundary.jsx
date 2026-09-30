import { Component } from 'react'
import { Icon } from './icon.jsx'

// Arquivo da página que não baixou: acontece quando uma nova versão é
// publicada enquanto a pessoa usa o app (os nomes dos arquivos mudam).
const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|Loading chunk|Failed to fetch/i

/*
 * Mantém o app de pé quando uma página quebra: em vez de uma tela em branco,
 * mostra o erro dentro da área de conteúdo, com a navegação ainda funcionando.
 * Volta ao normal sozinho quando a pessoa troca de página (resetKey).
 */
export class PageErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
    this.retry = () => this.setState({ error: null })
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidUpdate(previous) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const outdated = CHUNK_ERROR.test(String(error?.message || error))
    return <div className="ds-page" data-ds-root>
      <div className="ds-empty ds-empty--center page-error" role="alert">
        <span className="page-error__icon" aria-hidden="true"><Icon name="alertTriangle" size={22} /></span>
        <h1 className="ds-empty__title">Não foi possível abrir esta página</h1>
        <p className="ds-empty__text">
          {outdated
            ? 'O Meu Ecoo Mídia foi atualizado enquanto você usava. Recarregue para continuar de onde parou.'
            : 'Algo deu errado ao montar esta tela. Tente de novo; se continuar, recarregue a página.'}
        </p>
        <div className="ds-empty__actions">
          <button type="button" className="ds-btn ds-btn--primary" onClick={() => window.location.reload()}>Recarregar página</button>
          {!outdated && <button type="button" className="ds-btn ds-btn--secondary" onClick={this.retry}>Tentar de novo</button>}
        </div>
      </div>
    </div>
  }
}
