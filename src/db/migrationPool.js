const { opcoesPool } = require('./poolConfig')

// As migrations precisam do dono das tabelas (DDL), mas as requisições não: com
// DATABASE_MIGRATION_URL definida, o startup migra por um pool próprio e o encerra em seguida, e o
// pool das requisições (DATABASE_URL) pode usar um papel sem superusuário (plano
// docs/superpowers/plans/2026-10-02-papel-banco-e-rls.md, Task 2). Sem a variável, tudo segue no
// pool padrão, como antes.
function criarPoolMigracao(env = process.env, { Pool } = require('pg')) {
  const url = String(env.DATABASE_MIGRATION_URL || '').trim()
  if (!url) return null
  const poolMigracao = new Pool(opcoesPool(url, { max: 2 }))
  poolMigracao.on('error', err => console.error('Erro em cliente ocioso do pool de migrations:', err?.message || err))
  return poolMigracao
}

module.exports = { criarPoolMigracao }
