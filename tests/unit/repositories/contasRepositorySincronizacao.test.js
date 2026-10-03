// Testes unitários — contasRepository.sincronizarContasZernio (pool mockado)
//
// A sincronização com a Zernio apagava contas ausentes e, por cascata, o
// histórico delas. Agora só desativa e marca o token em erro; a reconexão
// reativa. O SQL em si foi validado com EXPLAIN no Postgres de produção em
// 03/10/2026 (o mock não pega erro de tipo de parâmetro).
const client = { query: jest.fn(), release: jest.fn() }
jest.mock('../../../src/db/pool', () => ({ query: jest.fn(), connect: jest.fn() }))

const pool = require('../../../src/db/pool')
const repo = require('../../../src/repositories/contasRepository')

beforeEach(() => {
  jest.clearAllMocks()
  pool.connect.mockResolvedValue(client)
})

function respostas({ ausentes = [], voltaram = [] } = {}) {
  client.query.mockImplementation(async (sql) => {
    if (sql.includes('SET ativo = FALSE')) return { rows: ausentes.map(id => ({ id })) }
    if (sql.includes('SET ativo = TRUE')) return { rows: voltaram.map(id => ({ id })) }
    return { rows: [] }
  })
}

const sqls = () => client.query.mock.calls.map(([sql]) => sql)

describe('sincronizarContasZernio', () => {
  test('desativa as contas ausentes e marca o token em erro, sem apagar nada', async () => {
    respostas({ ausentes: [103, 104] })

    const result = await repo.sincronizarContasZernio(17, 'perfil-1', ['conta-a'])

    expect(result).toEqual({ desconectadas: 2, reativadas: 0 })
    expect(sqls().some(sql => /DELETE/i.test(sql))).toBe(false)
    const tokens = client.query.mock.calls.find(([sql]) => sql.includes("status = 'error'"))
    expect(tokens[1]).toEqual([[103, 104]])
    expect(tokens[0]).toContain('expires_at IS NULL')
    expect(sqls()).toContain('COMMIT')
  })

  test('lista vazia vira array vazio tipado, numa consulta só (o bug antigo era um ramo à parte)', async () => {
    respostas()

    await repo.sincronizarContasZernio(17, 'perfil-1', [])

    const [sql, params] = client.query.mock.calls.find(([s]) => s.includes('SET ativo = FALSE'))
    expect(sql).toContain('NOT (zernio_account_id = ANY($3::text[]))')
    expect(params).toEqual([17, 'perfil-1', []])
  })

  test('reativa a conta que voltou a aparecer e devolve o token para valid', async () => {
    respostas({ voltaram: [131] })

    const result = await repo.sincronizarContasZernio(51, 'perfil-2', ['conta-b'])

    expect(result).toEqual({ desconectadas: 0, reativadas: 1 })
    const tokens = client.query.mock.calls.find(([sql]) => sql.includes("status = 'valid'"))
    expect(tokens[1]).toEqual([[131]])
  })

  test('sem mudança não mexe em tokens', async () => {
    respostas()

    await repo.sincronizarContasZernio(17, 'perfil-1', ['conta-a'])

    expect(sqls().some(sql => sql.includes('UPDATE tokens'))).toBe(false)
  })

  test('falha no meio desfaz tudo e devolve a conexão', async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('SET ativo = TRUE')) throw new Error('falha simulada')
      return { rows: [] }
    })

    await expect(repo.sincronizarContasZernio(17, 'perfil-1', [])).rejects.toThrow('falha simulada')
    expect(sqls()).toContain('ROLLBACK')
    expect(client.release).toHaveBeenCalled()
  })
})

describe('definirZernioAccountId', () => {
  test('reconectar reativa a conta', async () => {
    pool.query.mockResolvedValue({ rows: [] })

    await repo.definirZernioAccountId(103, 'conta-nova', 'perfil-1')

    const [sql, params] = pool.query.mock.calls[0]
    expect(sql).toContain('ativo = TRUE')
    expect(params).toEqual(['conta-nova', 'perfil-1', 103])
  })
})
