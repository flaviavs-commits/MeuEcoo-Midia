import { useEffect, useRef, useState } from 'react'
import { TIMELINE_POINTS, timelineFrame, timelineStepFrame, timelineSegmentPath } from './timeline-motion.js'
import '../../styles/timeline-story.css'

export { timelineFrame } from './timeline-motion.js'
export const TIMELINE_STEPS = [
  ['Conecte suas redes', 'Todos os seus perfis em um só lugar.'],
  ['Crie com sistemas inteligentes', 'Ideias e legendas com a sua cara.'],
  ['Agende tudo de uma vez', 'Sua semana inteira organizada.'],
  ['Publique automaticamente', 'Sem precisar abrir cada app.'],
  ['Acompanhe os resultados', 'Tudo em um painel só.'],
]
const TIMELINE_SOCIALS = ['instagram', 'facebook', 'tiktok', 'youtube']
const clamp = value => Math.max(0, Math.min(1, value))

function LetterText({ text }) {
  let letterIndex = 0
  return <span aria-hidden="true" style={{ '--letter-count': Array.from(text).length }}>
    {text.split(/(\s+)/).map((word, index) => {
      if (/^\s+$/.test(word)) { letterIndex += word.length; return word }
      return <span className="mkt-timeline-word" key={index}>{Array.from(word).map(letter => {
        const position = letterIndex++
        return <span className="mkt-timeline-letter" key={position} style={{ '--letter-index': position }}>{letter}</span>
      })}</span>
    })}
  </span>
}

