// Static SVG markup only (no user input), so injecting it is safe.
const ICONS = {
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  compose: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m14.5 7.5 3 3"/><path d="M13 20h7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 10h18M8 14h3M8 17h6"/>',
  chest: '<path d="M4 10h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9Z"/><path d="M4 10V8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2"/><path d="M10 13.5h4v2.5h-4z"/>',
  chart: '<path d="M4 4v16h16"/><path d="M8 15v-4M13 15V7M18 15v-6"/>',
  inbox: '<path d="M4 13 6.2 5.6A2 2 0 0 1 8.1 4h7.8a2 2 0 0 1 1.9 1.6L20 13"/><path d="M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5h-5a3 3 0 0 1-6 0H4Z"/>',
  plug: '<path d="M9 3v4M15 3v4"/><path d="M6.5 7h11v3.5a5.5 5.5 0 0 1-11 0V7Z"/><path d="M12 16v5"/>',
  shield: '<path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/>',
  activity: '<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  sparkle: '<path d="m12 3-2.5 6.5L3 12l6.5 2.5L12 21l2.5-6.5L21 12l-6.5-2.5L12 3Z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="9.5" r="1.8"/><path d="m21 16-5-5-9 9"/>',
  repeat: '<path d="M4 10a8 8 0 0 1 14-5l2 2M20 3v4h-4M20 14A8 8 0 0 1 6 19l-2-2M4 21v-4h4"/>',
  link: '<path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-5-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 5 6l-4 4a4 4 0 0 1-6 0"/>',
  user: '<circle cx="12" cy="7.5" r="3.6"/><path d="M18.5 20v-1.2a3.8 3.8 0 0 0-3.8-3.8H9.3a3.8 3.8 0 0 0-3.8 3.8V20"/>',
  users: '<circle cx="9" cy="8" r="3.3"/><path d="M3.5 20v-1a4 4 0 0 1 4-4h3a4 4 0 0 1 4 4v1"/><path d="M16 4.8a3.3 3.3 0 0 1 0 6.4M17.5 15a4 4 0 0 1 3 3.9V20"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronUp: '<path d="m6 15 6-6 6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.2 2.7 2.7L16 9.6"/>',
  alertCircle: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.4v.1"/>',
  alertTriangle: '<path d="M10.3 4.2 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4"/><path d="M12 17v.1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.6v.1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  halfCircle: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none"/>',
  processing: '<path d="M12 3a9 9 0 1 1-8.3 5.5"/><path d="M3.5 3.5v5h5"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10.5 5-3v9l-5-3"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  dots: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/>',
  logout: '<path d="M10 3H5.5A1.5 1.5 0 0 0 4 4.5v15A1.5 1.5 0 0 0 5.5 21H10"/><path d="m16 8 4 4-4 4"/><path d="M20 12H9.5"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  heart: '<path d="M12 20s-7-4.5-9.5-9A5 5 0 0 1 12 6a5 5 0 0 1 9.5 5C19 15.5 12 20 12 20Z"/>',
  comment: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l1.5-4A8.5 8.5 0 1 1 21 11.5Z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4Z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3.5V8h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20.5V16h-4.5"/>',
  download: '<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"/>',
  printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/><path d="M5.5 8h1M5.5 11h1"/>',
  arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
  arrowUpRight: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
  arrowDownRight: '<path d="M7 7l10 10"/><path d="M17 8v9H8"/>',
  trendFlat: '<path d="M4 12h16"/><path d="m15 7 5 5-5 5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  reply: '<path d="M9 7 4 12l5 5"/><path d="M4 12h9a7 7 0 0 1 7 7v1"/>',
  hash: '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
  play: '<path d="M8 5.5v13l11-6.5-11-6.5Z"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6v.3"/><path d="M12 17v.1"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18Z"/>',
  crown: '<path d="m3 7 4.5 4L12 4l4.5 7L21 7l-1.5 11h-15L3 7Z"/><path d="M5 21h14"/>',
  filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8L4 5Z"/>',
  grip: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
}

const GLYPHS = {
  instagram: '<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5.5"/><circle cx="12" cy="12" r="4.3"/></g><circle cx="17.3" cy="6.7" r="1.2" fill="currentColor"/>',
  facebook: '<path fill="currentColor" d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.6-1.5H16.5V5c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4V11H7.5v3h2.6v7h3.4Z"/>',
  youtube: '<rect x="2.6" y="5.6" width="18.8" height="12.8" rx="4" fill="none" stroke="currentColor" stroke-width="1.7"/><path fill="currentColor" d="M10.2 9.2v5.6l4.8-2.8-4.8-2.8Z"/>',
  tiktok: '<path fill="currentColor" d="M14 3c.4 2.6 2 4.2 4.6 4.5v3c-1.7.1-3.2-.4-4.6-1.3v6.1a5.8 5.8 0 1 1-5.8-5.8c.3 0 .6 0 .9.1v3.1a2.8 2.8 0 1 0 2 2.7V3H14Z"/>',
  all: '<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/></g>',
}

// Sizes that have a ds-icon--N / ds-glyph--N class; any other size is applied inline.
const SIZE_CLASSES = { 'ds-icon': new Set([14, 16, 18, 24]), 'ds-glyph': new Set([14, 16, 20]) }

function sizeClass(base, size, fallback) {
  return size && size !== fallback && SIZE_CLASSES[base].has(size) ? ` ${base}--${size}` : ''
}

function sizeStyle(base, size, fallback) {
  return size && size !== fallback && !SIZE_CLASSES[base].has(size) ? { width: size, height: size } : undefined
}

export function Icon({ name, size = 20, className = '', title }) {
  const markup = ICONS[name]
  if (!markup) return null
  const labelled = Boolean(title)
  return <svg
    className={`ds-icon${sizeClass('ds-icon', size, 20)}${className ? ` ${className}` : ''}`}
    style={sizeStyle('ds-icon', size, 20)}
    viewBox="0 0 24 24"
    aria-hidden={labelled ? undefined : 'true'}
    role={labelled ? 'img' : undefined}
    aria-label={title}
    focusable="false"
    dangerouslySetInnerHTML={{ __html: markup }}
  />
}

export function NetworkGlyph({ network, size = 18, className = '', title }) {
  const markup = GLYPHS[String(network || '').toLowerCase()]
  if (!markup) return null
  const labelled = Boolean(title)
  return <svg
    className={`ds-glyph${sizeClass('ds-glyph', size, 18)}${className ? ` ${className}` : ''}`}
    style={sizeStyle('ds-glyph', size, 18)}
    viewBox="0 0 24 24"
    aria-hidden={labelled ? undefined : 'true'}
    role={labelled ? 'img' : undefined}
    aria-label={title}
    focusable="false"
    dangerouslySetInnerHTML={{ __html: markup }}
  />
}

export const NETWORK_LABELS = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok' }
