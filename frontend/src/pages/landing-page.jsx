import { useEffect, useRef, useState } from 'react'
import { PLANS } from '../lib/plans.js'
import { CopyrightNotice } from '../components/ui/copyright-notice.jsx'
import { TimelineStory } from '../components/marketing/timeline-story.jsx'
import logo from '../../../public/logo.png'
import heroPhone from '../../../public/ecoo-phone-premium-remastered-v2.png'

const socials = [
  ['instagram', 'Instagram'],
  ['facebook', 'Facebook'],
  ['tiktok', 'TikTok'],
  ['youtube', 'YouTube'],
]

const planCardHighlights = {
  basico: ['Agendamento de conteúdos', 'Gerenciamento de mídia', 'Relatórios essenciais', 'Suporte por e-mail'],
  pro: ['Agendamento e publicações recorrentes', 'Gerenciamento de mídia e rascunhos', 'Relatórios completos', 'Mais automações', 'Suporte prioritário'],
  premium: ['Todas as funcionalidades do Pro', 'Relatórios avançados', 'Mais limites e recursos', 'Suporte em horário estendido'],
}

function Icon({ name, size = 22 }) {
  const paths = {
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    arrowUp: <><path d="M12 19V5" /><path d="m6 11 6-6 6 6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 10h18M8 14h3M8 17h6" /></>,
    sparkle: <path d="m12 3-2.5 6.5L3 12l6.5 2.5L12 21l2.5-6.5L21 12l-6.5-2.5L12 3Z" />,
    repeat: <><path d="M4 10a8 8 0 0 1 14-5l2 2M20 3v4h-4M20 14A8 8 0 0 1 6 19l-2-2M4 21v-4h4" /></>,
    chart: <><path d="M4 4v16h16M8 15v-4M13 15V7M18 15v-6" /></>,
    message: <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l1.5-4A8.5 8.5 0 1 1 21 11.5Z" />,
    link: <><path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-5-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 5 6l-4 4a4 4 0 0 1-6 0" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>,
    share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></>,
    user: <><circle cx="12" cy="7.5" r="3.6" /><path d="M18.5 20v-1.2a3.8 3.8 0 0 0-3.8-3.8H9.3a3.8 3.8 0 0 0-3.8 3.8V20" /></>,
    login: <><path d="M14 3h4.5A1.5 1.5 0 0 1 20 4.5v15a1.5 1.5 0 0 1-1.5 1.5H14" /><path d="m10 8 4 4-4 4" /><path d="M14 12H3.5" /></>,
    userPlus: <><circle cx="9.5" cy="8" r="3.4" /><path d="M4 19.5a5.5 5.5 0 0 1 11 0" /><path d="M18.5 8v6M15.5 11h6" /></>,
    card: <><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20" /></>,
    heart: <path d="M12 20s-7-4.5-9.5-9A5 5 0 0 1 12 6a5 5 0 0 1 9.5 5C19 15.5 12 20 12 20Z" />,
    comment: <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l1.5-4A8.5 8.5 0 1 1 21 11.5Z" />,
    send: <path d="m22 2-7 20-4-9-9-4Z" />,
    bookmark: <path d="M6 3h12v18l-6-4-6 4Z" />,
    dots: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
    cube: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>,
    crown: <><path d="m3 7 4.5 4L12 4l4.5 7L21 7l-1.5 11h-15L3 7Z" /><path d="M5 21h14" /></>,
    tag: <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3.4 13.4a2 2 0 0 1-.6-1.4V5a2 2 0 0 1 2-2h7a2 2 0 0 1 1.4.6l7.4 7.4a2 2 0 0 1 0 2.4Z" /><circle cx="7.5" cy="7.5" r="1.2" /></>,
    bolt: <path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" />,
    shield: <path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z" />,
    headphones: <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><path d="M4 14h3v6H5a1 1 0 0 1-1-1v-5ZM20 14h-3v6h2a1 1 0 0 0 1-1v-5Z" /></>,
    rocket: <><path d="M12 2.5c3 2.4 4.6 5.8 4.6 9.6l-1.8 2.4H9.2L7.4 12.1c0-3.8 1.6-7.2 4.6-9.6Z" /><circle cx="12" cy="9.3" r="1.7" /><path d="M9.2 14.5 7 16.2c-1 .8-1.5 2-1.5 3.3 1.3 0 2.5-.5 3.3-1.4l1.4-1.6M14.8 14.5l2.2 1.7c1 .8 1.5 2 1.5 3.3-1.3 0-2.5-.5-3.3-1.4l-1.4-1.6" /></>,
    bulb: <><path d="M9.2 17h5.6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3Z" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6v.3" /><circle cx="12" cy="17" r=".8" fill="currentColor" /></>,
    bars: <><path d="M5 20v-6M12 20V8M19 20v-9" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function BrandGlyph({ name, size = 20 }) {
  const marks = {
    instagram: <><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" /><circle cx="12" cy="12" r="4.6" /><circle cx="17.4" cy="6.6" r="1.3" /></>,
    tiktok: <path d="M14 3c.4 2.6 2 4.2 4.6 4.5v3c-1.7.1-3.2-.4-4.6-1.3v6.1a5.8 5.8 0 1 1-5.8-5.8c.3 0 .6 0 .9.1v3.1a2.8 2.8 0 1 0 2 2.7V3H14Z" />,
    facebook: <path d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.6-1.5H16.5V5c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4V11H7.5v3h2.6v7h3.4Z" />,
    youtube: <><rect x="2.5" y="5.5" width="19" height="13" rx="4" /><path d="M10.5 9.3v5.4l4.6-2.7-4.6-2.7Z" /></>,
  }
  const filled = name === 'tiktok' || name === 'facebook'
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{marks[name]}</svg>
}

const PLAN_ICON_NAMES = { basico: 'cube', pro: 'bars', premium: 'crown' }

function Brand() {
  return <a className="mkt-brand" href="/" aria-label="Meu Ecoo Mídia — início"><img src={logo} alt="Meu Ecoo Mídia" /></a>
}

function AccountMenu() {
  return <div className="mkt-account">
    <input type="checkbox" aria-label="Abrir menu de conta" />
    <span className="mkt-account-btn" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2c2.757 0 5 2.243 5 5.001 0 2.756-2.243 5-5 5s-5-2.244-5-5c0-2.758 2.243-5.001 5-5.001zm0-2c-3.866 0-7 3.134-7 7.001 0 3.865 3.134 7 7 7s7-3.135 7-7c0-3.867-3.134-7.001-7-7.001zm6.369 13.353c-.497.498-1.057.931-1.658 1.302 2.872 1.874 4.378 5.083 4.972 7.346h-19.387c.572-2.29 2.058-5.503 4.973-7.358-.603-.374-1.162-.811-1.658-1.312-4.258 3.072-5.611 8.506-5.611 10.669h24c0-2.142-1.44-7.557-5.631-10.647z" />
      </svg>
    </span>
    <nav className="mkt-account-menu" aria-label="Conta">
      <span className="mkt-account-title">Sua conta</span>
      <ul>
        <li><a href="/login.html"><span className="mkt-account-ic"><Icon name="login" size={17} /></span><span>Entrar</span></a></li>
        <li><a className="is-primary" href="/criar-conta"><span className="mkt-account-ic"><Icon name="userPlus" size={17} /></span><span>Criar conta grátis</span><Icon name="arrow" size={15} /></a></li>
      </ul>
      <p className="mkt-account-foot">Sem cartão de crédito.</p>
    </nav>
  </div>
}

function HandCircleCallout() {
  const ref = useRef(null)
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const prefersReduced = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced || typeof IntersectionObserver !== 'function') {
      setDrawn(true)
      return
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting)) {
        setDrawn(true)
        observer.disconnect()
      }
    }, { threshold: 0.6 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return <div ref={ref} className={`mkt-callout${drawn ? ' is-drawn' : ''}`} aria-hidden="true">
    <span className="mkt-callout-text">4 redes<br />em um só<br />lugar!</span>
    <svg className="mkt-callout-mark" viewBox="0 0 300 210" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path className="mkt-callout-ring" pathLength="1" d="M70 55C41 70 33 120 55 158c24 41 96 48 158 36 47-9 78-44 74-86-4-41-58-63-118-58-38 3-71 14-90 33" />
      <path className="mkt-callout-ring mkt-callout-ring--2" pathLength="1" d="M63 78C46 104 52 143 88 165c40 24 108 22 160-2 41-19 55-58 38-92-16-32-70-45-128-38-40 5-73 20-90 43" />
      <path className="mkt-callout-arrow" pathLength="1" d="M96 178c-14 12-22 27-24 44m0 0 16-13m-16 13-4-20" />
    </svg>
  </div>
}

