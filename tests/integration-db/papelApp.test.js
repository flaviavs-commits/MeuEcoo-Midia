// O papel meuecoo_app (scripts/db/criar-papel-app.sql): faz o que o app precisa e nada além.
// Plano docs/superpowers/plans/2026-10-02-papel-banco-e-rls.md, Task 3.
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const { urlDoBanco, prepararBanco, limparBanco, aplicarScriptPapelApp, urlComo } = require('./setup')

const temBanco = Boolean(urlDoBanco())
const descrever = temBanco ? describe : describe.skip

descrever('papel meuecoo_app (Postgres real)', () => {
  let banco
  const app = (texto, params) => banco.poolApp.query(texto, params)
  const negado = expect.objectContaining({ message: expect.stringMatching(/permission denied|must be superuser|must be owner|não tem permissão|permissão negada/i) })

  beforeAll(async () => { banco = await prepararBanco() })
  afterAll(async () => { await limparBanco(banco) })

  test('não é superusuário, não ignora RLS e não cria banco nem papel', async () => {
    const { rows } = await app("SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user")
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false })
  })

  test('lê, grava, altera e apaga linhas (DML)', async () => {
    const { rows: [log] } = await app("INSERT INTO logs (type, message) VALUES ('ok', 'teste do papel') RETURNING id")
    expect((await app('SELECT message FROM logs WHERE id = $1', [log.id])).rows).toEqual([{ message: 'teste do papel' }])
    expect((await app("UPDATE logs SET message = 'alterado' WHERE id = $1", [log.id])).rowCount).toBe(1)
    expect((await app('DELETE FROM logs WHERE id = $1', [log.id])).rowCount).toBe(1)
  })

  test('usa sequências e advisory lock', async () => {
    const { rows: [seq] } = await app("SELECT nextval(pg_get_serial_sequence('logs', 'id')) AS n")
    expect(Number(seq.n)).toBeGreaterThan(0)
    const client = await banco.poolApp.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(1, 2)')
      await client.query('COMMIT')
    } finally { client.release() }
  })

  test('não cria tabela, não lê pg_authid e não executa programa no servidor', async () => {
    await expect(app('CREATE TABLE invasao (id int)')).rejects.toEqual(negado)
    await expect(app('SELECT rolpassword FROM pg_authid')).rejects.toEqual(negado)
    await expect(app("COPY (SELECT 1) TO PROGRAM 'true'")).rejects.toEqual(negado)
    await expect(app('DROP TABLE logs')).rejects.toEqual(negado)
    await expect(app('ALTER TABLE logs ADD COLUMN invasao int')).rejects.toEqual(negado)
  })

  test('tabela criada depois pelo dono (migration futura) já nasce acessível ao app', async () => {
    await banco.pool.query('CREATE TABLE tabela_futura (id SERIAL PRIMARY KEY, nome TEXT)')
    const { rows } = await app("INSERT INTO tabela_futura (nome) VALUES ('nova') RETURNING id, nome")
    expect(rows).toEqual([{ id: 1, nome: 'nova' }])
  })

  test('o script roda de novo sem erro e troca a senha (idempotente)', async () => {
    const novaSenha = 'outra-senha-de-teste-123'
    await aplicarScriptPapelApp(banco.urlDono, novaSenha)
    await aplicarScriptPapelApp(banco.urlDono, novaSenha)
    const client = new Client({ connectionString: urlComo(banco.urlDono, 'meuecoo_app', novaSenha) })
    await client.connect()
    try {
      expect((await client.query('SELECT current_user AS u')).rows[0].u).toBe('meuecoo_app')
    } finally { await client.end() }
  })

  test('o verificar-papel-app.sql dá ok em todas as linhas', async () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'db', 'verificar-papel-app.sql'), 'utf8')
    const { rows } = await banco.pool.query(sql)
    expect(rows.length).toBe(5)
    expect(rows.filter(linha => !linha.ok)).toEqual([])
  })
})