export function TimelineStory({ BrandGlyph }) {
  const section = useRef(null), stage = useRef(null), camera = useRef(null), rail = useRef(null)
  const rows = useRef([])
  const [active, setActive] = useState(0)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    const root = section.current, viewport = stage.current
    const media = window.matchMedia?.('(max-width: 860px), (max-height: 560px), (prefers-reduced-motion: reduce)')
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const segments = [...rail.current.querySelectorAll('g')]
    let frame = 0, top = 0, travel = 1, width = 1, height = 1, simple = true, disposed = false
    let lastActive = -1, lastFocused = null, entranceObserver = null
    let displayed = null, previousTime = 0
    const drawRail = progress => segments.forEach((segment, index) => {
      segment.style.setProperty('--segment-progress', clamp(progress * segments.length - index))
    })
    const select = (current, isFocused) => {
      if (current !== lastActive) { lastActive = current; setActive(current) }
      if (isFocused !== lastFocused) { lastFocused = isFocused; setFocused(isFocused) }
    }
    const update = (time = 0) => {
      frame = 0
      if (simple || disposed) return
      const target = clamp((window.scrollY - top) / travel)
      const dt = Math.min(64, Math.max(8, time - previousTime || 16))
      previousTime = time
      displayed = displayed === null ? target : displayed + (target - displayed) * (1 - Math.exp(-dt / 100))
      if (Math.abs(displayed - target) < .00002) displayed = target
      const pose = timelineFrame(displayed)
      camera.current.style.transform = `translate3d(${-pose.x * width * pose.zoom}px, ${-pose.y * height * pose.zoom}px, 0) scale(${pose.zoom})`
      select(Math.round(pose.focus), pose.strength > .65)
      drawRail(pose.focus / (TIMELINE_STEPS.length - 1))
      root.style.setProperty('--timeline-heading-opacity', clamp(1 - displayed * 18))
      rows.current.forEach((row, index) => {
        const step = timelineStepFrame(displayed, index)
        row.style.setProperty('--step-presence', step.presence)
        row.style.setProperty('--title-reveal', step.title)
        row.style.setProperty('--description-reveal', step.description)
        row.style.setProperty('--marker-scale', 1 + step.emphasis * .1)
      })
      const lastStep = timelineStepFrame(displayed, TIMELINE_STEPS.length - 1)
      // The dashboard is a final-step insert, not part of the overview. Keep
      // it binary so it never becomes a translucent layer over steps 1–4
      // while the camera is still travelling toward the final close-up.
      const dashboardVisible = pose.focus >= 3.9 && pose.strength > .65 && lastStep.description >= .72
      root.style.setProperty('--dashboard-presence', dashboardVisible ? '1' : '0')
      if (displayed !== target) frame = requestAnimationFrame(update)
    }
    const request = () => { if (!frame && !simple && !disposed) frame = requestAnimationFrame(update) }
    const measure = () => {
      if (disposed) return
      simple = !media || media.matches
      root.dataset.motion = simple ? 'simple' : 'full'
      entranceObserver?.disconnect()
      const inset = parseFloat(getComputedStyle(viewport).top) || 0
      top = root.getBoundingClientRect().top + window.scrollY - inset
      travel = Math.max(1, root.offsetHeight - viewport.offsetHeight)
      width = viewport.clientWidth; height = viewport.clientHeight
      displayed = null
      root.style.setProperty('--timeline-copy-width', `${width * .29}px`)
      root.style.setProperty('--timeline-copy-gap', `${Math.max(42, width * .045)}px`)
      const sceneWidth = camera.current.clientWidth || width
      const sceneHeight = camera.current.clientHeight || height
      const points = simple ? rows.current.map(row => {
        const marker = row.querySelector('.mkt-timeline-number')
        return { x: marker.offsetLeft, y: row.offsetTop + marker.offsetTop }
      }) : TIMELINE_POINTS.map(point => ({ x: point.x * width, y: point.y * height }))
      rail.current.setAttribute('viewBox', `0 0 ${sceneWidth} ${sceneHeight}`)
      segments.forEach((segment, index) => {
        const path = timelineSegmentPath(points[index], points[index + 1])
        segment.querySelectorAll('path').forEach(node => node.setAttribute('d', path))
      })
      if (simple) {
        camera.current.style.transform = ''
        root.style.setProperty('--dashboard-presence', '1')
        rows.current.forEach(row => {
          for (const name of ['--step-presence', '--title-reveal', '--description-reveal', '--marker-scale']) row.style.removeProperty(name)
        })
        select(0, false)
        const entranceEnabled = !reducedMotion?.matches && typeof IntersectionObserver !== 'undefined'
        root.dataset.entrance = String(entranceEnabled)
        drawRail(entranceEnabled ? 0 : 1)
        if (entranceEnabled) {
          entranceObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
              if (!entry.isIntersecting) return
              entry.target.dataset.revealed = 'true'
              const index = rows.current.indexOf(entry.target)
              select(index, false)
              drawRail(index / (TIMELINE_STEPS.length - 1))
            })
          }, { threshold: .55 })
          rows.current.forEach(row => entranceObserver.observe(row))
        }
      } else {
        delete root.dataset.entrance
        root.style.setProperty('--dashboard-presence', '0')
        request()
      }
    }
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(root); observer?.observe(viewport)
    window.addEventListener('scroll', request, { passive: true })
    window.addEventListener('resize', measure)
    media?.addEventListener('change', measure)
    reducedMotion?.addEventListener('change', measure)
    document.fonts?.ready.then(() => { if (!disposed) measure() })
    measure()
    return () => {
      disposed = true
      cancelAnimationFrame(frame); observer?.disconnect(); entranceObserver?.disconnect()
      window.removeEventListener('scroll', request); window.removeEventListener('resize', measure)
      media?.removeEventListener('change', measure)
      reducedMotion?.removeEventListener('change', measure)
    }
  }, [])

  return <section ref={section} className="mkt-timeline" aria-label="Sua jornada em cinco passos">
    <div ref={stage} className="mkt-timeline-stage">
      <header className="mkt-timeline-heading"><p className="mkt-eyebrow">Como funciona</p><h2>Do primeiro rascunho<br />ao <em>resultado.</em></h2></header>
      <a className="mkt-timeline-skip" href="#planos">Ir para planos <span aria-hidden="true">↗</span></a>
      <div ref={camera} className="mkt-timeline-camera">
        <svg ref={rail} className="mkt-timeline-rail" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
          {TIMELINE_POINTS.slice(1).map((point, index) => {
            const from = TIMELINE_POINTS[index]
            const path = timelineSegmentPath({ x: from.x * 1000, y: from.y * 1000 }, { x: point.x * 1000, y: point.y * 1000 })
            return <g key={index}><path className="mkt-timeline-rail-track" d={path} /><path className="mkt-timeline-rail-progress" d={path} pathLength="1" /></g>
          })}
        </svg>
        {TIMELINE_STEPS.map(([title, description], index) => <article key={title} ref={node => { rows.current[index] = node }}
          className={`mkt-timeline-step mkt-timeline-step--${index % 2 ? 'right' : 'left'}`}
          style={{ '--step-x': `${TIMELINE_POINTS[index].x * 100}%`, '--step-y': `${TIMELINE_POINTS[index].y * 100}%` }}
          aria-current={active === index ? 'step' : undefined}
          aria-hidden={focused && active !== index ? true : undefined} inert={focused && active !== index ? true : undefined}>
          <span className="mkt-timeline-number" aria-label={`Etapa ${index + 1}`}>{index + 1}</span>
          <div className="mkt-timeline-step-copy">
            <h3 aria-label={title}><LetterText text={title} /></h3>
            <p><span className="mkt-timeline-sr">{description}</span><LetterText text={description} /></p>
          </div>
        </article>)}
      </div>
      <div className="mkt-timeline-dashboard" aria-hidden="true">
        <div className="mkt-timeline-dashboard-head"><span className="mkt-timeline-dashboard-kicker"><i />Painel final</span><span className="mkt-timeline-dashboard-period">Visão geral</span></div>
        <div className="mkt-timeline-dashboard-title"><strong>Resultado em um só lugar.</strong><span>O que você publicou começa a voltar em dados.</span></div>
        <div className="mkt-timeline-dashboard-metrics"><span><b>+38%</b><small>alcance</small></span><span><b>12</b><small>publicados</small></span><span><b>4</b><small>redes</small></span></div>
        <div className="mkt-timeline-dashboard-chart">
          <svg viewBox="0 0 360 108" role="presentation" aria-hidden="true">
            <defs><linearGradient id="mkt-timeline-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--mkt-gold)" stopOpacity=".36" /><stop offset="1" stopColor="var(--mkt-gold)" stopOpacity="0" /></linearGradient></defs>
            <path className="mkt-chart-area" d="M0 88 C28 78 39 82 62 69 S101 78 123 55 S162 64 183 44 S221 56 241 34 S277 46 300 22 S333 30 360 8 V108 H0 Z" />
            <path className="mkt-chart-line" d="M0 88 C28 78 39 82 62 69 S101 78 123 55 S162 64 183 44 S221 56 241 34 S277 46 300 22 S333 30 360 8" />
            {[0, 62, 123, 183, 241, 300, 360].map((x, index) => <circle key={x} className="mkt-chart-dot" cx={x} cy={[88, 69, 55, 44, 34, 22, 8][index]} r="3.2" />)}
          </svg>
        </div>
        <div className="mkt-timeline-dashboard-legend">{TIMELINE_SOCIALS.map(name => <span key={name}><BrandGlyph name={name} size={16} /><label>{name[0].toUpperCase() + name.slice(1)}</label><i aria-hidden="true" /></span>)}</div>
      </div>
    </div>
  </section>
}