function HeroStage() {
  return <div className="mkt-stage mkt-stage--render" onDragStart={event => event.preventDefault()}>
    <span className="mkt-stage-grid" aria-hidden="true" />
    <span className="mkt-stage-orbit mkt-stage-orbit--one" aria-hidden="true" />
    <span className="mkt-stage-orbit mkt-stage-orbit--two" aria-hidden="true" />
    <img className="mkt-hero-render" src={heroPhone} width={1122} height={1402}
      alt="Celular Ecoo Mídia com publicações para Instagram, Facebook, TikTok e YouTube em um só lugar."
      fetchPriority="high" decoding="async" draggable={false} onDragStart={event => event.preventDefault()} />
  </div>
}

function Plans() {
  return <section className="mkt-section mkt-container" id="planos" aria-labelledby="plans-title">
    <div className="mkt-plans-head">
      <div className="mkt-section-head"><p className="mkt-eyebrow">Planos</p><h2 id="plans-title">Escolha o plano ideal<br />para o <em>seu momento.</em></h2><p>Conecte, gerencie e multiplique os resultados das suas redes sociais.</p></div>
      <div className="mkt-plans-networks" aria-label="Redes sociais integradas">
        <div className="mkt-plans-network-icons">{socials.map(([name, label]) => <span key={name} title={label}><BrandGlyph name={name} size={28} /></span>)}</div>
        <p>Gerencie todas as suas redes em um só lugar.</p>
      </div>
    </div>
    <div className="mkt-plans">{Object.values(PLANS).map(plan => <article className={`mkt-plan mkt-plan--${plan.id}${plan.id === 'pro' ? ' mkt-plan--featured' : ''}`} key={plan.id}>
      {plan.id === 'pro' && <span className="mkt-plan-badge"><Icon name="crown" size={15} />Mais escolhido</span>}
      <div className="mkt-plan-heading"><span className="mkt-plan-icon"><Icon name={PLAN_ICON_NAMES[plan.id]} size={27} /></span><div className="mkt-plan-heading-copy"><h3>{plan.name.replace('EcooMidia ', '')}</h3><p>Até {plan.maxConnections} canais à sua escolha</p></div></div>
      <p className="mkt-price"><strong>{plan.price}</strong><span>/ {plan.cadence.replace(/^por\s+/i, '')}</span></p>
      <ul className="mkt-plan-highlights">{planCardHighlights[plan.id].map(highlight => <li key={highlight}><Icon name="check" size={18} />{highlight}</li>)}</ul>
      <a className={`mkt-button ${plan.id === 'pro' ? 'mkt-button--primary' : plan.id === 'premium' ? 'mkt-button--premium' : 'mkt-button--outline'}`} href={`/criar-conta?plan=${plan.id}`}>Escolher {plan.name.replace('EcooMidia ', '')}<Icon name="arrow" size={18} /></a>
    </article>)}</div>
  </section>
}

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    const closeOnEscape = event => { if (event.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])

  return <div className="marketing-page">
    <a className="mkt-skip" href="#conteudo">Pular para o conteúdo</a>
    <header className="mkt-header"><nav className="mkt-nav mkt-container" aria-label="Navegação principal">
      <Brand />
      <div id="mkt-navigation" className={`mkt-nav-links${menuOpen ? ' is-open' : ''}`}>
       <a className="is-active" href="#conteudo" onClick={() => setMenuOpen(false)}><Icon name="home" size={18} />Início</a>
       <a href="#sobre" onClick={() => setMenuOpen(false)}><Icon name="bulb" size={18} />O que você ganha</a>
       <a href="#recursos" onClick={() => setMenuOpen(false)}><Icon name="help" size={18} />Como funciona</a>
      </div>
      <AccountMenu />
      <button className="mkt-menu" type="button" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menuOpen} aria-controls="mkt-navigation" onClick={() => setMenuOpen(value => !value)}><Icon name={menuOpen ? 'close' : 'menu'} /></button>
    </nav></header>
    <main id="conteudo">
      <section className="mkt-hero mkt-container" aria-labelledby="hero-title">
        <div className="mkt-hero-copy">
          <p className="mkt-hero-kicker"><span>Planeje</span><i aria-hidden="true" /><span>Publique</span><i aria-hidden="true" /><span>Acompanhe</span></p>
          <h1 id="hero-title">Sua rotina<br />nas redes,<br /><em>resolvida.</em></h1>
          <p className="mkt-hero-sub">Centralize suas redes sociais, organize publicações, automatize tarefas e acompanhe seus resultados em um só lugar.</p>
          <div className="mkt-hero-actions">
            <a className="mkt-button mkt-button--outline mkt-button--lg" href="#sobre">Veja como funciona <Icon name="arrow" size={18} /></a>
          </div>
        </div>
        <HeroStage />
      </section>
      <section className="mkt-section mkt-container mkt-resources" id="recursos" aria-labelledby="features-title">
        <h2 id="features-title" className="mkt-timeline-sr">Sua jornada nas redes</h2>
        <TimelineStory BrandGlyph={BrandGlyph} />
      </section>
      <section className="mkt-about" id="sobre" aria-labelledby="about-title">
        <div className="mkt-container mkt-about-inner">
          <div className="mkt-about-head">
            <div>
              <p className="mkt-eyebrow">O que é a Ecoo Mídia?</p>
              <h2 id="about-title">A central da sua rotina<br /><em>nas redes.</em></h2>
            </div>
            <div className="mkt-about-lead">
              <p>A Ecoo Mídia é uma plataforma para planejar, criar, agendar e acompanhar conteúdos para suas redes sociais em um só lugar.</p>
              <p>Em vez de alternar entre vários aplicativos e planilhas, você organiza cada etapa da operação, publica com mais consistência e entende o que está funcionando.</p>
            </div>
          </div>
          <div className="mkt-about-flow" aria-label="Como a Ecoo Mídia funciona">
            <div className="mkt-about-flow-item">
              <span>01</span>
              <div><strong>Conecte suas redes</strong><p>Reúna Instagram, Facebook, TikTok e YouTube no mesmo fluxo.</p></div>
            </div>
            <div className="mkt-about-flow-item">
              <span>02</span>
              <div><strong>Organize o conteúdo</strong><p>Transforme ideias em posts, rascunhos e uma agenda clara.</p></div>
            </div>
            <div className="mkt-about-flow-item">
              <span>03</span>
              <div><strong>Publique e acompanhe</strong><p>Deixe a rotina programada e veja os resultados em um painel.</p></div>
            </div>
          </div>
        </div>
      </section>
      <Plans />
      <section className="mkt-faq mkt-container" aria-labelledby="faq-title">
        <div className="mkt-faq-inner">
          <div className="mkt-section-head"><p className="mkt-eyebrow">Perguntas frequentes</p><h2 id="faq-title">Ficou alguma dúvida?</h2><p className="mkt-faq-intro">Respostas rápidas para você começar a organizar suas redes com tranquilidade.</p></div>
          <div className="mkt-faq-list">
          <details><summary>As publicações saem automaticamente?</summary><p>Sim. Depois de revisar o conteúdo, escolher as redes e agendar, o sistema envia a publicação no horário definido. Você acompanha o status pelo painel.</p></details>
          <details><summary>Preciso criar tudo do zero?</summary><p>Não. Use sugestões do sistema inteligente, reaproveite arquivos da biblioteca e transforme rascunhos em novas publicações.</p></details>
          <details><summary>Posso revisar antes de publicar?</summary><p>Sim. Você confere os textos e as mídias de cada rede e escolhe quando publicar.</p></details>
          <details><summary>Quais redes posso conectar?</summary><p>Instagram, TikTok, Facebook e YouTube, sempre pela autorização oficial de cada plataforma. O número de conexões depende do seu plano.</p></details>
          <details><summary>Preciso de cartão de crédito para testar?</summary><p>Não. A conta gratuita libera o essencial para você experimentar o fluxo completo antes de decidir.</p></details>
          </div>
        </div>
      </section>
    </main>
    <footer className="mkt-footer"><div className="mkt-container">
      <div className="mkt-footer-top">
        <div className="mkt-footer-brand"><Brand /><p>Menos tempo nas tarefas. Mais tempo nas ideias.</p><p className="mkt-footer-networks">{socials.map(([key, label]) => <span key={key}><BrandGlyph name={key} size={16} />{label}</span>)}</p></div>
        <div className="mkt-footer-cols">
          <nav aria-label="Produto"><strong>Produto</strong><a href="#recursos">Recursos</a><a href="#recursos">Como funciona</a><a href="#planos">Preços</a></nav>
          <nav aria-label="Conta"><strong>Conta</strong><a href="/criar-conta">Criar conta</a><a href="/login.html">Entrar</a></nav>
          <nav aria-label="Suporte"><strong>Suporte</strong><a href="mailto:suporte@meuecoomidia.com.br">Fale com a gente</a><a href="/terms-of-service.html">Termos de uso</a><a href="/privacy-policy.html">Privacidade</a></nav>
        </div>
      </div>
      <CopyrightNotice />
    </div></footer>
  </div>
}
