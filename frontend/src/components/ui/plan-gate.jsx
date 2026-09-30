import { getPlan, minimumPlanForModule } from '../../lib/plans.js'
import { Icon } from './icon.jsx'

const MODULE_LABELS = {
  rascunhos: 'Baú de Ideias',
  ai: 'Assistente inteligente',
  biblioteca: 'Sua biblioteca de mídia',
  filas: 'Repetidor de posts',
  smartlinks: 'Smartlinks',
  equipe: 'Equipe e aprovações',
  relatorios: 'Relatórios avançados',
}

export function PlanGate({ currentPlan, moduleName, planActive = true }) {
  const current = getPlan(currentPlan)
  const required = minimumPlanForModule(moduleName)
  const label = MODULE_LABELS[moduleName] || 'Este módulo'
  const paymentPending = planActive === false

  return <div className="ds-page gate" data-ds-root>
    <section className="gate-well" aria-labelledby="gate-title">
      <span className="gate-icon" aria-hidden="true"><Icon name={paymentPending ? 'lock' : 'crown'} size={26} /></span>
      <p className="ds-eyebrow">{paymentPending ? 'Pagamento pendente' : `Recurso do plano ${required.name}`}</p>
      <h1 className="gate-title" id="gate-title">{paymentPending ? 'Escolha um plano para começar' : label}</h1>
      <p className="gate-text">{paymentPending ? 'Seu perfil está pronto. Escolha o plano Básico, Pro ou Premium e conclua o pagamento para liberar os recursos da plataforma.' : `O plano ${current.name} não inclui este recurso. Faça upgrade para o plano ${required.name} e libere ${label.toLowerCase()}.`}</p>
      <a className="ds-btn ds-btn--primary" href="/app/perfil">{paymentPending ? 'Escolher plano' : 'Conhecer os planos'}<Icon name="arrow" size={16} /></a>
    </section>
  </div>
}
