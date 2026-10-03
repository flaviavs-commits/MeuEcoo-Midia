// Pool próprio para as migrations (plano de papel de banco e RLS, Task 2).
jest.mock('../../src/db/pool', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }))
jest.mock('../../src/db/migrationPool', () => ({ criarPoolMigracao: jest.fn(() => null) }))

const poolPadrao = require('../../src/db/pool')
const { criarPoolMigracao } = require('../../src/db/migrationPool')
const { runMigrations } = require('../../src/db/runtimeMigrations')

const poolFalso = () => ({ query: jest.fn().mockResolvedValue({ rows: [] }), end: jest.fn().mockResolvedValue() })

beforeEach(() => {
  jest.clearAllMocks()
  criarPoolMigracao.mockReturnValue(null)
})

describe('criarPoolMigracao', () => {
  const { criarPoolMigracao: criarDeVerdade } = jest.requireActual('../../src/db/migrationPool')
  class PoolFalso { constructor(opcoes) { this.opcoes = opcoes; this.on = jest.fn() } }

  test('sem DATABASE_MIGRATION_URL não cria pool', () => {
    expect(criarDeVerdade({}, { Pool: PoolFalso })).toBeNull()
    expect(criarDeVerdade({ DATABASE_MIGRATION_URL: '  ' }, { Pool: PoolFalso })).toBeNull()
  })

  test('com a variável, cria um pool próprio apontado para ela, com espera longa (DDLs em paralelo)', () => {
    const criado = criarDeVerdade({ DATABASE_MIGRATION_URL: 'postgresql://dono@banco/db' }, { Pool: PoolFalso })
    expect(criado.opcoes).toMatchObject({ connectionString: 'postgresql://dono@banco/db', max: 5, connectionTimeoutMillis: 30000 })
    expect(criado.on).toHaveBeenCalledWith('error', expect.any(Function))
  })
})

describe('runMigrations', () => {
  test('sem pool de migrations, usa o pool padrão', async () => {
    await runMigrations()
    expect(poolPadrao.query).toHaveBeenCalled()
  })

  test('com pool de migrations, todas as queries vão para ele e ele é encerrado uma vez', async () => {
    const migracao = poolFalso()
    criarPoolMigracao.mockReturnValue(migracao)
    await runMigrations()
    expect(migracao.query).toHaveBeenCalled()
    expect(poolPadrao.query).not.toHaveBeenCalled()
    expect(migracao.end).toHaveBeenCalledTimes(1)
  })

  test('o pool de migrations é encerrado também quando uma migration falha, e o erro sobe', async () => {
    const migracao = poolFalso()
    migracao.query.mockRejectedValueOnce(new Error('falhou'))
    criarPoolMigracao.mockReturnValue(migracao)
    await expect(runMigrations()).rejects.toThrow('falhou')
    expect(migracao.end).toHaveBeenCalledTimes(1)
  })

  test('depois de migrar, o módulo volta a usar o pool padrão', async () => {
    criarPoolMigracao.mockReturnValue(poolFalso())
    await runMigrations()
    criarPoolMigracao.mockReturnValue(null)
    await runMigrations()
    expect(poolPadrao.query).toHaveBeenCalled()
  })

  test('um pool recebido é usado e não é encerrado (quem abriu fecha)', async () => {
    const recebido = poolFalso()
    await runMigrations({ pool: recebido })
    expect(recebido.query).toHaveBeenCalled()
    expect(recebido.end).not.toHaveBeenCalled()
    expect(criarPoolMigracao).not.toHaveBeenCalled()
  })
})
