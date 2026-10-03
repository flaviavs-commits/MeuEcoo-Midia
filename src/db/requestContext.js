const { AsyncLocalStorage } = require('async_hooks')

// Usuário da requisição disponível em qualquer ponto da cadeia assíncrona, até a camada de banco,
// sem passar parâmetro por toda a pilha. É a base do RLS (plano
// docs/superpowers/plans/2026-10-02-papel-banco-e-rls.md, Task 5): o pool usa usuarioAtual() para
// aplicar app.user_id em cada consulta. requireAuth e requireApiKey abrem o contexto; fora de uma
// requisição autenticada (agendador, webhooks, login) não há usuário.
const armazenamento = new AsyncLocalStorage()

function executarComUsuario({ userId, role } = {}, fn) {
  const id = Number(userId)
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('executarComUsuario exige um userId válido')
  return armazenamento.run(Object.freeze({ userId: id, role: String(role || 'user') }), fn)
}

function usuarioAtual() {
  return armazenamento.getStore() || null
}

// Para um trecho de sistema dentro de uma requisição (ex.: log sem dono), que não deve herdar o
// usuário de quem chamou.
function executarSemUsuario(fn) {
  return armazenamento.exit(fn)
}

module.exports = { executarComUsuario, usuarioAtual, executarSemUsuario }
