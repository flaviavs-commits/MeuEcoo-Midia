/*
 * API simulada para o E2E de fumaça. O navegador nunca chega ao backend: toda chamada a /api, /auth,
 * /oauth e /media-proxy é respondida aqui, com os mesmos formatos que o backend devolve (ver
 * src/routes e src/http). Os dados são poucos e fixos de propósito: o objetivo é provar que o app
 * sobe, navega e trata erros num navegador de verdade, não reproduzir o produto inteiro.
 */

export const USER = {
  id: 1,
  email: 'ana@exemplo.com.br',
  role: 'user',
  plan: 'premium',
  planActive: true,
  planUnrestricted: false,
  allowedPlatforms: ['instagram', 'facebook', 'youtube', 'tiktok'],
  fullName: 'Ana Exemplo',
  avatarUrl: null,
  totpEnabled: false,
  notificationPreferences: { email: true, failures: true },
}

function inDays(days, hour = 10) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

// Linha de listarPosts (GET /api/posts); o calendário acrescenta calendarAt.
const SCHEDULED_POST = {
  id: 101,
  text: null,
  textByPlatform: { instagram: 'Lançamento da coleção de outono' },
  titleByPlatform: null,
  platforms: ['instagram'],
  scheduledAt: inDays(2),
  repeat: 'none',
  status: 'scheduled',
  errorMessage: null,
  retryCount: 0,
  nextRetryAt: null,
  criado_em: inDays(-1),
  userId: USER.id,
  mediaPath: null,
}

// GET /api/accounts: cada conta traz os tokens dela (o valor do token chega mascarado).
const ACCOUNTS = [{
  id: 11,
  platform: 'instagram',
  handle: '@ecooexemplo',
  tipo: 'NICHO',
  ativo: true,
  criado_em: inDays(-30),
  avatarUrl: null,
  userId: USER.id,
  ownerEmail: USER.email,
  tokens: [{ id: 21, platform: 'instagram', accountName: '@ecooexemplo', accessToken: 'abc123...', expiresAt: null, status: 'valid' }],
}]

// Respostas por caminho (sem a query). Uma função recebe a URL e devolve o corpo.
const GET_ROUTES = {
  '/auth/csrf': () => ({ token: 'e2e-csrf-token' }),
  '/api/logs': () => ({ logs: [] }),
  '/api/posts/inbox/unread': () => ({ unanswered: {}, unread: {} }),
  '/api/accounts': () => ({ total: ACCOUNTS.length, data: ACCOUNTS }),
  '/api/posts': url => ({ posts: url.searchParams.get('status') === 'scheduled' ? [SCHEDULED_POST] : [], page: 1, limit: 100, hasMore: false }),
  '/api/posts/calendar': () => ({ posts: [{ ...SCHEDULED_POST, calendarAt: SCHEDULED_POST.scheduledAt }] }),
  '/api/posts/analytics': () => ({ series: {}, metrics: [], instagramFollowers: {}, tiktokStats: {}, youtubeSubscribers: {}, accountAnalytics: {} }),
  '/api/drafts': () => ({ drafts: [], hasMore: false }),
}

// Qualquer outra leitura recebe listas vazias nos nomes que as telas usam, para cada página abrir
// no estado "ainda não há nada aqui" em vez de depender de dados que o teste não descreve.
const EMPTY_LISTS = { data: [], posts: [], drafts: [], logs: [], assets: [], queues: [], smartlinks: [], items: [], comments: [], workspaces: [], events: [], total: 0, hasMore: false }

export function isApiRequest(url) {
  const { pathname } = new URL(url)
  return /^\/(api|auth|oauth|media-proxy)(\/|$)/.test(pathname)
}

/**
 * Liga a API simulada na página.
 * - `user: null` simula quem está sem sessão (GET /api/me responde 401).
 * - `serverDown: true` faz toda chamada falhar como se o servidor estivesse fora do ar; o objeto
 *   devolvido permite religar o servidor no meio do teste (`api.serverDown = false`).
 * - `unknown` guarda as chamadas que caíram na resposta genérica, para facilitar o diagnóstico.
 */
export async function mockApi(page, { user = USER, serverDown = false } = {}) {
  const api = { serverDown, unknown: [] }
  await page.route(isApiRequest, async route => {
    if (api.serverDown) return route.abort('connectionrefused')
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

    if (url.pathname === '/api/me' && method === 'GET') {
      return user ? json(200, user) : json(401, { erro: 'Não autenticado.' })
    }
    if (!user && url.pathname.startsWith('/api/')) return json(401, { erro: 'Não autenticado.' })
    if (method === 'GET' && GET_ROUTES[url.pathname]) return json(200, GET_ROUTES[url.pathname](url))
    if (method === 'GET') {
      api.unknown.push(`${method} ${url.pathname}`)
      return json(200, EMPTY_LISTS)
    }
    api.unknown.push(`${method} ${url.pathname}`)
    return json(200, { ok: true })
  })
  return api
}

/**
 * Coleta erros de script e de console. Mensagens que o próprio teste provoca (por exemplo, a
 * falha de rede quando o servidor está "fora do ar") entram em `allow`.
 */
export function watchErrors(page, { allow = [] } = {}) {
  const errors = []
  const allowed = text => allow.some(pattern => pattern.test(text))
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))
  page.on('console', message => {
    if (message.type() === 'error' && !allowed(message.text())) errors.push(`console: ${message.text()}`)
  })
  return errors
}
