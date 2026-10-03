// Prepara um Postgres real para os testes de integração de banco.
//
// TEST_DATABASE_URL aponta para um banco DESCARTÁVEL (o da CI, ou um container local:
// `docker run -d -p 5433:5432 -e POSTGRES_PASSWORD=teste postgres:18` e
// TEST_DATABASE_URL=postgresql://postgres:teste@localhost:5433/postgres). O schema é recriado do
// zero: nunca aponte para um banco com dados.
//
// O schema sai de src/db/schema-base.sql (estrutura de produção, sem dados) e do
// runtimeMigrations.js por cima dele, como no startup do servidor. As migrations numeradas de
// src/db/migrations não servem de ponto de partida: a 003 já altera tabelas que nenhuma delas cria
// (veja o cabeçalho do schema-base.sql).
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { Client, Pool } = require('pg')

const SCHEMA_BASE = path.join(__dirname, '..', '..', 'src', 'db', 'schema-base.sql')
const SCRIPT_PAPEL_APP = path.join(__dirname, '..', '..', 'scripts', 'db', 'criar-papel-app.sql')
const SCRIPT_PAPEL_SISTEMA = path.join(__dirname, '..', '..', 'scripts', 'db', 'criar-papel-sistema.sql')
const MIGRATION_RLS = path.join(__dirname, '..', '..', 'src', 'db', 'migrations', '078_rls_tabelas_principais.sql')
const MIGRATION_RLS_REVERTER = path.join(__dirname, '..', '..', 'src', 'db', 'migrations', '078_rls_tabelas_principais.reverter.sql')

async function aplicarArquivoSql(url, arquivo) {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    await client.query(fs.readFileSync(arquivo, 'utf8'))
  } finally {
    await client.end()
  }
}

function urlDoBanco() {
  return process.env.TEST_DATABASE_URL || null
}

async function recriarSchema(url) {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE')
    await client.query('CREATE SCHEMA public')
  } finally {
    await client.end()
  }
}

async function aplicarSchemaBase(url) {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    await client.query(fs.readFileSync(SCHEMA_BASE, 'utf8'))
  } finally {
    await client.end()
  }
}

// Roda um script de papel como o psql rodaria: a variável :'<nome>' vira um literal.
async function aplicarScriptPapel(urlDono, arquivo, variavel, senha) {
  const literal = `'${String(senha).replace(/'/g, "''")}'`
  const sql = fs.readFileSync(arquivo, 'utf8').replace(new RegExp(`:'${variavel}'`, 'g'), literal)
  const client = new Client({ connectionString: urlDono })
  await client.connect()
  try {
    await client.query(sql)
  } finally {
    await client.end()
  }
}

const aplicarScriptPapelApp = (urlDono, senha) => aplicarScriptPapel(urlDono, SCRIPT_PAPEL_APP, 'senha_app', senha)
const aplicarScriptPapelSistema = (urlDono, senha) => aplicarScriptPapel(urlDono, SCRIPT_PAPEL_SISTEMA, 'senha_sistema', senha)

function urlComo(url, usuario, senha) {
  const nova = new URL(url)
  nova.username = usuario
  nova.password = senha
  return nova.toString()
}

// O banco sobe como em produção depois do rollout da fase 1: migrations com o dono (pool próprio)
// e o pool do app (src/db/pool.js) conectado como meuecoo_app, criado pelo script real. Assim
// toda suíte que usa as rotas prova também que o app funciona sem superusuário.
// O papel meuecoo_sistema também é criado; DATABASE_SISTEMA_URL aponta para ele, e o pool de
// sistema só é usado com DB_CONTEXTO_USUARIO=ligado (cada suíte decide).
// rls: true liga o contexto no pool (DB_CONTEXTO_USUARIO) e aplica a migration 078, como no rollout
// da fase 2; a suíte inteira passa a rodar com RLS em contas, tokens, posts e logs.
async function prepararBanco({ rls = false } = {}) {
  const urlDono = urlDoBanco()
  if (!urlDono) throw new Error('TEST_DATABASE_URL não definida')
  await recriarSchema(urlDono)
  await aplicarSchemaBase(urlDono)

  const poolDono = new Pool({ connectionString: urlDono, max: 3 })
  const senhaApp = crypto.randomBytes(24).toString('hex')
  const urlApp = urlComo(urlDono, 'meuecoo_app', senhaApp)
  const senhaSistema = crypto.randomBytes(24).toString('hex')
  const urlSistema = urlComo(urlDono, 'meuecoo_sistema', senhaSistema)
  process.env.DATABASE_SISTEMA_URL = urlSistema
  // src/db/pool.js se conecta em DATABASE_URL no require: precisa apontar para o app antes.
  process.env.DATABASE_URL = urlApp
  const { runMigrations } = require('../../src/db/runtimeMigrations')
  await runMigrations({ pool: poolDono })
  await aplicarScriptPapelApp(urlDono, senhaApp)
  await aplicarScriptPapelSistema(urlDono, senhaSistema)
  if (rls) {
    process.env.DB_CONTEXTO_USUARIO = 'ligado'
    await aplicarArquivoSql(urlDono, MIGRATION_RLS)
  }
  const poolApp = require('../../src/db/pool')
  return { urlDono, urlApp, urlSistema, pool: poolDono, poolApp }
}

async function limparBanco(banco) {
  if (banco?.pool) await banco.pool.end().catch(() => {})
  if (banco?.poolApp) await banco.poolApp.end().catch(() => {})
  await require('../../src/db/poolSistema').encerrarPoolDeSistema().catch(() => {})
}

module.exports = { urlDoBanco, prepararBanco, limparBanco, aplicarScriptPapelApp, aplicarScriptPapelSistema, urlComo, aplicarArquivoSql, MIGRATION_RLS, MIGRATION_RLS_REVERTER }
