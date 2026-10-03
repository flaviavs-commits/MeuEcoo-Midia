const { AsyncLocalStorage } = require('async_hooks')

// Usuário da requisição disponível em qualquer ponto da cadeia assíncrona, até a camada de banco,
// sem passar parâmetro por toda a pilha. É a base do RLS (plano
// docs/superpowers/plans/2026-10-02-papel-banco-e-rls.md, Task 5): o pool usa usuarioAtual() para
// aplicar app.user_id em cada consulta. requireAuth e requireApiKey abrem o contexto; fora de uma
// requisição autenticada não há usuário: os fluxos que cruzam usuários de propósito (agendador,
// cron, webhooks, login, callbacks de OAuth) rodam marcados com executarComoSistema e usam a conexão
// de sistema; o que não for nem usuário nem sistema não vê linhas com RLS (falha fechada).
const armazenamento = new AsyncLocalStorage()
const SISTEMA = Object.freeze({ sistema: true })

function executarComUsuario({ userId, role } = {}, fn) {
  const id = Number(userId)
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('executarComUsuario exige um userId válido')
  return armazenamento.run(Object.freeze({ userId: id, role: String(role || 'user') }), fn)
}

function usuarioAtual() {
  const contexto = armazenamento.getStore()
  return contexto && !contexto.sistema ? contexto : null
}

// Ponto de entrada de um fluxo de sistema. Também serve para um trecho de sistema dentro de uma
// requisição (ex.: log sem dono), que não deve herdar o usuário de quem chamou. Um requireAuth
// mais adiante na mesma cadeia abre um contexto de usuário por cima deste.
function executarComoSistema(fn) {
  return armazenamento.run(SISTEMA, fn)
}

function emModoSistema() {
  return armazenamento.getStore()?.sistema === true
}

// Middleware do Express para montar na frente das rotas públicas que cruzam usuários.
function rotaDeSistema(_req, _res, next) {
  executarComoSistema(next)
}

module.exports = { executarComUsuario, usuarioAtual, executarComoSistema, emModoSistema, rotaDeSistema }
