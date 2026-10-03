// Pool que aplica o usuário da requisição em cada consulta (src/db/pool.js, Task 6 do plano de RLS),
// contra o Postgres real. Pool de 1 conexão: tudo passa pelo mesmo client, o que prova que o usuário
// de uma requisição não vaza para a próxima (Review Focus 2).
process.env.PG_POOL_MAX = '1'
process.env.DB_CONTEXTO_USUARIO = 'ligado'

const { urlDoBanco, prepararBanco, limparBanco } = require('./setup')

const temBanco = Boolean(urlDoBanco())
const descrever = temBanco ? describe : describe.skip

descrever('pool com o usuário da requisição (Postgres real)', () => {
  let banco, pool, contexto
  const usuarioNoBanco = async () => (await pool.query("SELECT current_setting('app.user_id', true) AS id, current_setting('app.user_role', true) AS papel")).rows[0]

  beforeAll(async () => {
    banco = await prepararBanco()
    pool = banco.poolApp
    contexto = require('../../src/db/requestContext')
  })
  afterAll(async () => { await limparBanco(banco) })

  test('dentro da requisição, a consulta enxerga app.user_id e app.user_role', async () => {
    await contexto.executarComUsuario({ userId: 7, role: 'admin' }, async () => {
      expect(await usuarioNoBanco()).toEqual({ id: '7', papel: 'admin' })
    })
  })

  test('fora da requisição (e depois dela, no mesmo client) não há usuário', async () => {
    await contexto.executarComUsuario({ userId: 7 }, () => pool.query('SELECT 1'))
    const fora = await usuarioNoBanco()
    expect(fora.id || '').toBe('')
  })

  test('client pego com connect leva o usuário e o perde no release', async () => {
    await contexto.executarComUsuario({ userId: 8 }, async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        expect((await client.query("SELECT current_setting('app.user_id', true) AS id")).rows[0].id).toBe('8')
        await client.query('COMMIT')
        expect((await client.query("SELECT current_setting('app.user_id', true) AS id")).rows[0].id).toBe('8')
      } finally { client.release() }
    })
    await new Promise(resolve => setImmediate(resolve))
    const client = await pool.connect()
    try {
      expect((await client.query("SELECT current_setting('app.user_id', true) AS id")).rows[0].id || '').toBe('')
    } finally { client.release() }
  })

  test('requisições alternadas no mesmo client não trocam de usuário', async () => {
    const vistos = await Promise.all([1, 2, 3, 4, 5, 6].map(id =>
      contexto.executarComUsuario({ userId: id }, async () => Number((await usuarioNoBanco()).id))
    ))
    expect(vistos).toEqual([1, 2, 3, 4, 5, 6])
  })

  test('erro na consulta desfaz a transação, devolve o erro original e o client segue usável', async () => {
    await contexto.executarComUsuario({ userId: 7 }, async () => {
      await expect(pool.query('SELECT 1 / 0')).rejects.toThrow(/division by zero/)
      expect((await pool.query('SELECT 2 AS ok')).rows[0].ok).toBe(2)
    })
    expect((await pool.query('SELECT 3 AS ok')).rows[0].ok).toBe(3)
  })

  test('papel fora do padrão vira "user" (o literal nunca recebe texto livre)', async () => {
    await contexto.executarComUsuario({ userId: 7, role: "x', true); DROP TABLE logs; --" }, async () => {
      expect((await usuarioNoBanco()).papel).toBe('user')
    })
    expect((await banco.pool.query("SELECT to_regclass('public.logs') IS NOT NULL AS existe")).rows[0].existe).toBe(true)
  })

  test('sem a variável DB_CONTEXTO_USUARIO, o pool ignora o contexto', async () => {
    process.env.DB_CONTEXTO_USUARIO = ''
    try {
      await contexto.executarComUsuario({ userId: 7 }, async () => {
        expect((await usuarioNoBanco()).id || '').toBe('')
      })
    } finally { process.env.DB_CONTEXTO_USUARIO = 'ligado' }
  })

  test('custo: 1000 consultas com e sem contexto (registrado no log do teste)', async () => {
    const medir = async fn => { const inicio = process.hrtime.bigint(); for (let i = 0; i < 1000; i++) await fn(); return Number(process.hrtime.bigint() - inicio) / 1e6 }
    const sem = await medir(() => pool.query('SELECT 1'))
    const com = await contexto.executarComUsuario({ userId: 7 }, () => medir(() => pool.query('SELECT 1')))
    console.log(`1000 consultas: sem contexto ${sem.toFixed(0)} ms, com contexto ${com.toFixed(0)} ms (${(com / sem).toFixed(1)}x)`)
    expect(com).toBeGreaterThan(0)
  })
})
