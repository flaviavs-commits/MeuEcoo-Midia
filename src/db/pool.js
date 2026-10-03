const { Pool, types } = require('pg')
const { opcoesPool } = require('./poolConfig')

// Colunas "timestamp without time zone" são gravadas em UTC (NOW() do Postgres
// está em UTC). Por padrão o driver as interpreta como horário local do
// processo Node, o que adianta as datas em 3h. Forçamos a leitura como UTC.
types.setTypeParser(types.builtins.TIMESTAMP, str => str ? new Date(str + 'Z') : null)

const pool = new Pool(opcoesPool(process.env.DATABASE_URL))

// O driver pg emite 'error' de forma assíncrona quando um cliente ocioso no
// pool perde a conexão (ex.: o Postgres do Railway derruba conexões idle).
// Sem este listener, o Node trata isso como uncaughtException e derruba o
// processo inteiro (server.js chama process.exit(1) nesse handler),
// matando qualquer requisição em andamento — inclusive endpoints pesados
// como /api/posts/analytics, que pareciam "travar" ou "demorar" quando na
// verdade o servidor tinha caído e reiniciado no meio da resposta. O pool
// já remove sozinho o cliente com erro; só precisamos logar e seguir vivo.
pool.on('error', (err) => {
  console.error('Erro em cliente ocioso do pool PostgreSQL:', err?.message || err)
})

module.exports = pool
