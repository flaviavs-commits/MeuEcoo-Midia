// Contexto do usuário por requisição (src/db/requestContext.js), base do RLS.
const { executarComUsuario, usuarioAtual, executarComoSistema, emModoSistema } = require('../../src/db/requestContext')

const esperar = ms => new Promise(resolve => setTimeout(resolve, ms))

test('fora de uma requisição não há usuário', () => {
  expect(usuarioAtual()).toBeNull()
})

test('dentro do contexto o usuário sobrevive a await, timers e promessas encadeadas', async () => {
  await executarComUsuario({ userId: 7, role: 'user' }, async () => {
    expect(usuarioAtual()).toEqual({ userId: 7, role: 'user' })
    await esperar(5)
    await Promise.resolve().then(() => expect(usuarioAtual()).toEqual({ userId: 7, role: 'user' }))
    await new Promise(resolve => setImmediate(() => { expect(usuarioAtual().userId).toBe(7); resolve() }))
  })
  expect(usuarioAtual()).toBeNull()
})

test('duas requisições concorrentes não se misturam', async () => {
  const vistos = []
  const requisicao = (userId, atraso) => executarComUsuario({ userId }, async () => {
    await esperar(atraso)
    vistos.push([userId, usuarioAtual().userId])
    await esperar(atraso)
    vistos.push([userId, usuarioAtual().userId])
  })
  await Promise.all([requisicao(1, 10), requisicao(2, 3), requisicao(3, 7)])
  expect(vistos).toHaveLength(6)
  expect(vistos.every(([esperado, visto]) => esperado === visto)).toBe(true)
})

test('o contexto é imutável e exige um userId válido', () => {
  executarComUsuario({ userId: '9', role: 'admin' }, () => {
    const contexto = usuarioAtual()
    expect(contexto).toEqual({ userId: 9, role: 'admin' })
    expect(Object.isFrozen(contexto)).toBe(true)
  })
  expect(() => executarComUsuario({ userId: 0 }, () => {})).toThrow(/userId válido/)
  expect(() => executarComUsuario({}, () => {})).toThrow(/userId válido/)
})

test('executarComoSistema marca o fluxo como sistema, sem usuário, e não vaza para fora', async () => {
  expect(emModoSistema()).toBe(false)
  await executarComoSistema(async () => {
    await esperar(1)
    expect(emModoSistema()).toBe(true)
    expect(usuarioAtual()).toBeNull()
  })
  expect(emModoSistema()).toBe(false)
})

test('trecho de sistema dentro da requisição não herda o usuário, e a requisição continua com ele', async () => {
  await executarComUsuario({ userId: 7 }, async () => {
    await executarComoSistema(async () => {
      expect(usuarioAtual()).toBeNull()
      expect(emModoSistema()).toBe(true)
    })
    expect(usuarioAtual().userId).toBe(7)
    expect(emModoSistema()).toBe(false)
  })
})

test('um requireAuth dentro de uma rota de sistema abre o contexto do usuário por cima', async () => {
  await executarComoSistema(() => executarComUsuario({ userId: 5 }, async () => {
    expect(usuarioAtual().userId).toBe(5)
    expect(emModoSistema()).toBe(false)
  }))
})

describe('requireAuth e requireApiKey abrem o contexto', () => {
  const express = require('express')
  const request = require('supertest')

  beforeAll(() => {
    process.env.AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'segredo-de-teste-contexto'
    process.env.ALLOWED_EMAIL_DOMAINS = 'teste.local'
  })

  test('a rota depois do requireAuth enxerga o usuário mesmo após await', async () => {
    jest.resetModules()
    jest.doMock('../../src/repositories/usersRepository', () => ({ buscarPorId: jest.fn(async id => ({ id, email: 'a@teste.local', role: 'user' })) }))
    const requireAuth = require('../../src/middleware/requireAuth')
    const { usuarioAtual: atual } = require('../../src/db/requestContext')
    const { gerarTokenSessao } = require('../../src/utils/authToken')
    const app = express()
    app.get('/api/quem', requireAuth, async (_req, res) => { await esperar(2); res.json(atual()) })

    const resposta = await request(app).get('/api/quem').set('Authorization', `Bearer ${gerarTokenSessao(42)}`)

    expect(resposta.body).toEqual({ userId: 42, role: 'user' })
  })

  test('a rota depois do requireApiKey enxerga o dono da chave', async () => {
    jest.resetModules()
    jest.doMock('../../src/db/pool', () => ({ query: jest.fn().mockResolvedValue({ rows: [{ id: 1, user_id: 77 }] }) }))
    jest.doMock('../../src/repositories/usersRepository', () => ({ buscarPorId: jest.fn(async id => ({ id, role: 'user' })) }))
    const requireApiKey = require('../../src/middleware/requireApiKey')
    const { usuarioAtual: atual } = require('../../src/db/requestContext')
    const app = express()
    app.get('/v1/quem', requireApiKey, async (_req, res) => { await esperar(2); res.json(atual()) })

    const resposta = await request(app).get('/v1/quem').set('X-API-Key', 'mk_chave_de_teste')

    expect(resposta.body).toEqual({ userId: 77, role: 'user' })
  })
})
