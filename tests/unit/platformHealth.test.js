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
