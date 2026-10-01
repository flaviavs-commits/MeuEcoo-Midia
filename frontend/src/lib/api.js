import { isReturnPage, returnPageFor } from './app-pages.js'

// Em desenvolvimento o Vite usa o proxy local; em produção o front pode ser
// hospedado separadamente do backend (Vercel/Railway, por exemplo).
export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
let csrfToken = null

// Marca sem valor de credencial ("este navegador já abriu o app"). A tela de
// login só consulta /api/me quando ela existe, para quem nunca entrou ou já
// saiu não gerar uma chamada 401 à toa. A sessão real continua no cookie HttpOnly.
const SESSION_HINT_KEY = 'meu-ecoo:session-hint'

export function rememberSession() {
  try { localStorage.setItem(SESSION_HINT_KEY, '1') } catch { /* armazenamento indisponível */ }
}

export function forgetSession() {
  try { localStorage.removeItem(SESSION_HINT_KEY) } catch { /* armazenamento indisponível */ }
}

export function mayHaveSession() {
  try { return localStorage.getItem(SESSION_HINT_KEY) === '1' } catch { return false }
}

export class ApiError extends Error {
  constructor(message, status, body = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

// Texto de erro para a pessoa: a mensagem da API (já tratada em português) ou a frase da tela.
// Qualquer outro erro (falha de código, TypeError do navegador) nunca chega à interface.
export function messageOf(error, fallback) {
  return error instanceof ApiError ? error.message : fallback
}

// Tela de login; quando a sessão cai no meio do uso, leva junto a chave da
// página atual (ver app-pages.js) para voltar a ela depois de entrar.
export function loginPath({ returnPage } = {}) {
  return isReturnPage(returnPage) ? `/login.html?next=${encodeURIComponent(returnPage)}` : '/login.html'
}

// Também é usado direto como onClick ("Sair"): nesse caso recebe o evento e
// nenhuma página de retorno.
export async function logout(options) {
  const returnPage = typeof options?.returnPage === 'string' ? options.returnPage : null
  forgetSession()
  try {
    await publicApiFetch('/auth/login/logout', { method: 'POST' })
  } catch {
    // A navegação para o login continua sendo segura mesmo quando a rede caiu.
  } finally {
    window.location.assign(loginPath({ returnPage }))
  }
}

// Um único pedido do token por vez: escritas paralelas (vários envios, por exemplo) esperam o
// mesmo token em vez de cada uma gerar o seu.
let csrfRequest = null

async function ensureCsrfToken(timeoutMs = 15_000) {
  if (csrfToken) return csrfToken
  if (!csrfRequest) {
    csrfRequest = (async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetch(`${API_URL}/auth/csrf`, { credentials: 'include', signal: controller.signal })
        const body = await response.json()
        csrfToken = body?.token || null
      } catch {
        csrfToken = null
      } finally {
        clearTimeout(timer)
        csrfRequest = null
      }
      return csrfToken
    })()
  }
  return csrfRequest
}

// O cookie do token dura 8 horas e não é renovado no login: quando ele vence com a sessão ainda
// válida, o servidor recusa a escrita com 403. Nesse caso o token é buscado de novo, uma vez.
function isCsrfRejection(response, body) {
  return response.status === 403 && /csrf/i.test(String(body?.erro || body?.message || ''))
}

// Corpo que não é JSON (a página HTML de um proxy num 502, por exemplo): o
// texto fica guardado em "texto", mas nunca vira mensagem para a pessoa.
function parseBody(text) {
  if (!text) return null
  try { return JSON.parse(text) } catch { return { texto: text } }
}

// A frase genérica de erro interno (o padrão de serverError no backend) não diz
// nada à pessoa; as mensagens específicas de 5xx continuam valendo.
const GENERIC_SERVER_MESSAGE = /^(erro interno do servidor|internal server error)\.?$/i

// As mensagens do backend são frases curtas em português; marcação ou um texto
// longo demais é sinal de página de erro de outro servidor, e aí vale a padrão.
function readableMessage(value) {
  if (typeof value !== 'string') return null
  const message = value.trim()
  if (!message || message.length > 300 || /<\/?[a-z!][^>]*>/i.test(message) || GENERIC_SERVER_MESSAGE.test(message)) return null
  return message
}

function errorMessage(body, fallback) {
  return readableMessage(body?.erro) || readableMessage(body?.message) || readableMessage(body?.mensagem) || fallback
}

async function request(path, options = {}) {
  const { headers = {}, timeoutMs = 15_000, signal: externalSignal, csrfRetried, keepSessionOn401, ...requestOptions } = options
  const controller = new AbortController()
  const abortFromCaller = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener('abort', abortFromCaller, { once: true })
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const method = String(requestOptions.method || 'GET').toUpperCase()
    const token = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? await ensureCsrfToken(timeoutMs) : null
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
    if (token && !options.csrfRetried && isCsrfRejection(response, body)) {
      csrfToken = null
      clearTimeout(timer)
      return request(path, { ...options, csrfRetried: true })
    }
    return { response, body }
  } catch (error) {
    if (error instanceof ApiError) throw error
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

// Várias requisições podem receber 401 juntas quando a sessão expira: só a primeira leva ao login.
let redirectingToLogin = false

/*
 * Chamada autenticada. Um 401 encerra a sessão e leva ao login, a menos que a rota use 401 para
 * outra coisa (ex.: "Senha atual incorreta." ao trocar a senha): aí passe { keepSessionOn401: true }.
 */
export async function apiFetch(path, options = {}) {
  const { response, body } = await request(path, options)

  if (response.status === 401 && options.keepSessionOn401) {
    throw new ApiError(errorMessage(body, 'Não autorizado.'), 401, body)
  }

  if (response.status === 401) {
    if (!redirectingToLogin) {
      redirectingToLogin = true
      logout({ returnPage: returnPageFor(window.location.pathname) })
    }
    throw new ApiError('Sessão expirada', response.status)
  }

  if (!response.ok) {
    throw new ApiError(errorMessage(body, 'Não foi possível concluir a operação'), response.status, body)
  }

  return body
}
