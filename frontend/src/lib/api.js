// Em desenvolvimento o Vite usa o proxy local; em produção o front pode ser
// hospedado separadamente do backend (Vercel/Railway, por exemplo).
export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
let csrfToken = null

export class ApiError extends Error {
  constructor(message, status, body = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export async function logout() {
  try {
    await publicApiFetch('/auth/login/logout', { method: 'POST' })
  } catch {
    // A navegação para o login continua sendo segura mesmo quando a rede caiu.
  } finally {
    window.location.assign('/login.html')
  }
}

async function ensureCsrfToken(timeoutMs = 15_000, externalSignal) {
  if (csrfToken) return csrfToken
  const controller = new AbortController()
  const abortFromCaller = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener('abort', abortFromCaller, { once: true })
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${API_URL}/auth/csrf`, { credentials: 'include', signal: controller.signal })
    const body = await response.json()
    csrfToken = body?.token || null
  } catch {
    csrfToken = null
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener('abort', abortFromCaller)
  }
  return csrfToken
}

function parseBody(text) {
  if (!text) return null
  try { return JSON.parse(text) } catch { return { mensagem: text } }
}

function errorMessage(body, fallback) {
  return body?.erro || body?.message || body?.mensagem || fallback
}

async function request(path, options = {}) {
  const { headers = {}, timeoutMs = 15_000, signal: externalSignal, ...requestOptions } = options
  const controller = new AbortController()
  const abortFromCaller = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener('abort', abortFromCaller, { once: true })
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const method = String(requestOptions.method || 'GET').toUpperCase()
    const token = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? await ensureCsrfToken(timeoutMs, externalSignal) : null
    const response = await fetch(`${API_URL}${path}`, {
      ...requestOptions,
      credentials: 'include',
      signal: controller.signal,
      headers: {
        ...(requestOptions.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { 'X-CSRF-Token': token } : {}),
        ...headers,
      },
    })

    const body = response.status === 204 ? null : parseBody(await response.text())
    return { response, body }
  } catch (error) {
    if (error.name === 'AbortError') throw new ApiError('Tempo esgotado. Verifique sua conexão e tente novamente.', 408)
    throw new ApiError('Não foi possível conectar ao servidor.', 0)
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener('abort', abortFromCaller)
  }
}

export async function publicApiFetch(path, options = {}) {
  const { response, body } = await request(path, options)
  if (!response.ok) throw new ApiError(errorMessage(body, 'Não foi possível concluir a operação'), response.status, body)
  return body
}

export async function apiFetch(path, options = {}) {
  const { response, body } = await request(path, options)

  if (response.status === 401) {
    logout()
    throw new ApiError('Sessão expirada', response.status)
  }

  if (!response.ok) {
    throw new ApiError(errorMessage(body, 'Não foi possível concluir a operação'), response.status, body)
  }

  return body
}
