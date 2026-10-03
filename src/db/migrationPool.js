const { opcoesPool } = require('./poolConfig')

// As migrations precisam do dono das tabelas (DDL), mas as requisições não: com
// DATABASE_MIGRATION_URL definida, o startup migra por um pool próprio e o encerra em seguida, e o
// pool das requisições (DATABASE_URL) pode usar um papel sem superusuário (plano
// docs/superpowers/plans/2026-10-02-papel-banco-e-rls.md, Task 2). Sem a variável, tudo segue no
// pool padrão, como antes.
function criarPoolMigracao(env = process.env, { Pool } = require('pg')) {
  const url = String(env.DATABASE_MIGRATION_URL || '').trim()
  if (!url) return null
  // O runMigrations dispara cerca de 17 DDLs em paralelo (Promise.all): com 2 conexões e os 5 s de
  // espera do pool das requisições, as que ficavam na fila estouravam o tempo num banco lento
  // ("timeout exceeded when trying to connect" no deploy de 03/10/2026 17:08) e o servidor
  // reiniciava. Mais conexões e 30 s de espera só aqui; o pool é fechado logo depois.
  const poolMigracao = new Pool({ ...opcoesPool(url, { max: 5 }), connectionTimeoutMillis: 30000 })
  poolMigracao.on('error', err => console.error('Erro em cliente ocioso do pool de migrations:', err?.message || err))
  return poolMigracao
}

module.exports = { criarPoolMigracao }
