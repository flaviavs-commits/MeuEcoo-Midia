// Tick do agendador externo (plano docs/superpowers/plans/2026-10-02-agendador-externo-sleep.md,
// Task 4). Roda como serviço de cron do Railway a cada 5 min (serviço meuecoo-midia-agendador, ver README): consulta o
// banco com o detector de trabalho e só chama /api/cron/* pela rede privada quando há o que fazer,
// para a API poder dormir no modo Sleep. Enquanto a API acorda, ela responde 502/503: repete com
// espera crescente. 4xx (ex.: CRON_SECRET errado) não repete.
//
// Variáveis: AGENDADOR_API_URL, CRON_SECRET e o acesso ao banco. O detector cruza usuários, então
// usa a conexão de sistema: DATABASE_URL apontando para meuecoo_sistema (ou DATABASE_URL do app +
// DATABASE_SISTEMA_URL + DB_CONTEXTO_USUARIO=ligado).
const ESPERAS_SEG = [1, 2, 4, 8, 16, 30]
const REPETE = new Set([502, 503])
const ENDPOINTS = { posts: '/api/cron/process-posts', midia: '/api/cron/media-cleanup', tokens: '/api/cron/renew-tokens' }

async function chamarEndpoint(caminho, {
  baseUrl,
  segredo,
  fetchImpl = fetch,
  esperar = ms => new Promise(resolve => setTimeout(resolve, ms)),
  esperasSeg = ESPERAS_SEG,
  timeoutMs = 10000,
} = {}) {
  const url = `${String(baseUrl).replace(/\/$/, '')}${caminho}`
  let status = null
  for (let tentativa = 1; tentativa <= esperasSeg.length + 1; tentativa++) {
    const controle = new AbortController()
    const limite = setTimeout(() => controle.abort(), timeoutMs)
    let repetir
    try {
      const resposta = await fetchImpl(url, { method: 'GET', headers: { Authorization: `Bearer ${segredo}` }, signal: controle.signal })
      status = resposta.status
      if (resposta.ok) return { ok: true, status, tentativas: tentativa }
      repetir = REPETE.has(status)
    } catch {
      status = null
      repetir = true
    } finally {
      clearTimeout(limite)
    }
    if (!repetir || tentativa > esperasSeg.length) return { ok: false, status, tentativas: tentativa }
    await esperar(esperasSeg[tentativa - 1] * 1000)
  }
  return { ok: false, status, tentativas: esperasSeg.length + 1 }
}

async function executarTick({ detectar, chamar, log = console }) {
  const trabalho = await detectar()
  const pendentes = Object.keys(ENDPOINTS).filter(tipo => trabalho[tipo])
  if (!pendentes.length) {
    log.log('agendador: nada a fazer')
    return 0
  }
  let falhou = false
  for (const tipo of pendentes) {
    const resultado = await chamar(ENDPOINTS[tipo])
    log.log(`agendador: ${ENDPOINTS[tipo]} → ${resultado.status ?? 'sem resposta'} em ${resultado.tentativas} tentativa(s)`)
    if (!resultado.ok) falhou = true
  }
  return falhou ? 1 : 0
}

module.exports = { chamarEndpoint, executarTick }

if (require.main === module) {
  const baseUrl = process.env.AGENDADOR_API_URL
  const segredo = process.env.CRON_SECRET
  if (!baseUrl || !segredo) {
    console.error('agendador: AGENDADOR_API_URL e CRON_SECRET são obrigatórios')
    process.exitCode = 1
  } else {
    const pool = require('../src/db/pool')
    const { executarComoSistema } = require('../src/db/requestContext')
    const { detectarTrabalho } = require('../src/services/agendadorTrabalho')
    executarTick({
      detectar: () => executarComoSistema(() => detectarTrabalho()),
      chamar: caminho => chamarEndpoint(caminho, { baseUrl, segredo }),
    })
      .then(codigo => { process.exitCode = codigo })
      .catch(err => { console.error('agendador: falha no tick:', err?.message || err); process.exitCode = 1 })
      .finally(async () => {
        await pool.end().catch(() => {})
        await require('../src/db/poolSistema').encerrarPoolDeSistema().catch(() => {})
      })
  }
}
