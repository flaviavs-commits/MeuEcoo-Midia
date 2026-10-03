// Onde roda o agendador (plano docs/superpowers/plans/2026-10-02-agendador-externo-sleep.md):
// - internal (padrão): o node-cron roda dentro da API, como sempre;
// - external: a API não agenda nada e um serviço de cron do Railway chama /api/cron/* só quando há
//   trabalho, para a API poder dormir no modo Sleep.
// Valor desconhecido impede a subida: um erro de digitação não pode desligar as publicações em silêncio.
const MODOS = ['internal', 'external']

function resolverModoAgendador(env = process.env) {
  const valor = String(env.SCHEDULER_MODE || '').trim().toLowerCase()
  if (!valor) return 'internal'
  if (!MODOS.includes(valor)) throw new Error(`SCHEDULER_MODE inválido: "${env.SCHEDULER_MODE}". Use internal ou external.`)
  return valor
}

function iniciarTarefasDeFundo({ modo, scheduler }) {
  if (modo !== 'internal') return false
  scheduler.start()
  return true
}

module.exports = { resolverModoAgendador, iniciarTarefasDeFundo }
