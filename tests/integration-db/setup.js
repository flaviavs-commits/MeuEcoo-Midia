// Prepara um Postgres real para os testes de integração de banco.
//
// TEST_DATABASE_URL aponta para um banco DESCARTÁVEL (o da CI, ou um container local:
// `docker run -d -p 5433:5432 -e POSTGRES_PASSWORD=teste postgres:18` e
// TEST_DATABASE_URL=postgresql://postgres:teste@localhost:5433/postgres). O schema é recriado do
// zero: nunca aponte para um banco com dados.
//
// O schema sai de dois lugares, como em produção: os SQL numerados de src/db/migrations (aplicados
// em ordem) e o runtimeMigrations.js (o que o servidor roda no startup). Se um banco vazio não
// chegar ao schema atual por esse caminho, o teste-sentinela falha dizendo em qual arquivo.
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const PASTA_MIGRATIONS = path.join(__dirname, '..', '..', 'src', 'db', 'migrations')

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

async function aplicarMigrationsNumeradas(url) {
  const arquivos = fs.readdirSync(PASTA_MIGRATIONS).filter(nome => /^\d+_.*\.sql$/.test(nome)).sort()
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    for (const arquivo of arquivos) {
      try {
        await client.query(fs.readFileSync(path.join(PASTA_MIGRATIONS, arquivo), 'utf8'))
      } catch (error) {
        throw new Error(`Migration ${arquivo} falhou num banco vazio: ${error.message}`, { cause: error })
      }
    }
  } finally {
    await client.end()
  }
  return arquivos.length
}

// Devolve as URLs que as próximas tasks do plano usam. urlApp e urlSistema ficam null até os
// papéis meuecoo_app e meuecoo_sistema existirem (Tasks 3 e 7 do plano de papel de banco e RLS).
async function prepararBanco() {
  const urlDono = urlDoBanco()
  if (!urlDono) throw new Error('TEST_DATABASE_URL não definida')
  await recriarSchema(urlDono)
  const migrationsAplicadas = await aplicarMigrationsNumeradas(urlDono)

  // runtimeMigrations lê o pool de src/db/pool.js, que se conecta em DATABASE_URL no require.
  process.env.DATABASE_URL = urlDono
  const pool = require('../../src/db/pool')
  const { runMigrations } = require('../../src/db/runtimeMigrations')
  await runMigrations()
  return { urlDono, urlApp: null, urlSistema: null, migrationsAplicadas, pool }
}

async function limparBanco(banco) {
  if (banco?.pool) await banco.pool.end().catch(() => {})
}

module.exports = { urlDoBanco, prepararBanco, limparBanco }
