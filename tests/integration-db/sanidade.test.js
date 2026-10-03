// Teste-sentinela da suíte de banco real: o schema sobe do zero e responde.
const { urlDoBanco, prepararBanco, limparBanco } = require('./setup')

const temBanco = Boolean(urlDoBanco())
if (!temBanco) console.warn('TEST_DATABASE_URL não definida: a suíte de banco real foi pulada (veja tests/integration-db/setup.js).')
const descrever = temBanco ? describe : describe.skip

descrever('Postgres real', () => {
  let banco

  beforeAll(async () => { banco = await prepararBanco() })
  afterAll(async () => { await limparBanco(banco) })

  test('conecta como dono e responde', async () => {
    const { rows } = await banco.pool.query('SELECT 1 AS ok')
    expect(rows[0].ok).toBe(1)
  })

  test('o pool do app (src/db/pool.js) conecta como meuecoo_app, não como o dono', async () => {
    const { rows } = await banco.poolApp.query('SELECT current_user AS usuario')
    expect(rows[0].usuario).toBe('meuecoo_app')
  })

  test('um banco vazio chega ao schema atual pelo schema base e pelo runtimeMigrations', async () => {
    const { rows } = await banco.pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [['users', 'credentials', 'contas', 'tokens', 'posts', 'post_accounts', 'logs', 'drafts', 'subscriptions', 'billing_plan_changes']]
    )
    expect(rows.map(r => r.table_name).sort()).toEqual(['billing_plan_changes', 'contas', 'credentials', 'drafts', 'logs', 'post_accounts', 'posts', 'subscriptions', 'tokens', 'users'])
  })

  test('o runtimeMigrations pode rodar de novo sobre o schema atual (todo startup faz isso)', async () => {
    const { runMigrations } = require('../../src/db/runtimeMigrations')
    await runMigrations({ pool: banco.pool })
  })
})
