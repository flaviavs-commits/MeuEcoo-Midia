// Conexão de contas pela Zernio (src/routes/oauth.js), do início ao retorno: o `state` assinado
// carrega o usuário e o perfil Zernio dele; o retorno só vincula conta desse perfil. Os states
// ficam numa tabela em memória que imita oauth_flow_states (uso único, com validade).
process.env.AUTH_TOKEN_SECRET = 'test-secret-auth-12345'
process.env.SESSION_SECRET = 'test-session-xyz'
process.env.ALLOWED_EMAIL_DOMAINS = 'allowed.test'
process.env.ZERNIO_API_KEY = 'test-zernio-key'
process.env.ZERNIO_PROFILE_ID = 'perfil-legado'

const request = require('supertest')

jest.mock('../../src/db/pool', () => ({ query: jest.fn(), connect: jest.fn() }))
jest.mock('../../src/repositories/usersRepository', () => {
  const actual = jest.requireActual('../../src/repositories/usersRepository')
  return { ...actual, buscarPorId: jest.fn() }
})
jest.mock('../../src/infra/social/zernioClient', () => {
  const actual = jest.requireActual('../../src/infra/social/zernioClient')
  return { ...actual, connectUrl: jest.fn(), listAccounts: jest.fn() }
})
jest.mock('../../src/services/zernioProfileService', () => ({ ensureZernioProfile: jest.fn(async userId => `perfil-do-usuario-${userId}`) }))
jest.mock('../../src/repositories/contasRepository', () => {
  const actual = jest.requireActual('../../src/repositories/contasRepository')
  return { ...actual, criarContaRapida: jest.fn(async ({ name, userId }) => ({ id: 55, handle: name, user_id: userId })), definirZernioAccountId: jest.fn().mockResolvedValue() }
})
jest.mock('../../src/repositories/tokensRepository', () => {
  const actual = jest.requireActual('../../src/repositories/tokensRepository')
  return { ...actual, salvarToken: jest.fn().mockResolvedValue({}) }
})

const pool = require('../../src/db/pool')
const { gerarTokenSessao } = require('../../src/utils/authToken')
const usersRepo = require('../../src/repositories/usersRepository')
const zernioClient = require('../../src/infra/social/zernioClient')
const contasRepo = require('../../src/repositories/contasRepository')
const tokensRepo = require('../../src/repositories/tokensRepository')
const app = require('../../src/server')

// Contas que a Zernio tem em cada perfil: o usuário 7 só enxerga o próprio.
const CONTAS_POR_PERFIL = {
  'perfil-do-usuario-7': [{ _id: 'zac_do_7', platform: 'instagram', username: 'perfil_do_7', profilePicture: 'https://cdn.example/7.jpg' }],
  'perfil-do-usuario-8': [{ _id: 'zac_do_8', platform: 'instagram', username: 'perfil_do_8' }],
}

let states
beforeEach(() => {
  jest.clearAllMocks()
  states = new Map()
  pool.query.mockImplementation(async (sql, params = []) => {
    if (/INSERT INTO oauth_flow_states/.test(sql)) {
      states.set(params[0], { payload: params[2], expira: params[3] })
      return { rows: [] }
    }
    if (/DELETE FROM oauth_flow_states/.test(sql)) {
      const linha = states.get(params[0])
      states.delete(params[0])
      return { rows: linha && linha.expira > Date.now() ? [{ payload: linha.payload }] : [] }
    }
    return { rows: [] }
  })
  usersRepo.buscarPorId.mockImplementation(async id => ({ id, email: `u${id}@allowed.test`, role: 'user', plan: 'pro', planActive: true }))
  zernioClient.connectUrl.mockResolvedValue({ authUrl: 'https://zernio.example/connect' })
  zernioClient.listAccounts.mockImplementation(async ({ profileId, platform }) => ({ accounts: (CONTAS_POR_PERFIL[profileId] || []).map(conta => ({ ...conta, platform })) }))
})

const ROTAS = { instagram: 'instagram', youtube: 'google', tiktok: 'tiktok' }

async function iniciar(platform, userId = 7, query = '') {
  const resposta = await request(app).get(`/auth/${ROTAS[platform]}${query}`).set('Authorization', `Bearer ${gerarTokenSessao(userId)}`)
  expect(resposta.status).toBe(200)
  const redirect = new URL(zernioClient.connectUrl.mock.calls.at(-1)[2])
  return redirect.searchParams.get('state')
}

const retornar = (platform, params) => request(app).get(`/auth/${ROTAS[platform]}/zernio-return?${new URLSearchParams(params)}`)
const deuCerto = resposta => /Conexão concluída/.test(resposta.text)
const deuErrado = resposta => /Não foi possível conectar/.test(resposta.text)

