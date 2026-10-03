const pool = require('../db/pool')
const { predicadoPostAgendadoVencido, predicadoProcessingParado } = require('../infra/db/postsRepository')
const { eligiblePostPredicate } = require('./mediaCleanupService')

// Detector de trabalho do agendador externo (plano docs/superpowers/plans/2026-10-02-agendador-externo-sleep.md,
// Task 3): consultas baratas (SELECT EXISTS) que o tick do cron faz direto no banco para decidir se
// vale acordar a API. Usam os mesmos critérios das rotinas reais (postsRepository e
// mediaCleanupService), para não acordar à toa nem deixar trabalho parado. Cruzam usuários: quem
// chama roda como sistema.

// Datas guardadas como texto no JSON da pendência: só converte o que parece ISO, para um valor
// malformado não derrubar a consulta inteira (vira NULL).
const dataDoJson = campo => `(CASE WHEN pa.instagram_pending->>'${campo}' ~ '^\\d{4}-\\d{2}-\\d{2}' THEN (pa.instagram_pending->>'${campo}')::timestamptz END)`

// Pendência da Zernio que nunca se resolve (webhook perdido) não pode manter a API acordada para
// sempre: depois de 48 h do horário agendado (ou da criação), deixa de contar como trabalho.
const SQL_POSTS = `
  SELECT
    EXISTS (SELECT 1 FROM posts p WHERE ${predicadoPostAgendadoVencido('p')})
    OR EXISTS (SELECT 1 FROM posts p WHERE ${predicadoProcessingParado('p')})
    OR EXISTS (SELECT 1 FROM post_first_comments fc WHERE fc.status = 'pending')
    OR EXISTS (
      SELECT 1 FROM post_accounts pa
       WHERE pa.instagram_pending IS NOT NULL
         AND COALESCE(pa.instagram_pending->>'provider', '') <> 'zernio'
    )
    OR EXISTS (
      SELECT 1 FROM post_accounts pa
       WHERE pa.instagram_pending->>'provider' = 'zernio'
         AND (
           COALESCE(pa.instagram_pending->>'scheduled', '') <> 'true'
           OR ${dataDoJson('scheduledFor')} <= NOW()
         )
         AND COALESCE(${dataDoJson('scheduledFor')}, ${dataDoJson('criadoEm')}, NOW()) > NOW() - INTERVAL '48 hours'
    ) AS existe`

async function haPostsParaProcessar() {
  const { rows } = await pool.query(SQL_POSTS)
  return rows[0]?.existe === true
}

async function haMidiaParaLimpar() {
  const { rows } = await pool.query(`SELECT EXISTS (SELECT 1 FROM posts p WHERE ${eligiblePostPredicate('p')}) AS existe`)
  return rows[0]?.existe === true
}

// Mesmo critério de renovarTodos depois de atualizarStatusTokens (status expired/expiring),
// calculado direto pela data: o status gravado só é atualizado quando a renovação roda.
async function haTokensParaRenovar() {
  const { rows } = await pool.query(`SELECT EXISTS (SELECT 1 FROM tokens t WHERE t.expires_at IS NOT NULL AND t.expires_at < NOW() + INTERVAL '7 days') AS existe`)
  return rows[0]?.existe === true
}

// Mídia e tokens só no primeiro tick de cada janela de 6 h (hora UTC múltipla de 6, minuto < 5),
// espelhando o 0 */6 dos tokens e limitando quantas vezes a API acorda por causa deles.
function naJanelaDeManutencao(agora) {
  return agora.getUTCHours() % 6 === 0 && agora.getUTCMinutes() < 5
}

async function detectarTrabalho({ agora = new Date() } = {}) {
  const posts = await haPostsParaProcessar()
  if (!naJanelaDeManutencao(agora)) return { posts, midia: false, tokens: false }
  const [midia, tokens] = await Promise.all([haMidiaParaLimpar(), haTokensParaRenovar()])
  return { posts, midia, tokens }
}

module.exports = { haPostsParaProcessar, haMidiaParaLimpar, haTokensParaRenovar, detectarTrabalho }
