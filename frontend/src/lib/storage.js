/*
 * localStorage/sessionStorage sem derrubar a tela. Em navegação privada, com o site bloqueado ou com o
 * espaço cheio, o navegador lança erro em getItem/setItem: aqui a leitura volta ao padrão e a escrita
 * só não acontece (a preferência vale na sessão). Valores lidos podem ter sido salvos por versões
 * antigas: `oneOf` aceita só os previstos.
 */
function area(kind) {
  return kind === 'session' ? window.sessionStorage : window.localStorage
}

export function readStored(key, fallback = null, kind = 'local') {
  try {
    const value = area(kind).getItem(key)
    return value == null ? fallback : value
  } catch {
    return fallback
  }
}

export function readStoredJson(key, fallback = null, kind = 'local') {
  const raw = readStored(key, null, kind)
  if (raw == null) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function writeStored(key, value, kind = 'local') {
  try {
    area(kind).setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function removeStored(key, kind = 'local') {
  try { area(kind).removeItem(key) } catch { /* nada a remover */ }
}

export function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback
}
