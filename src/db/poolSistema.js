const { opcoesPool } = require('./poolConfig')

// Conexão de sistema (papel meuecoo_sistema, BYPASSRLS): só para fluxos marcados com
// executarComoSistema (src/db/requestContext.js). Criada sob demanda a partir de
// DATABASE_SISTEMA_URL; sem a variável, devolve null e o pool padrão atende (como antes do RLS).
// Plano docs/superpowers/plans/2026-10-02-papel-banco-e-rls.md, Task 7.
let poolCriado = null

function poolDeSistema(env = process.env, { Pool } = require('pg')) {
  const url = String(env.DATABASE_SISTEMA_URL || '').trim()
  if (!url) return null
  if (!poolCriado) {
    poolCriado = new Pool(opcoesPool(url, { max: 5 }))
    poolCriado.on('error', err => console.error('Erro em cliente ocioso do pool de sistema:', err?.message || err))
  }
  return poolCriado
}

async function encerrarPoolDeSistema() {
  if (!poolCriado) return
  const encerrando = poolCriado
  poolCriado = null
  await encerrando.end()
}

module.exports = { poolDeSistema, encerrarPoolDeSistema }
