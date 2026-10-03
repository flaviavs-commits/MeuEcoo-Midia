// Testes de integração — POST /api/ai/generate quando o provedor de IA falha
//
// O fallback local (gerarPostsLocal) existia, mas o catch final o chamava
// fora do escopo em que ele era declarado: toda falha de provedor que chegava
// até lá virava ReferenceError e 500. Achado pelo ESLint do backend (no-undef).
const request = require('supertest')

jest.mock('../../src/db/pool', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }), connect: jest.fn() }))
jest.mock('../../src/middleware/requireAuth', () => (req, res, next) => {
  req.user = { id: 1, email: 'test@test.com', role: 'user', plan: 'pro', planActive: true }
  next()
})
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: jest.fn().mockRejectedValue(Object.assign(new Error('quota'), { status: 429 })) },
  })),
}))

const app = require('../../src/server')

beforeAll(() => { process.env.GEMINI_API_KEY = 'chave-de-teste' })
afterAll(() => { delete process.env.GEMINI_API_KEY })

test('cota estourada no Gemini devolve o texto local em vez de 500', async () => {
  const res = await request(app)
    .post('/api/ai/generate')
    .set('Authorization', 'Bearer fake')
    .send({ instrucao: 'Post sobre a inauguração da loja', plataformas: ['instagram'], quantidade: 2, modelo: 'gemini' })

  expect(res.status).toBe(200)
  expect(res.body.modelo).toBe('local')
  expect(res.body.fallback).toBe('provedor_gemini_indisponivel')
  expect(res.body.posts).toHaveLength(2)
})

test('sem instrução continua respondendo 400 (o fallback não mascara erro de entrada)', async () => {
  const res = await request(app).post('/api/ai/generate').set('Authorization', 'Bearer fake').send({ plataformas: ['instagram'], modelo: 'gemini' })
  expect(res.status).toBe(400)
})
