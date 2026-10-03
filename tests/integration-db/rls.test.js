// RLS em contas, tokens, posts e logs (migration 078), contra o Postgres real, com o app como
// meuecoo_app, o contexto do usuário no pool e o papel meuecoo_sistema para os fluxos de sistema.
// Plano docs/superpowers/plans/2026-10-02-papel-banco-e-rls.md, Tasks 7 e 8 (Review Focus 3 a 5).
process.env.AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'segredo-de-teste-auth-token-32-caracteres'
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'segredo-de-teste-session-32-caracteres!!'
process.env.ALLOWED_EMAIL_DOMAINS = 'teste.local'

const bcrypt = require('bcrypt')
const request = require('supertest')
const { urlDoBanco, prepararBanco, limparBanco, aplicarArquivoSql, MIGRATION_RLS, MIGRATION_RLS_REVERTER } = require('./setup')

const temBanco = Boolean(urlDoBanco())
const descrever = temBanco ? describe : describe.skip

descrever('RLS nas tabelas principais (Postgres real)', () => {
  let banco, pool, ctx, a, b
  const comoDono = async (texto, params) => (await banco.pool.query(texto, params)).rows
  const comoA = fn => ctx.executarComUsuario({ userId: a.id }, fn)

  beforeAll(async () => {
    banco = await prepararBanco({ rls: true })
    pool = banco.poolApp
    ctx = require('../../src/db/requestContext')
    const criar = async nome => (await comoDono("INSERT INTO users (email, plan, plan_active) VALUES ($1, 'pro', TRUE) RETURNING id, email", [`${nome}@teste.local`]))[0]
    a = await criar('rls-a')
    b = await criar('rls-b')
    for (const u of [a, b]) {
      const [conta] = await comoDono("INSERT INTO contas (user_id, platform, handle, tipo) VALUES ($1, 'instagram', $2, 'NICHO') RETURNING id", [u.id, `@${u.email}`])
      u.conta = conta.id
      u.token = (await comoDono("INSERT INTO tokens (conta_id, platform, access_token) VALUES ($1, 'instagram', 'x') RETURNING id", [conta.id]))[0].id
      u.post = (await comoDono("INSERT INTO posts (user_id, text, platforms, scheduled_at, status) VALUES ($1, 'vence agora', ARRAY['instagram'], NOW() - INTERVAL '1 minute', 'scheduled') RETURNING id", [u.id]))[0].id
      u.log = (await comoDono("INSERT INTO logs (type, message, user_id) VALUES ('ok', 'log do usuário', $1) RETURNING id", [u.id]))[0].id
    }
    await comoDono("INSERT INTO logs (type, message, conta_id) VALUES ('ok', 'log de sistema da conta de A', $1)", [a.conta])
    await comoDono("INSERT INTO logs (type, message) VALUES ('ok', 'log de sistema sem dono')")
  })

  afterAll(async () => { await limparBanco(banco) })

  test('sem WHERE, cada usuário só enxerga as próprias linhas nas 4 tabelas', async () => {
    const ver = () => Promise.all(['contas', 'tokens', 'posts'].map(t => pool.query(`SELECT id FROM ${t}`).then(r => r.rows.map(x => x.id))))
    const [contas, tokens, posts] = await comoA(ver)
    expect({ contas, tokens, posts }).toEqual({ contas: [a.conta], tokens: [a.token], posts: [a.post] })
    const logs = await comoA(() => pool.query('SELECT message FROM logs ORDER BY id').then(r => r.rows.map(x => x.message)))
    expect(logs).toEqual(['log do usuário', 'log de sistema da conta de A'])
  })

  test('A não altera nem apaga linhas de B (0 linhas, sem erro), e B continua intacto', async () => {
    const afetadas = await comoA(async () => [
      (await pool.query("UPDATE posts SET text = 'invadido' WHERE id = $1", [b.post])).rowCount,
      (await pool.query('DELETE FROM tokens WHERE id = $1', [b.token])).rowCount,
      (await pool.query("UPDATE contas SET handle = 'invadido' WHERE id = $1", [b.conta])).rowCount,
      (await pool.query('DELETE FROM logs WHERE id = $1', [b.log])).rowCount,
    ])
    expect(afetadas).toEqual([0, 0, 0, 0])
    const [linha] = await comoDono('SELECT (SELECT text FROM posts WHERE id = $1) AS texto, (SELECT COUNT(*)::int FROM tokens WHERE id = $2) AS tokens', [b.post, b.token])
    expect(linha).toEqual({ texto: 'vence agora', tokens: 1 })
  })

  test('A não grava linha em nome de B, nem log de sistema', async () => {
    await expect(comoA(() => pool.query("INSERT INTO posts (user_id, text, platforms, scheduled_at) VALUES ($1, 'x', ARRAY['instagram'], NOW())", [b.id]))).rejects.toThrow(/row-level security/)
    await expect(comoA(() => pool.query("INSERT INTO tokens (conta_id, platform, access_token) VALUES ($1, 'instagram', 'x')", [b.conta]))).rejects.toThrow(/row-level security/)
    await expect(comoA(() => pool.query("INSERT INTO logs (type, message) VALUES ('ok', 'sem dono')"))).rejects.toThrow(/row-level security/)
  })

  test('sem contexto (nem usuário nem sistema), o app não vê nada: falha fechada', async () => {
    const contagens = await Promise.all(['contas', 'tokens', 'posts', 'logs'].map(t => pool.query(`SELECT COUNT(*)::int AS n FROM ${t}`).then(r => r.rows[0].n)))
    expect(contagens).toEqual([0, 0, 0, 0])
  })

  test('registrarLog grava log de sistema e de outro usuário dentro de uma requisição (Review Focus 5)', async () => {
    const { registrarLog } = require('../../src/repositories/logsRepository')
    await comoA(async () => {
      await registrarLog({ type: 'info', message: 'sistema dentro da requisição' })
      await registrarLog({ type: 'info', message: 'aviso para B', user_id: b.id })
      await registrarLog({ type: 'info', message: 'do próprio A', user_id: a.id })
    })
    const gravados = await comoDono("SELECT message, user_id FROM logs WHERE message IN ('sistema dentro da requisição', 'aviso para B', 'do próprio A') ORDER BY id")
    expect(gravados).toEqual([
      { message: 'sistema dentro da requisição', user_id: null },
      { message: 'aviso para B', user_id: b.id },
      { message: 'do próprio A', user_id: a.id },
    ])
  })

  test('como sistema, o agendador reserva os posts vencidos dos dois usuários', async () => {
    const postsRepo = require('../../src/infra/db/postsRepository')
    expect(await postsRepo.reservarPostsPendentes()).toEqual([])
    const reservados = await ctx.executarComoSistema(() => postsRepo.reservarPostsPendentes())
    expect(reservados.map(p => p.id).sort()).toEqual([a.post, b.post].sort())
    await comoDono("UPDATE posts SET status = 'scheduled' WHERE id = ANY($1)", [[a.post, b.post]])
  })

  test('o login de um usuário funciona sem contexto, pela conexão de sistema (Review Focus 3)', async () => {
    await comoDono('INSERT INTO credentials (user_id, password_hash) VALUES ($1, $2)', [a.id, await bcrypt.hash('senha-de-teste-123', 4)])
    const app = require('../../src/server')

    const resposta = await request(app).post('/auth/login/login').send({ email: a.email, password: 'senha-de-teste-123' })

    expect(resposta.status).toBe(200)
    // O log do login é gravado sem esperar a resposta (addLog): aguarda até 2 s.
    let log
    for (let tentativa = 0; tentativa < 20 && !log; tentativa++) {
      [log] = await comoDono("SELECT user_id FROM logs WHERE message = 'Login realizado com sucesso' ORDER BY id DESC LIMIT 1")
      if (!log) await new Promise(resolve => setTimeout(resolve, 100))
    }
    expect(log).toEqual({ user_id: a.id })
  })

  test('a reversão desliga o RLS e a 078 pode ser aplicada de novo', async () => {
    await aplicarArquivoSql(banco.urlDono, MIGRATION_RLS_REVERTER)
    const semRls = await pool.query('SELECT COUNT(*)::int AS n FROM posts')
    expect(semRls.rows[0].n).toBe(2)
    await aplicarArquivoSql(banco.urlDono, MIGRATION_RLS)
    expect((await pool.query('SELECT COUNT(*)::int AS n FROM posts')).rows[0].n).toBe(0)
    const [estado] = await comoDono("SELECT bool_and(relrowsecurity AND relforcerowsecurity) AS ativo FROM pg_class WHERE relname IN ('contas', 'tokens', 'posts', 'logs') AND relkind = 'r'")
    expect(estado.ativo).toBe(true)
  })
})