describe.each(Object.keys(ROTAS))('conexão de %s pela Zernio', (platform) => {
  test('o início usa o perfil Zernio do próprio usuário e devolve a URL de autorização', async () => {
    await iniciar(platform)
    const [plataformaPedida, perfil, redirect] = zernioClient.connectUrl.mock.calls[0]
    expect(plataformaPedida).toBe(platform)
    expect(perfil).toBe('perfil-do-usuario-7')
    expect(new URL(redirect).pathname).toBe(`/auth/${ROTAS[platform]}/zernio-return`)
    expect(states.size).toBe(1)
  })

  test('o retorno vincula a conta do perfil do usuário, com o id da Zernio no lugar do token', async () => {
    const state = await iniciar(platform)

    const resposta = await retornar(platform, { state, accountId: 'zac_do_7' })

    expect(deuCerto(resposta)).toBe(true)
    expect(zernioClient.listAccounts).toHaveBeenCalledWith(expect.objectContaining({ profileId: 'perfil-do-usuario-7', platform }))
    expect(contasRepo.criarContaRapida).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, platform, externalUserId: 'zac_do_7' }))
    expect(contasRepo.definirZernioAccountId).toHaveBeenCalledWith(55, 'zac_do_7', 'perfil-do-usuario-7')
    expect(tokensRepo.salvarToken).toHaveBeenCalledWith(expect.objectContaining({ accountId: 55, platform, accessToken: 'zac_do_7', expiresAt: null }))
  })
})

describe('segurança do retorno', () => {
  test('state usado uma vez não serve de novo', async () => {
    const state = await iniciar('instagram')
    expect(deuCerto(await retornar('instagram', { state, accountId: 'zac_do_7' }))).toBe(true)

    expect(deuErrado(await retornar('instagram', { state, accountId: 'zac_do_7' }))).toBe(true)
    expect(contasRepo.criarContaRapida).toHaveBeenCalledTimes(1)
  })

  test('state adulterado (troca do usuário) é recusado antes de falar com a Zernio', async () => {
    const state = await iniciar('instagram')
    const dados = JSON.parse(Buffer.from(state, 'base64url').toString())
    const adulterado = Buffer.from(JSON.stringify({ ...dados, userId: 8 })).toString('base64url')

    expect(deuErrado(await retornar('instagram', { state: adulterado, accountId: 'zac_do_8' }))).toBe(true)
    expect(zernioClient.listAccounts).not.toHaveBeenCalled()
    expect(contasRepo.criarContaRapida).not.toHaveBeenCalled()
  })

  test('state vencido (mais de 10 min) é recusado', async () => {
    const state = await iniciar('instagram')
    const agora = Date.now()
    const relogio = jest.spyOn(Date, 'now').mockReturnValue(agora + 11 * 60 * 1000)
    try {
      expect(deuErrado(await retornar('instagram', { state, accountId: 'zac_do_7' }))).toBe(true)
    } finally { relogio.mockRestore() }
    expect(contasRepo.criarContaRapida).not.toHaveBeenCalled()
  })

  test('sem state, ou com state qualquer, nada é vinculado', async () => {
    expect(deuErrado(await retornar('instagram', { accountId: 'zac_do_7' }))).toBe(true)
    expect(deuErrado(await retornar('instagram', { state: 'x'.repeat(40), accountId: 'zac_do_7' }))).toBe(true)
    expect(contasRepo.criarContaRapida).not.toHaveBeenCalled()
  })

  test('trocar o accountId da URL pela conta de outro usuário não vincula nada', async () => {
    const state = await iniciar('instagram')

    const resposta = await retornar('instagram', { state, accountId: 'zac_do_8', username: 'perfil_do_8' })

    expect(deuErrado(resposta)).toBe(true)
    expect(zernioClient.listAccounts).toHaveBeenCalledWith(expect.objectContaining({ profileId: 'perfil-do-usuario-7' }))
    expect(contasRepo.criarContaRapida).not.toHaveBeenCalled()
  })

  test('profileId da URL diferente do perfil do state é recusado', async () => {
    const state = await iniciar('instagram')

    expect(deuErrado(await retornar('instagram', { state, accountId: 'zac_do_7', profileId: 'perfil-do-usuario-8' }))).toBe(true)
    expect(zernioClient.listAccounts).not.toHaveBeenCalled()
  })

  test('returnTo fora de /app não vira redirecionamento aberto', async () => {
    const state = await iniciar('instagram', 7, '?returnTo=https%3A%2F%2Fmalicioso.example')

    const resposta = await retornar('instagram', { state, accountId: 'zac_do_7' })

    expect(resposta.text).toMatch(/data-target-url="[^"]*\/app\/integracoes\?connected=true"/)
    expect(resposta.text).not.toMatch(/malicioso/)
  })

  test('iniciar exige login (fora de /api, manda para a tela de login)', async () => {
    const resposta = await request(app).get('/auth/instagram')
    expect(resposta.status).toBe(302)
    expect(resposta.headers.location).toMatch(/\/login\.html$/)
    expect(zernioClient.connectUrl).not.toHaveBeenCalled()
  })
})
