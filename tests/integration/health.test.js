process.env.AUTH_TOKEN_SECRET = 'test-secret-auth-12345'
process.env.SESSION_SECRET = 'test-session-xyz'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const request = require('supertest')
const app = require('../../src/server')

function inlineScriptHashes(file) {
  const html = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
  const scripts = html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)
  return [...scripts]
    .filter(match => !/\bsrc=/i.test(match[0]))
    .map(match => crypto.createHash('sha256').update(match[1]).digest('base64'))
}

describe('GET /health', () => {
  test('retorna o status operacional sem autenticação', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', service: 'social-api-manager' })
  })

  test('não transforma rota API desconhecida em HTML', async () => {
    const res = await request(app).get('/api/does-not-exist')
    expect(res.status).toBe(401)
    expect(res.headers['content-type']).toMatch(/json/)
  })

  test('retorna 404 para página pública inexistente', async () => {
    const res = await request(app).get('/pagina-que-nao-existe')
    expect(res.status).toBe(404)
    expect(res.headers['content-type']).toMatch(/html/)
    expect(res.text).toContain('404')
  })

  test('retorna 404 para módulo inexistente da SPA', async () => {
    const res = await request(app).get('/app/modulo-que-nao-existe')
    expect(res.status).toBe(404)
    expect(res.headers['content-type']).toMatch(/html/)
  })

  test('CSP autoriza os scripts inline estáticos e as fontes usadas pelas páginas', async () => {
    const res = await request(app).get('/health')
    const policy = res.headers['content-security-policy'] || res.headers['content-security-policy-report-only']
    const files = [
      'frontend/index.html',
      'public/react/index.html',
      'public/404.html',
      'public/privacy-policy.html',
      'public/support.html',
      'public/terms-of-service.html',
    ]

    expect(policy).toContain('https://fonts.googleapis.com')
    expect(policy).toContain('https://fonts.gstatic.com')
    for (const file of files) {
      for (const hash of inlineScriptHashes(file)) expect(policy).toContain(`'sha256-${hash}'`)
    }
  })
})
