const pool = require('../db/pool')

// Por enquanto só a criação usada pela importação de kit. As demais consultas
// de rascunhos ainda moram em src/routes/drafts.js (migrá-las é a Fase 1 do
// roadmap em docs/ARQUITETURA-EVOLUTIVA.md).
async function criar({ userId, title, text, platforms, textByPlatform, mediaItems }) {
  const itens = Array.isArray(mediaItems) && mediaItems.length ? mediaItems : null
  const { rows: [draft] } = await pool.query(
    `INSERT INTO drafts (user_id, title, text, platforms, text_by_platform, media_path, media_type, media_items)
     VALUES ($1, $2, $3, $4::text[], $5::jsonb, $6, $7, $8::jsonb)
     RETURNING id`,
    [
      userId,
      title || null,
      text || null,
      platforms || [],
      textByPlatform && Object.keys(textByPlatform).length ? JSON.stringify(textByPlatform) : null,
      itens ? itens[0].path : null,
      itens ? itens[0].type : null,
      itens ? JSON.stringify(itens) : null,
    ]
  )
  return draft
}

module.exports = { criar }
