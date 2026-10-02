// Os limites de tentativas não podem juntar pessoas diferentes numa chave só.
// Em produção, tudo chega ao processo com o mesmo req.ip (o salto interno do
// Railway), e o IP real da conexão vem no X-Real-IP, que a borda do Railway
// regrava. Estes testes montam o router de login de verdade, com o
// express-rate-limit real e store em memória.
process.env.AUTH_TOKEN_SECRET = 'test-secret-auth-12345'
process.env.SESSION_SECRET = 'test-session-xyz'
process.env.ALLOWED_EMAIL_DOMAINS = 'allowed.test'
process.env.FRONTEND_URL = 'https://app.example.test'

const express = require('express')
const request = require('supertest')

jest.mock('../../src/db/pool', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }))
jest.mock('../../src/repositories/usersRepository', () => ({
  buscarPorEmail: jest.fn().mockResolvedValue(null),
  buscarPorId: jest.fn(),
  buscarTotp: jest.fn(),
}))
jest.mock('../../src/repositories/credentialsRepository', () => ({
  buscarPorUserId: jest.fn(),
  gerarTokenReset: jest.fn(),
}))
jest.mock('../../src/services/meuEcoo', () => ({
  sincronizarCredencial: jest.fn(),
  autenticarViaMeuEcoo: jest.fn().mockResolvedValue(false),
}))
jest.mock('../../src/services/mailer', () => ({ enviarResetSenha: jest.fn() }))
jest.mock('../../src/middleware/logger', () => ({ addLog: jest.fn() }))

const IP_INTERNO_DO_RAILWAY = '100.64.0.2'

function montarApp() {
  let authRoutes
  jest.isolateModules(() => { authRoutes = require('../../src/routes/auth') })
  const app = express()
  app.set('trust proxy', 1)
  app.use(express.json())
  app.use('/auth/login', authRoutes)
  return app
}

function tentarLogin(app, { email, ipDoCliente, xForwardedFor }) {
  return request(app)
    .post('/auth/login/login')
    .set('X-Forwarded-For', xForwardedFor || IP_INTERNO_DO_RAILWAY)
    .set('X-Real-IP', ipDoCliente)
    .send({ email, password: 'senha-errada' })
}

describe('chaves dos limites de tentativas no Railway', () => {
  const envOriginal = { ...process.env }

  beforeEach(() => {
    process.env.RAILWAY_ENVIRONMENT_ID = 'ambiente-de-teste'
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = { ...envOriginal }
    jest.restoreAllMocks()
  })

  test('as tentativas erradas de uma pessoa não bloqueiam o login de outra que chega pelo mesmo salto', async () => {
    const app = montarApp()
    for (let i = 0; i < 10; i++) {
      await tentarLogin(app, { email: 'atacante@allowed.test', ipDoCliente: '203.0.113.10' })
    }
    const bloqueado = await tentarLogin(app, { email: 'atacante@allowed.test', ipDoCliente: '203.0.113.10' })
    expect(bloqueado.status).toBe(429)

    const outraPessoa = await tentarLogin(app, { email: 'cliente@allowed.test', ipDoCliente: '198.51.100.20' })
    expect(outraPessoa.status).not.toBe(429)
  })

  test('trocar de IP não libera mais tentativas para a mesma conta', async () => {
    const app = montarApp()
    for (let i = 0; i < 10; i++) {
      await tentarLogin(app, { email: 'vitima@allowed.test', ipDoCliente: `203.0.113.${i + 1}` })
    }
    const res = await tentarLogin(app, { email: 'VITIMA@allowed.test ', ipDoCliente: '203.0.113.99' })
    expect(res.status).toBe(429)
  })

  test('um X-Forwarded-For forjado não muda a chave do teto por IP', async () => {
    const app = montarApp()
    let ultimo
    for (let i = 0; i < 101; i++) {
      ultimo = await tentarLogin(app, {
        email: `conta${i}@allowed.test`,
        ipDoCliente: '203.0.113.50',
        xForwardedFor: `10.9.${i}.1, ${IP_INTERNO_DO_RAILWAY}`,
      })
    }
    expect(ultimo.status).toBe(429)
  })
})
