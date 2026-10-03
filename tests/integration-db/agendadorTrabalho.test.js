// Detector de trabalho do agendador externo contra o SQL real (src/services/agendadorTrabalho.js).
const { urlDoBanco, prepararBanco, limparBanco } = require('./setup')

const temBanco = Boolean(urlDoBanco())
const descrever = temBanco ? describe : describe.skip

descrever('detector de trabalho (Postgres real)', () => {
  let banco, usuario, conta
  const sql = (texto, params) => banco.pool.query(texto, params)
  const detector = () => require('../../src/services/agendadorTrabalho')
  const novoPost = async (status, extra = '') => (await sql(`INSERT INTO posts (user_id, text, platforms, scheduled_at, status${extra ? ', ' + extra.split('=')[0] : ''}) VALUES ($1, 'x', ARRAY['instagram'], NOW() - INTERVAL '1 minute', $2${extra ? ', ' + extra.split('=')[1] : ''}) RETURNING id`, [usuario, status])).rows[0].id
  const pendencia = async (postId, json) => sql('INSERT INTO post_accounts (post_id, account_id, instagram_pending) VALUES ($1, $2, $3::jsonb)', [postId, conta, JSON.stringify(json)])

  beforeAll(async () => {
    banco = await prepararBanco()
    usuario = (await sql("INSERT INTO users (email) VALUES ('detector@teste.local') RETURNING id")).rows[0].id
    conta = (await sql("INSERT INTO contas (user_id, platform, handle, tipo) VALUES ($1, 'instagram', '@d', 'NICHO') RETURNING id", [usuario])).rows[0].id
  })
  afterAll(async () => { await limparBanco(banco) })
  beforeEach(async () => { await sql('DELETE FROM post_accounts'); await sql('DELETE FROM posts'); await sql('DELETE FROM tokens') })

  test('banco sem trabalho: nada a fazer', async () => {
    expect(await detector().detectarTrabalho({ agora: new Date('2026-10-02T12:01:00Z') })).toEqual({ posts: false, midia: false, tokens: false })
  })

  test('post agendado vencido conta, mesmo com a rede marcada como fora do ar (Review Focus 1)', async () => {
    await sql("INSERT INTO platform_health (platform, status, fail_count, checked_at) VALUES ('instagram', 'down', 3, NOW() - INTERVAL '2 hours') ON CONFLICT (platform) DO UPDATE SET status = 'down'")
    await novoPost('scheduled')
    expect(await detector().haPostsParaProcessar()).toBe(true)
  })

  test('pendência Zernio agendada para o futuro não conta; vencida há menos de 48 h conta; há mais, não', async () => {
    const post = await novoPost('processing')
    await pendencia(post, { provider: 'zernio', scheduled: true, scheduledFor: new Date(Date.now() + 3600e3).toISOString() })
    expect(await detector().haPostsParaProcessar()).toBe(false)
    await sql('DELETE FROM post_accounts')
    await pendencia(post, { provider: 'zernio', scheduled: true, scheduledFor: new Date(Date.now() - 3600e3).toISOString() })
    expect(await detector().haPostsParaProcessar()).toBe(true)
    await sql('DELETE FROM post_accounts')
    await pendencia(post, { provider: 'zernio', scheduled: true, scheduledFor: new Date(Date.now() - 72 * 3600e3).toISOString() })
    expect(await detector().haPostsParaProcessar()).toBe(false)
  })

  test('data malformada na pendência não derruba a consulta', async () => {
    const post = await novoPost('processing')
    await pendencia(post, { provider: 'zernio', scheduled: true, scheduledFor: 'amanhã cedo', criadoEm: 'ontem' })
    await expect(detector().haPostsParaProcessar()).resolves.toBe(true)
  })

  test('mídia vencida e token vencendo contam na janela de manutenção', async () => {
    await novoPost('error', "media_path,media_cleanup_after='https://blob.example/a.jpg', NOW() - INTERVAL '1 day'")
    await sql("INSERT INTO tokens (conta_id, platform, access_token, expires_at) VALUES ($1, 'instagram', 'x', NOW() + INTERVAL '2 days')", [conta])
    expect(await detector().detectarTrabalho({ agora: new Date('2026-10-02T18:02:00Z') })).toEqual({ posts: false, midia: true, tokens: true })
  })
})
