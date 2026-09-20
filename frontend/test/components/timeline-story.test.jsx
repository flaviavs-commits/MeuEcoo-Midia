import { TIMELINE_POINTS, timelineFrame, timelineStepFrame, timelineSegmentPath } from '../../src/components/marketing/timeline-motion.js'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { TimelineStory, TIMELINE_STEPS } from '../../src/components/marketing/timeline-story.jsx'

describe('timeline camera', () => {
  it('returns to the overview at both ends and holds a close-up on all five milestones', () => {
    expect(timelineFrame(0)).toMatchObject({ zoom: 1, x: 0, y: 0 })
    expect(timelineFrame(1)).toMatchObject({ zoom: 1, x: 0, y: 0 })
    for (let i = 0; i < 5; i++) {
      const f = timelineFrame((i + 1.2) / 6)
      expect(f.focus).toBe(i)
      expect(f.zoom).toBeGreaterThan(1.68)
      expect(f.x).toBeCloseTo(i % 2 ? .255 : -.255)
      expect(f.y).toBeCloseTo(TIMELINE_POINTS[i].y - .5)
      expect(timelineStepFrame((i + 1.2) / 6, i)).toMatchObject({ presence: 1, title: 1, description: 1 })
    }
  })

  it('pulls back between every pair of steps without discontinuities or reversing the route', () => {
    expect(timelineFrame(.01).zoom).toBeGreaterThan(1)
    for (let i = 0; i < 4; i++) {
      expect(timelineFrame((i + 1.5) / 6).zoom).toBeLessThan(1.1)
      expect(timelineStepFrame((i + 1.5) / 6, i).presence).toBe(0)
      expect(timelineStepFrame((i + 1.5) / 6, i + 1).presence).toBe(0)
    }
    let previous = timelineFrame(0)
    for (let n = 1; n <= 1000; n++) {
      const next = timelineFrame(n / 1000)
      expect(next.focus).toBeGreaterThanOrEqual(previous.focus)
      expect(Math.abs(next.x - previous.x)).toBeLessThan(.015)
      expect(Math.abs(next.zoom - previous.zoom)).toBeLessThan(.04)
      previous = next
    }
  })

  it('reveals letters progressively, finishes the subtitle, and only then leaves each close-up', () => {
    for (let i = 0; i < 5; i++) {
      const arriving = timelineStepFrame((i + .74) / 6, i)
      const writing = timelineStepFrame((i + .90) / 6, i)
      const reading = timelineStepFrame((i + 1.20) / 6, i)
      const leaving = timelineStepFrame((i + 1.4) / 6, i)
      expect(arriving.title).toBe(0)
      expect(writing.title).toBeGreaterThan(0)
      expect(writing.title).toBeLessThan(1)
      expect(writing.description).toBe(0)
      expect(reading).toMatchObject({ title: 1, description: 1, presence: 1 })
      expect(leaving.presence).toBeLessThan(reading.presence)
      expect(timelineStepFrame((i + .90) / 6, i)).toEqual(writing)
    }
  })

  it('connects the alternating marker centers with rounded turns at any viewport size', () => {
    for (const [width, height] of [[861, 485], [1440, 824], [1600, 1004]]) {
      const points = TIMELINE_POINTS.map(point => ({ x: point.x * width, y: point.y * height }))
      for (let i = 0; i < points.length - 1; i++) {
        const from = points[i], to = points[i + 1]
        const path = timelineSegmentPath(from, to)
        expect(path.startsWith(`M ${from.x} ${from.y} `)).toBe(true)
        expect(path.endsWith(`L ${to.x} ${to.y}`)).toBe(true)
        expect(path).toContain(' Q ')
        expect(Math.sign(to.x - from.x)).toBe(i % 2 ? -1 : 1)
      }
    }
  })
})

describe('timeline scroll and motion preference', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.scrollY = 0 })

  it('focuses every step in both scroll directions and exposes all text when reduced motion is enabled', () => {
    const callbacks = new Set()
    const compact = { matches: false, addEventListener: (_, fn) => callbacks.add(fn), removeEventListener: (_, fn) => callbacks.delete(fn) }
    const reduced = { ...compact }
    vi.stubGlobal('matchMedia', query => query === '(prefers-reduced-motion: reduce)' ? reduced : compact)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1280)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
      return this.classList.contains('mkt-timeline') ? 6000 : 800
    })
    let id = 0, time = 0
    const frames = new Map()
    vi.stubGlobal('requestAnimationFrame', fn => { frames.set(++id, fn); return id })
    vi.stubGlobal('cancelAnimationFrame', frame => frames.delete(frame))
    const settle = () => {
      for (let count = 0; frames.size && count < 240; count++) {
        const pending = [...frames.values()]
        frames.clear(); time += 16
        pending.forEach(fn => fn(time))
      }
      expect(frames.size).toBe(0)
    }
    const { unmount } = render(<TimelineStory BrandGlyph={() => null} />)
    const region = screen.getByRole('region', { name: 'Sua jornada em cinco passos' })
    expect(region).toHaveAttribute('data-motion', 'full')
    for (const index of [0, 1, 2, 3, 4, 3, 2, 1, 0]) {
      act(() => {
        window.scrollY = (index + 1.2) / 6 * 5200
        fireEvent.scroll(window); settle()
      })
      const visibleStep = within(region).getByRole('article')
      expect(visibleStep).toHaveAttribute('aria-current', 'step')
      expect(within(visibleStep).getByRole('heading', { name: TIMELINE_STEPS[index][0] })).toBeInTheDocument()
      expect(visibleStep.style.getPropertyValue('--title-reveal')).toBe('1')
      expect(visibleStep.style.getPropertyValue('--description-reveal')).toBe('1')
    }
    act(() => {
      compact.matches = true; reduced.matches = true
      callbacks.forEach(fn => fn()); settle()
    })
    expect(region).toHaveAttribute('data-motion', 'simple')
    expect(region).toHaveAttribute('data-entrance', 'false')
    expect(within(region).getAllByRole('article')).toHaveLength(5)
    expect(region.querySelector('[inert]')).toBeNull()
    expect(region.querySelector('.mkt-timeline-camera').style.transform).toBe('')
    for (const row of within(region).getAllByRole('article')) {
      expect(row.style.getPropertyValue('--title-reveal')).toBe('')
      expect(row.style.getPropertyValue('--description-reveal')).toBe('')
    }
    unmount()
    expect(frames.size).toBe(0)
    expect(callbacks.size).toBe(0)
  })
})
