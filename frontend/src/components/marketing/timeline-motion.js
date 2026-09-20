export const TIMELINE_POINTS = Array.from({ length: 5 }, (_, index) => ({
  x: index % 2 ? .6 : .4,
  y: .2 + index * .16,
}))

const clamp = value => Math.max(0, Math.min(1, value))
const smooth = (from, to, value) => {
  const t = clamp((value - from) / (to - from))
  return t * t * (3 - 2 * t)
}

const overview = focus => ({ x: 0, y: 0, zoom: 1, focus, strength: 0 })
const closeUp = index => ({
  x: index % 2 ? .255 : -.255,
  y: TIMELINE_POINTS[index].y - .5,
  zoom: 1.68,
  focus: index,
  strength: 1,
})
const CAMERA_KEYS = [[0, overview(0)]]

TIMELINE_POINTS.forEach((point, index) => {
  const center = index + 1
  const pose = closeUp(index)
  CAMERA_KEYS.push([center - .3, pose], [center + .26, { ...pose, zoom: 1.73 }])
  if (index < TIMELINE_POINTS.length - 1) {
    CAMERA_KEYS.push([center + .5, {
      x: 0, y: point.y + .08 - .5, zoom: 1.04, focus: index + .5, strength: 0,
    }])
  }
})
CAMERA_KEYS.push([6, overview(4)])

export function timelineFrame(progress) {
  const phase = clamp(progress) * 6
  const right = CAMERA_KEYS.findIndex(([time]) => time >= phase)
  if (right <= 0) return { ...CAMERA_KEYS[0][1] }
  const [start, a] = CAMERA_KEYS[right - 1]
  const [end, b] = CAMERA_KEYS[right]
  const t = smooth(start, end, phase)
  return Object.fromEntries(Object.keys(a).map(key => [key, a[key] + (b[key] - a[key]) * t]))
}

export function timelineStepFrame(progress, index) {
  const phase = clamp(progress) * 6
  const local = phase - (index + 1)
  const arrival = smooth(-.42, -.24, local)
  const departure = smooth(.26, .48, local)
  const overviewPresence = smooth(5.65, 6, phase)
  const presence = Math.max(arrival * (1 - departure), overviewPresence)
  return {
    presence,
    title: Math.max(smooth(-.25, 0, local), overviewPresence),
    description: Math.max(smooth(-.05, .08, local), overviewPresence),
    emphasis: arrival * (1 - smooth(.26, .5, local)),
  }
}

export function timelineSegmentPath(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y
  const bend = Math.min(Math.abs(dx) * .16, 26) * Math.sign(dx)
  const stem = Math.min(dy * .17, 28)
  return `M ${from.x} ${from.y} L ${from.x} ${from.y + stem} Q ${from.x} ${from.y + stem * 1.5} ${from.x + bend} ${from.y + stem * 1.8} L ${to.x - bend} ${to.y - stem * 1.8} Q ${to.x} ${to.y - stem * 1.5} ${to.x} ${to.y - stem} L ${to.x} ${to.y}`
}

// Kept as a small compatibility helper for consumers of the previous timeline API.
export function timelineCurve(from, to) {
  const middle = (from.y + to.y) / 2
  return `M ${from.x} ${from.y} C ${from.x} ${middle}, ${to.x} ${middle}, ${to.x} ${to.y}`
}
