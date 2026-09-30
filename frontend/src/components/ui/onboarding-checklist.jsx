import { useState } from 'react'
import { Icon } from './icon.jsx'

const DISMISS_KEY = 'meu-ecoo:onboarding-dismissed'

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

// variant "empty" is the whole empty workspace (never dismissible); "progress" is the dismissible checklist.
export function OnboardingChecklist({ accounts = [], posts = [], onNavigate, variant = 'progress' }) {
  const [dismissed, setDismissed] = useState(readDismissed)
  const hasPublishedOrScheduled = posts.some(post => ['published', 'publicado', 'scheduled', 'agendado'].includes(post.status))
  const steps = [
    { label: 'Conecte sua primeira rede', description: 'Escolha onde você quer publicar.', done: accounts.length > 0, page: 'integracoes', action: 'Conectar conta', icon: 'plug' },
    { label: 'Crie sua primeira publicação', description: 'Escreva o conteúdo e escolha as redes.', done: posts.length > 0, page: 'agendador', action: 'Criar post', icon: 'compose' },
    { label: 'Agende ou publique', description: 'Mantenha seu calendário sempre ativo.', done: hasPublishedOrScheduled, page: 'calendario', action: 'Ver calendário', icon: 'calendar' },
  ]
  const completed = steps.filter(step => step.done).length
  const currentIndex = steps.findIndex(step => !step.done)
  const isEmpty = variant === 'empty'

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Sem storage, o checklist some só nesta sessão.
    }
    setDismissed(true)
  }

  if (!isEmpty && dismissed) return null

  return <section className="ds-surface ds-surface--moment dash-onboard" aria-labelledby="onboarding-title">
    <div className="dash-onboard__intro">
      <p className="ds-eyebrow">Comece por aqui</p>
      <h2 className="dash-onboard__title" id="onboarding-title">
        {isEmpty ? <>Seu Início ainda está vazio</> : <>Configure seu espaço <em className="ds-em">em poucos passos.</em></>}
      </h2>
      <p className="dash-onboard__text">
        {isEmpty
          ? 'Nenhuma conta, publicação ou métrica aparece aqui até você começar a usar a plataforma. Siga os passos ao lado.'
          : 'Complete o checklist para aproveitar melhor o Meu Ecoo Mídia.'}
      </p>
      <div className="dash-onboard__progress">
        <div className="ds-progress" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={completed} aria-label={`${completed} de ${steps.length} etapas concluídas`}>
          <span className="ds-progress__bar" style={{ '--value': `${(completed / steps.length) * 100}%` }} />
        </div>
        <p className="ds-meta">{completed} de {steps.length} etapas concluídas</p>
      </div>
      {!isEmpty && <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm dash-onboard__dismiss" onClick={dismiss}>Dispensar</button>}
    </div>
    <ol className="dash-steps">
      {steps.map((step, index) => {
        const state = step.done ? 'done' : index === currentIndex ? 'current' : undefined
        return <li className="dash-step" data-state={state} key={step.label}>
          <span className="dash-step__num" aria-hidden="true">{step.done ? <Icon name="check" /> : index + 1}</span>
          <div className="dash-step__body">
            <h3 className="dash-step__title">{step.label}{step.done && <span className="ds-sr-only"> (concluído)</span>}</h3>
            <p className="dash-step__text">{step.description}</p>
          </div>
          {!step.done && <div className="dash-step__action">
            {state === 'current'
              ? <button type="button" className="ds-btn ds-btn--primary" onClick={() => onNavigate(step.page)}><Icon name={step.icon} />{step.action}</button>
              : <button type="button" className="ds-go" onClick={() => onNavigate(step.page)}>{step.action}<Icon name="arrow" /></button>}
          </div>}
        </li>
      })}
    </ol>
  </section>
}
