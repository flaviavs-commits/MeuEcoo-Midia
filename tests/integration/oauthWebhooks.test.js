// Endpoints públicos que os provedores chamam sem sessão (src/routes/oauth.js): só agem com
// assinatura válida. Webhook do TikTok (revogação) e Data Deletion Callback da Meta.
process.env.AUTH_TOKEN_SECRET = 'test-secret-auth-12345'
process.env.SESSION_SECRET = 'test-session-xyz'
process.env.TIKTOK_CLIENT_SECRET = 'segredo-tiktok-de-teste'
process.env.META_APP_SECRET = 'segredo-meta-de-teste'
process.env.BASE_URL = 'https://api.exemplo.test'

const crypto = require('crypto')
const request = require('supertest')

jest.mock('../../src/db/pool', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }), connect: jest.fn() }))
jest.mock('../../src/repositories/contasRepository', () => {
  const actual = jest.requireActual('../../src/repositories/contasRepository')
  return { ...actual, buscarContasPorExternalUserId: jest.fn(), apagarDadosDaConta: jest.fn().mockResolvedValue() }
})

const pool = require('../../src/db/pool')
const contasRepo = require('../../src/repositories/contasRepository')
const app = require('../../src/server')

const esperarFila = () => new Promise(resolve => setImmediate(resolve))

beforeEach(() => {
  jest.clearAllMocks()
  pool.query.mockResolvedValue({ rows: [] })
  contasRepo.buscarContasPorExternalUserId.mockResolvedValue([{ id: 31, userId: 3 }])
})

describe('webhook do TikTok', () => {
  const corpo = JSON.stringify({ event: 'authorization.removed', user_openid: 'open_123' })
  const assinar = (texto, segundos = Math.floor(Date.now() / 1000), segredo = process.env.TIKTOK_CLIENT_SECRET) =>
    `t=${segundos},s=${crypto.createHmac('sha256', segredo).update(`${segundos}.${texto}`).digest('hex')}`
  // URL cadastrada no TikTok (vercel.json): só nela o server.js guarda o corpo bruto para a HMAC.
  const enviar = (assinatura, caminho = '/oauth/tiktok/webhook') => {
    const req = request(app).post(caminho).set('Content-Type', 'application/json')
    return (assinatura ? req.set('TikTok-Signature', assinatura) : req).send(corpo)
  }
  const tokensMarcadosComErro = () => pool.query.mock.calls.filter(([sql]) => /UPDATE tokens SET status = 'error'/.test(sql))

  test('assinatura válida: responde 200 e marca a conta revogada como desconectada', async () => {
    const resposta = await enviar(assinar(corpo))
    await esperarFila()

    expect(resposta.status).toBe(200)
    expect(contasRepo.buscarContasPorExternalUserId).toHaveBeenCalledWith('tiktok', 'open_123')
    expect(tokensMarcadosComErro().map(([, params]) => params)).toEqual([[31]])
  })

  test('o apelido /auth/tiktok/webhook não tem corpo bruto e recusa até assinatura válida (falha fechada)', async () => {
    expect((await enviar(assinar(corpo), '/auth/tiktok/webhook')).status).toBe(401)
    expect(contasRepo.buscarContasPorExternalUserId).not.toHaveBeenCalled()
  })

  test.each([
    ['sem assinatura', null],
    ['assinada com outro segredo', assinar(corpo, undefined, 'segredo-errado')],
    ['assinatura de outro corpo', assinar('{"event":"outro"}')],
    ['assinatura antiga (mais de 5 min)', assinar(corpo, Math.floor(Date.now() / 1000) - 6 * 60)],
    ['cabeçalho malformado', 'lixo'],
  ])('%s: 401 e nada muda', async (_caso, assinatura) => {
    const resposta = await enviar(assinatura)
    await esperarFila()

    expect(resposta.status).toBe(401)
    expect(contasRepo.buscarContasPorExternalUserId).not.toHaveBeenCalled()
    expect(tokensMarcadosComErro()).toEqual([])
  })
})

describe('Data Deletion Callback da Meta', () => {
  const signedRequest = (payload, segredo = process.env.META_APP_SECRET) => {
    const corpo = Buffer.from(JSON.stringify(payload)).toString('base64url')
    return `${crypto.createHmac('sha256', segredo).update(corpo).digest('base64url')}.${corpo}`
  }
  const enviar = sr => request(app).post('/auth/meta/data-deletion').type('form').send({ signed_request: sr })

  test('pedido assinado: apaga os dados das contas do Facebook do usuário e devolve o código de confirmação', async () => {
    const resposta = await enviar(signedRequest({ user_id: 'fb_999', algorithm: 'HMAC-SHA256' }))
    await esperarFila()

    expect(resposta.status).toBe(200)
    expect(resposta.body.confirmation_code).toMatch(/^[a-f0-9]{32}$/)
    expect(resposta.body.url).toBe(`https://api.exemplo.test/oauth/meta/data-deletion/status?id=${resposta.body.confirmation_code}`)
    expect(contasRepo.buscarContasPorExternalUserId).toHaveBeenCalledWith('facebook', 'fb_999')
    expect(contasRepo.apagarDadosDaConta).toHaveBeenCalledWith(31)
  })

  test.each([
    ['assinado com outro segredo', () => signedRequest({ user_id: 'fb_999' }, 'segredo-errado')],
    ['malformado', () => 'sem-ponto'],
    ['ausente', () => ''],
  ])('pedido %s: 400 e nada é apagado', async (_caso, gerar) => {
    const resposta = await enviar(gerar())
    await esperarFila()

    expect(resposta.status).toBe(400)
    expect(contasRepo.apagarDadosDaConta).not.toHaveBeenCalled()
  })

  test('a página de status não reflete HTML vindo da URL', async () => {
    const resposta = await request(app).get('/oauth/meta/data-deletion/status?id=<script>alert(1)</script>')

    expect(resposta.status).toBe(200)
    expect(resposta.text).not.toMatch(/<script>/)
    expect(resposta.text).toMatch(/Solicitação scriptalert1script processada/)
  })
})
