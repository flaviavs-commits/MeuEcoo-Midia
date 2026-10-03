process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret'

jest.mock('../../src/db/pool', () => ({ query: jest.fn() }))
jest.mock('../../src/repositories/logsRepository', () => ({ registrarLog: jest.fn(), broadcastEvent: jest.fn() }))
jest.mock('../../src/infra/social/zernioClient', () => ({ listAccounts: jest.fn(), getAccountHealth: jest.fn() }))

const pool = require('../../src/db/pool')
const zernioClient = require('../../src/infra/social/zernioClient')
const { registrarLog } = require('../../src/repositories/logsRepository')
const { getStatusMap, verificarSaudePlataformas } = require('../../src/services/platformHealth')

describe('platform health', () => {
  beforeEach(() => jest.clearAllMocks())

  test('não exibe falha global para uma pessoa sem conta na plataforma', async () => {
    pool.query.mockResolvedValue({ rows: [
      { platform: 'youtube', status: 'down', hasAccount: false },
    ] })

    const result = await getStatusMap(42)

    expect(result.youtube).toBe('up')
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('c.user_id = $1'), [42])
  })

  test('mantém a leitura global quando chamada pelo agente interno', async () => {
    pool.query.mockResolvedValue({ rows: [
      { platform: 'youtube', status: 'down', hasAccount: true },
    ] })

    const result = await getStatusMap()

    expect(result.youtube).toBe('down')
    expect(pool.query).toHaveBeenCalledWith(expect.not.stringContaining('c.user_id = $1'), [])
  })
})

describe('verificação de saúde com conta removida no Zernio', () => {
  beforeEach(() => jest.clearAllMocks())

  // Regressão do achado E-02 (agosto/2026): a sonda consultava a saúde da
  // conta conectada; uma conta removida no Zernio devolvia "Account not found"
  // e a rede inteira era marcada como fora do ar, segurando os posts de todo
  // mundo. A saúde da API não pode depender de uma conta específica existir.
  test('conta removida no Zernio não marca a rede como fora do ar', async () => {
    const statusGravados = []
    pool.query.mockImplementation(async (sql, params = []) => {
      if (sql.includes('FROM tokens t JOIN contas c')) return { rows: [{ zernioAccountId: 'conta-removida', zernioProfileId: 'perfil-1' }] }
      if (sql.includes('SELECT status, fail_count FROM platform_health')) return { rows: [{ status: 'up', fail_count: 1 }] }
      if (sql.includes('INSERT INTO platform_health')) { statusGravados.push({ platform: params[0], status: params[1] }); return { rows: [] } }
      return { rows: [] }
    })
    zernioClient.getAccountHealth.mockRejectedValue(Object.assign(new Error('Account not found'), { name: 'ZernioError', status: 404 }))
    zernioClient.listAccounts.mockResolvedValue({ accounts: [] })

    await verificarSaudePlataformas()

    expect(zernioClient.getAccountHealth).not.toHaveBeenCalled()
    expect(statusGravados.map(s => s.status)).toEqual(['up', 'up', 'up', 'up'])
    expect(registrarLog).not.toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('fora do ar') }))
  })
})

describe('garantirSaudeRecente: checagem sob demanda', () => {
  const { garantirSaudeRecente } = require('../../src/services/platformHealth')
  const ultimaChecagemHa = minutos => ({ rows: [{ ultima: minutos === null ? null : new Date(Date.now() - minutos * 60000) }] })
  const checouAsRedes = () => pool.query.mock.calls.some(([sql]) => /FROM tokens/.test(sql))

  beforeEach(() => {
    jest.clearAllMocks()
    pool.query.mockResolvedValue({ rows: [] })
  })

  test('checagem de 5 min atrás ainda vale: não verifica de novo', async () => {
    pool.query.mockResolvedValueOnce(ultimaChecagemHa(5))
    expect(await garantirSaudeRecente()).toBe(false)
    expect(checouAsRedes()).toBe(false)
  })

  test('checagem de 20 min atrás está velha: verifica as redes', async () => {
    pool.query.mockResolvedValueOnce(ultimaChecagemHa(20))
    expect(await garantirSaudeRecente()).toBe(true)
    expect(checouAsRedes()).toBe(true)
  })

  test('tabela vazia conta como velha', async () => {
    pool.query.mockResolvedValueOnce(ultimaChecagemHa(null))
    expect(await garantirSaudeRecente()).toBe(true)
  })

  test('duas chamadas ao mesmo tempo fazem uma verificação só', async () => {
    pool.query.mockImplementation(async sql => /MAX\(checked_at\)/.test(sql) ? ultimaChecagemHa(30) : { rows: [] })
    const resultados = await Promise.all([garantirSaudeRecente(), garantirSaudeRecente()])
    expect(resultados.sort()).toEqual([false, true])
  })

  test('a verificação roda como sistema mesmo chamada dentro de uma requisição (lê tokens de todos)', async () => {
    const { executarComUsuario, emModoSistema } = require('../../src/db/requestContext')
    const modos = []
    pool.query.mockImplementation(async sql => {
      if (/FROM tokens/.test(sql)) modos.push(emModoSistema())
      return /MAX\(checked_at\)/.test(sql) ? ultimaChecagemHa(30) : { rows: [] }
    })
    await executarComUsuario({ userId: 7 }, () => garantirSaudeRecente())
    expect(modos.length).toBeGreaterThan(0)
    expect(modos.every(Boolean)).toBe(true)
  })
})
