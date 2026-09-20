import { render, screen, fireEvent, within } from '@testing-library/react'
import { LandingPage } from '../../src/pages/landing-page.jsx'
import { PLANS } from '../../src/lib/plans.js'

describe('LandingPage', () => {
  it('leads with the product promise and keeps pricing below the explanation', () => {
    const { container } = render(<LandingPage />)
    const hero = screen.getByRole('region', { name: /^sua rotina\s*nas redes,\s*resolvida\.$/i })
    expect(hero).toHaveTextContent('resolvida.')
    expect(hero.textContent).not.toMatch(/planos|preços|R\$/i)
    expect(within(hero).getByRole('link', { name: /Veja como funciona/ })).toHaveAttribute('href', '#sobre')
    expect(hero).toHaveTextContent('Centralize suas redes sociais, organize publicações, automatize tarefas e acompanhe seus resultados em um só lugar.')
    expect(hero.querySelector('.mkt-hero-benefits')).not.toBeInTheDocument()
    expect(container.querySelector('.mkt-scrollcue')).not.toBeInTheDocument()
    expect(container.querySelector('.mkt-stage')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\bIA\b|artificial/i)
    const about = screen.getByRole('region', { name: /A central da sua rotina/i })
    expect(about).toHaveTextContent(/plataforma para planejar, criar, agendar/i)
    expect(about.querySelectorAll('.mkt-about-flow-item')).toHaveLength(3)
    const sections = [...container.querySelectorAll('main > section')].map(section => section.id)
    expect(sections.indexOf('sobre')).toBeGreaterThan(-1)
    expect(sections.indexOf('recursos')).toBeLessThan(sections.indexOf('sobre'))
    expect(sections.indexOf('sobre')).toBeLessThan(sections.indexOf('planos'))
    expect(sections).not.toContain('como-funciona')
    expect(sections.indexOf('planos')).toBeGreaterThan(sections.indexOf('recursos'))
    const plansRegion = screen.getByRole('region', { name: /escolha o plano ideal/i })
    expect(plansRegion.querySelectorAll('.mkt-plan')).toHaveLength(3)
    expect(plansRegion.querySelectorAll('.mkt-plans-network-icons > span')).toHaveLength(4)
    expect(plansRegion.querySelector('.mkt-plan-assurance')).not.toBeInTheDocument()
    for (const plan of Object.values(PLANS)) {
      expect(container.querySelector(`a[href="/criar-conta?plan=${plan.id}"]`)).toBeInTheDocument()
      expect(screen.getByText(plan.price)).toBeInTheDocument()
    }
  })

  it('shows the five-step journey without product mockups or the old footer controls', () => {
    render(<LandingPage />)
    const timeline = screen.getByRole('region', { name: 'Sua jornada em cinco passos' })

    expect(timeline).toHaveClass('mkt-timeline')
    expect(within(timeline).getAllByRole('article')).toHaveLength(5)
    expect(timeline.querySelector('.mkt-timeline-footer')).not.toBeInTheDocument()
    expect(within(timeline).getByRole('link', { name: /Ir para planos/ })).toHaveAttribute('href', '#planos')
    expect(timeline.querySelector('.mkt-timeline-rail')).toBeInTheDocument()
    expect(timeline.querySelectorAll('.story-hero')).toHaveLength(0)
    expect(timeline.querySelectorAll('.mkt-timeline-social')).toHaveLength(0)
    expect(timeline.querySelector('.mkt-timeline-camera .mkt-timeline-socials')).not.toBeInTheDocument()
    expect(timeline.textContent).not.toMatch(/café|aurora|nativa|sem lactose|12,4k|8,1%|LinkedIn|Pinterest/i)
    expect(within(timeline).getByRole('heading', { name: 'Crie com sistemas inteligentes' })).toBeInTheDocument()
    expect([...timeline.querySelectorAll('article')].at(-1)).toHaveTextContent('Acompanhe os resultados')
  })

  it('opens the mobile navigation and closes it after choosing a section or pressing Escape', () => {
    render(<LandingPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }))
    expect(screen.getByRole('button', { name: 'Fechar menu' })).toHaveAttribute('aria-expanded', 'true')
    const primaryNav = screen.getByRole('navigation', { name: 'Navegação principal' })
    fireEvent.click(within(primaryNav).getByRole('link', { name: 'O que você ganha' }))
    expect(screen.getByRole('button', { name: 'Abrir menu' })).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Abrir menu' })).toHaveAttribute('aria-expanded', 'false')
  })
})
