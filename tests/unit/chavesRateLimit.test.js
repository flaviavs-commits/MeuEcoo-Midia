const { ipDoCliente, chavePorIp, chavePorEmail, chavePorUsuario, chavePorSegredo } = require('../../src/infra/http/chavesRateLimit')

describe('chaves dos limites de tentativas', () => {
  const envOriginal = { ...process.env }
  afterEach(() => { process.env = { ...envOriginal } })

  test('no Railway usa o X-Real-IP da borda, não o req.ip do salto interno', () => {
    process.env.RAILWAY_ENVIRONMENT_ID = 'producao'
    const req = { ip: '100.64.0.2', headers: { 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '10.0.0.1, 100.64.0.2' } }
    expect(ipDoCliente(req)).toBe('203.0.113.7')
  })

  test('fora do Railway ignora o X-Real-IP, que o próprio cliente poderia inventar', () => {
    delete process.env.RAILWAY_ENVIRONMENT_ID
    const req = { ip: '127.0.0.1', headers: { 'x-real-ip': '203.0.113.7' } }
    expect(ipDoCliente(req)).toBe('127.0.0.1')
  })

  test('usuários logados têm chaves próprias mesmo vindo do mesmo IP', () => {
    const base = { ip: '100.64.0.2', headers: {} }
    expect(chavePorUsuario({ ...base, user: { id: 1 } })).not.toBe(chavePorUsuario({ ...base, user: { id: 2 } }))
    expect(chavePorUsuario(base)).toBe(chavePorIp(base))
  })

  test('a chave por e-mail normaliza maiúsculas e espaços e não guarda o e-mail em texto', () => {
    const req = email => ({ ip: '100.64.0.2', headers: {}, body: { email } })
    expect(chavePorEmail(req('Ana@Exemplo.com '))).toBe(chavePorEmail(req('ana@exemplo.com')))
    expect(chavePorEmail(req('ana@exemplo.com'))).not.toContain('ana')
  })

  test('sem segredo no pedido, a chave por segredo cai no IP', () => {
    const chave = chavePorSegredo(req => req.body?.token)
    const req = { ip: '100.64.0.2', headers: {}, body: {} }
    expect(chave(req)).toBe(chavePorIp(req))
    expect(chave({ ...req, body: { token: 'abc' } })).toMatch(/^segredo:[0-9a-f]{32}$/)
  })
})
