const { Pool, types } = require('pg')
const { opcoesPool } = require('./poolConfig')
const { usuarioAtual } = require('./requestContext')

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

// ── Usuário da requisição em cada consulta (RLS) ─────────────────────────────
// Plano docs/superpowers/plans/2026-10-02-papel-banco-e-rls.md, Task 6. Com
// DB_CONTEXTO_USUARIO=ligado e um usuário no contexto (src/db/requestContext.js),
// cada consulta roda numa transação curta com app.user_id/app.user_role, que as
// políticas de RLS leem. Sem a variável, ou fora de uma requisição autenticada,
// o pool se comporta exatamente como o do pg. A variável existe para o código
// entrar no main antes do rollout sem mudar produção.
const ROLE_SEGURO = /^[a-z_]{1,32}$/

function contextoAtivo() {
  if (process.env.DB_CONTEXTO_USUARIO !== 'ligado') return null
  return usuarioAtual()
}

// Uma ida ao banco só: user_id é inteiro e o role é restrito a [a-z_], então
// entram como literais sem risco de injeção.
function sqlAplicarContexto({ userId, role }, local) {
  const papel = ROLE_SEGURO.test(role) ? role : 'user'
  return `SELECT set_config('app.user_id', '${Number(userId)}', ${local}), set_config('app.user_role', '${papel}', ${local})`
}

const connectBase = pool.connect.bind(pool)
const queryBase = pool.query.bind(pool)

pool.query = function query(...args) {
  const contexto = contextoAtivo()
  // Callback no último argumento: estilo antigo do pg, que o app não usa; segue sem contexto.
  if (!contexto || typeof args[args.length - 1] === 'function') return queryBase(...args)
  return (async () => {
    const client = await connectBase()
    try {
      await client.query(`BEGIN; ${sqlAplicarContexto(contexto, true)}`)
      const resultado = await client.query(...args)
      await client.query('COMMIT')
      client.release()
      return resultado
    } catch (err) {
      await client.query('ROLLBACK').then(() => client.release(), erroRollback => client.release(erroRollback))
      throw err
    }
  })()
}

// O pg chama connect(callback) por dentro do pool.query: esse caminho fica intacto.
// Para quem pega um client (transações do app), o contexto vale para a sessão
// inteira do client e é zerado no release, para não vazar para a próxima
// requisição que pegar o mesmo client.
pool.connect = function connect(callback) {
  if (typeof callback === 'function') return connectBase(callback)
  const contexto = contextoAtivo()
  if (!contexto) return connectBase()
  return connectBase().then(async client => {
    try {
      await client.query(sqlAplicarContexto(contexto, false))
    } catch (err) {
      client.release(err)
      throw err
    }
    const releaseOriginal = client.release
    let liberado = false
    client.release = erro => {
      if (liberado) return
      liberado = true
      client.release = releaseOriginal
      if (erro) return releaseOriginal(erro)
      // Se o reset falhar (ex.: transação abortada esquecida aberta), o client é descartado.
      client.query('RESET app.user_id; RESET app.user_role').then(() => releaseOriginal(), erroReset => releaseOriginal(erroReset))
    }
    return client
  })
}

module.exports = pool
