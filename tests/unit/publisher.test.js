// Caracterização do publisher (src/infra/social/publisher.js): o resultado de publicar um post em
// cada conta. Providers (Zernio, YouTube) e banco são falsos; tokens são sintéticos.
jest.mock('../../src/db/pool', () => ({ query: jest.fn() }))
jest.mock('../../src/repositories/logsRepository', () => ({ registrarLog: jest.fn().mockResolvedValue(), broadcastEvent: jest.fn() }))
jest.mock('../../src/repositories/tokensRepository', () => ({ renovarToken: jest.fn() }))
jest.mock('../../src/infra/db/postsRepository', () => ({
  atualizarErroPublicacaoConta: jest.fn().mockResolvedValue(),
  obterProviderRequestId: jest.fn().mockResolvedValue('req-fixo-1'),
  salvarInstagramPending: jest.fn().mockResolvedValue(),
  salvarPublicacaoExterna: jest.fn().mockResolvedValue(),
  marcarContaPublicada: jest.fn().mockResolvedValue(),
  listarPostsComInstagramPendente: jest.fn().mockResolvedValue([]),
  limparInstagramPending: jest.fn().mockResolvedValue(),
  existePendenciaInstagramNoPost: jest.fn().mockResolvedValue(false),
  listarContasDoPost: jest.fn().mockResolvedValue([]),
  listarPublicacoesDosPosts: jest.fn().mockResolvedValue([]),
  atualizarStatusPostSeProcessando: jest.fn().mockResolvedValue(true),
  listarPostsComZernioPendentePorMetadata: jest.fn().mockResolvedValue([]),
  listarPostsComZernioPendentePorPostId: jest.fn().mockResolvedValue([]),
}))
jest.mock('../../src/services/tokenCrypto', () => ({ decrypt: valor => valor && `claro:${valor}` }))
jest.mock('../../src/infra/social/instagramPublisher', () => ({ statusContainerInstagram: jest.fn(), finalizarPublicacaoInstagram: jest.fn() }))
jest.mock('../../src/infra/social/zernioPublisher', () => ({
  publicarZernioInstagram: jest.fn(),
  publicarZernioFacebook: jest.fn(),
  publicarZernioYoutube: jest.fn(),
  publicarZernioTiktok: jest.fn(),
}))
jest.mock('../../src/infra/social/zernioClient', () => ({ getPost: jest.fn() }))
jest.mock('../../src/infra/social/youtubePublisher', () => ({ publicarYoutube: jest.fn() }))

const pool = require('../../src/db/pool')
const { registrarLog } = require('../../src/repositories/logsRepository')
const tokensRepo = require('../../src/repositories/tokensRepository')
const postsRepo = require('../../src/infra/db/postsRepository')
const zernio = require('../../src/infra/social/zernioPublisher')
const zernioClient = require('../../src/infra/social/zernioClient')
const { publicarYoutube } = require('../../src/infra/social/youtubePublisher')
const { broadcastEvent } = require('../../src/repositories/logsRepository')
const { publishPost, schedulePost, buscarContaToken, finalizarZernioPendentes, confirmarPublicacaoZernio, confirmarAgendamentoZernio } = require('../../src/infra/social/publisher')

const linhaToken = (extra = {}) => ({ token_id: 40, contaId: 9, accessToken: 'cifrado', refreshToken: null, accountName: 'Perfil', status: 'valid', handle: '@perfil', zernioAccountId: 'zac_1', ...extra })
const conta = (extra = {}) => ({ postAccountId: 100, accountId: 9, platform: 'instagram', handle: '@perfil', ...extra })
const post = (extra = {}) => ({ id: 7, userId: 3, userRole: 'user', text: 'Texto geral', accounts: [conta()], ...extra })
const tokenNoBanco = (...linhas) => { linhas.forEach(l => pool.query.mockResolvedValueOnce({ rows: l ? [l] : [] })) }
const zernioDuplicado = existingPostId => Object.assign(new Error('duplicado'), { name: 'ZernioError', status: 409, details: { details: { existingPostId } } })

beforeEach(() => {
  jest.clearAllMocks()
  postsRepo.obterProviderRequestId.mockResolvedValue('req-fixo-1')
  postsRepo.listarPostsComInstagramPendente.mockResolvedValue([])
  postsRepo.existePendenciaInstagramNoPost.mockResolvedValue(false)
  postsRepo.listarContasDoPost.mockResolvedValue([])
  postsRepo.listarPublicacoesDosPosts.mockResolvedValue([])
  postsRepo.atualizarStatusPostSeProcessando.mockResolvedValue(true)
  postsRepo.listarPostsComZernioPendentePorMetadata.mockResolvedValue([])
  postsRepo.listarPostsComZernioPendentePorPostId.mockResolvedValue([])
})

describe('buscarContaToken: sempre no escopo do dono', () => {
  test('filtra por rede, dono e conta, e decifra o token', async () => {
    tokenNoBanco(linhaToken())
    const token = await buscarContaToken('instagram', 3, false, 9)
    const [sql, params] = pool.query.mock.calls[0]
    expect(sql).toMatch(/c\.user_id = \$2/)
    expect(sql).toMatch(/c\.id = \$3/)
    expect(params).toEqual(['instagram', 3, 9])
    expect(token.accessToken).toBe('claro:cifrado')
  })

  test('sem dono e sem papel de sistema, a consulta não devolve nada (FALSE)', async () => {
    tokenNoBanco(null)
    expect(await buscarContaToken('instagram', null, false, 9)).toBeNull()
    expect(pool.query.mock.calls[0][0]).toMatch(/AND FALSE/)
  })
})

describe('publicarNaConta (via publishPost)', () => {
  test('sucesso pela Zernio: marca a conta publicada, guarda o ID da rede e usa o requestId persistido', async () => {
    tokenNoBanco(linhaToken())
    zernio.publicarZernioInstagram.mockResolvedValue({ provider: 'zernio', platformPostId: 'ig_123' })

    const [resultado] = await publishPost(post())

    expect(resultado).toMatchObject({ platform: 'instagram', accountId: 9, success: true, account: '@perfil' })
    const [token, enviado, opcoes] = zernio.publicarZernioInstagram.mock.calls[0]
    expect(token.accessToken).toBe('claro:cifrado')
    expect(enviado.text).toBe('Texto geral')
    expect(opcoes).toMatchObject({ requestId: 'req-fixo-1', metadata: { app: 'social-api-manager', clienteId: '3', postId: '7', postAccountId: '100', platform: 'instagram' } })
    expect(postsRepo.salvarPublicacaoExterna).toHaveBeenCalledWith(7, expect.objectContaining({ externalPostId: 'ig_123', externalPlatform: 'instagram', accountId: 9, firstCommentHandled: true }))
    expect(postsRepo.marcarContaPublicada).toHaveBeenCalledWith(100)
  })

  test('texto por conta vence o texto por rede, que vence o geral; TikTok usa a descrição longa', async () => {
    tokenNoBanco(linhaToken(), linhaToken(), linhaToken({ token_id: 41 }))
    zernio.publicarZernioInstagram.mockResolvedValue({ provider: 'zernio', platformPostId: 'x' })
    zernio.publicarZernioTiktok.mockResolvedValue({ provider: 'zernio', platformPostId: 'y' })
    const textos = { 'instagram:9': 'só da conta 9', instagram: 'do instagram', tiktok: 'curto', tiktokDescription: 'descrição longa' }

    await publishPost(post({ textByPlatform: textos, accounts: [conta(), conta({ postAccountId: 101, accountId: 8 }), conta({ postAccountId: 102, accountId: 5, platform: 'tiktok' })] }))

    const textosEnviados = zernio.publicarZernioInstagram.mock.calls.map(([, p]) => p.text).sort()
    expect(textosEnviados).toEqual(['do instagram', 'só da conta 9'])
    expect(zernio.publicarZernioTiktok.mock.calls[0][1].text).toBe('descrição longa')
  })

  test('mídia própria da conta substitui a mídia compartilhada do post', async () => {
    tokenNoBanco(linhaToken())
    zernio.publicarZernioInstagram.mockResolvedValue({ provider: 'zernio', platformPostId: 'x' })

    await publishPost(post({ mediaPath: 'compartilhada.jpg', mediaType: 'image', accounts: [conta({ mediaItems: [{ path: 'propria.mp4', type: 'video' }] })] }))

    expect(zernio.publicarZernioInstagram.mock.calls[0][1]).toMatchObject({ mediaPath: 'propria.mp4', mediaType: 'video', mediaItems: null })
  })

  test('rede não suportada: falha permanente registrada na conta, sem buscar token', async () => {
    const [resultado] = await publishPost(post({ accounts: [conta({ platform: 'kwai' })] }))

    expect(resultado).toEqual({ platform: 'kwai', accountId: 9, success: false, error: 'Plataforma "kwai" não suportada' })
    expect(pool.query).not.toHaveBeenCalled()
    expect(postsRepo.atualizarErroPublicacaoConta).toHaveBeenLastCalledWith(100, 'Plataforma "kwai" não suportada')
  })

  test('conta sem token (desconectada): falha com o motivo e log', async () => {
    tokenNoBanco(null)

    const [resultado] = await publishPost(post())

    expect(resultado).toMatchObject({ success: false, error: 'Conta de instagram não encontrada ou desconectada' })
    expect(zernio.publicarZernioInstagram).not.toHaveBeenCalled()
    expect(registrarLog).toHaveBeenCalledWith(expect.objectContaining({ type: 'err', user_id: 3 }))
  })

  test('token vencido: renova pelo fluxo de sistema e publica com o token novo', async () => {
    tokenNoBanco(linhaToken({ status: 'expired' }), linhaToken({ accessToken: 'novo' }))
    tokensRepo.renovarToken.mockResolvedValue({ success: true })
    zernio.publicarZernioInstagram.mockResolvedValue({ provider: 'zernio', platformPostId: 'x' })

    const [resultado] = await publishPost(post())

    expect(tokensRepo.renovarToken).toHaveBeenCalledWith(40, null, true)
    expect(zernio.publicarZernioInstagram.mock.calls[0][0].accessToken).toBe('claro:novo')
    expect(resultado.success).toBe(true)
  })

  test('token vencido que não renova: falha com a mensagem da renovação, sem publicar', async () => {
    tokenNoBanco(linhaToken({ status: 'expired' }))
    tokensRepo.renovarToken.mockResolvedValue({ success: false, message: 'Reconecte a conta' })

    const [resultado] = await publishPost(post())

    expect(resultado).toMatchObject({ success: false, error: 'Reconecte a conta' })
    expect(zernio.publicarZernioInstagram).not.toHaveBeenCalled()
  })

  test('rede ainda processando: pending, estado guardado para o finalizador, conta não marcada publicada', async () => {
    tokenNoBanco(linhaToken())
    zernio.publicarZernioInstagram.mockResolvedValue({ pending: true, provider: 'zernio', zernioPostId: 'zp_1' })

    const [resultado] = await publishPost(post())

    expect(resultado.success).toBe('pending')
    expect(postsRepo.salvarInstagramPending).toHaveBeenCalledWith(100, expect.objectContaining({ zernioPostId: 'zp_1', tokenId: 40, contaId: 9 }))
    expect(postsRepo.marcarContaPublicada).not.toHaveBeenCalled()
  })

  test('agendamento na Zernio (schedulePost): scheduled, com o horário guardado', async () => {
    tokenNoBanco(linhaToken())
    zernio.publicarZernioInstagram.mockResolvedValue({ scheduled: true, provider: 'zernio', zernioPostId: 'zp_2' })

    const [resultado] = await schedulePost(post({ scheduledFor: '2026-10-04T12:00:00Z' }))

    expect(zernio.publicarZernioInstagram.mock.calls[0][2].scheduledFor).toBe('2026-10-04T12:00:00Z')
    expect(resultado.success).toBe('scheduled')
    expect(postsRepo.salvarInstagramPending).toHaveBeenCalledWith(100, expect.objectContaining({ scheduled: true, scheduledFor: '2026-10-04T12:00:00Z' }))
  })

  describe('resposta perdida e nova tentativa (409 da Zernio)', () => {
    test('o post já existe e saiu: sucesso reconciliado, sem publicar de novo', async () => {
      tokenNoBanco(linhaToken())
      zernio.publicarZernioInstagram.mockRejectedValue(zernioDuplicado('zp_9'))
      zernioClient.getPost.mockResolvedValue({ post: { _id: 'zp_9', platforms: [{ platform: 'instagram', platformPostId: 'ig_9', platformPostUrl: 'https://instagram.example/p/9' }] } })

      const [resultado] = await publishPost(post())

      expect(zernioClient.getPost).toHaveBeenCalledWith('zp_9')
      expect(resultado.success).toBe(true)
      expect(postsRepo.salvarPublicacaoExterna).toHaveBeenCalledWith(7, expect.objectContaining({ externalPostId: 'ig_9' }))
      expect(registrarLog.mock.calls.at(-1)[0].message).toMatch(/confirmação recuperada após retry/)
    })

    test('o post existe mas a rede ainda não confirmou: pending', async () => {
      tokenNoBanco(linhaToken())
      zernio.publicarZernioInstagram.mockRejectedValue(zernioDuplicado('zp_9'))
      zernioClient.getPost.mockResolvedValue({ _id: 'zp_9', platforms: [{ platform: 'instagram' }] })

      const [resultado] = await publishPost(post())

      expect(resultado.success).toBe('pending')
    })

    test('o post existente falhou na Zernio: falha com a mensagem da rede', async () => {
      tokenNoBanco(linhaToken())
      zernio.publicarZernioInstagram.mockRejectedValue(zernioDuplicado('zp_9'))
      zernioClient.getPost.mockResolvedValue({ _id: 'zp_9', platforms: [{ platform: 'instagram', status: 'failed', errorMessage: 'Mídia recusada' }] })

      const [resultado] = await publishPost(post())

      expect(resultado).toMatchObject({ success: false, error: 'Mídia recusada' })
    })
  })

  test.each([
    ['Zernio respondeu 503', true],
    ['Zernio respondeu 429', true],
    ['fetch failed', true],
    ['request timeout', true],
    ['Token inválido', false],
    ['Zernio respondeu 400', false],
  ])('erro "%s" é transitório? %s', async (mensagem, transitorio) => {
    tokenNoBanco(linhaToken())
    zernio.publicarZernioInstagram.mockRejectedValue(new Error(mensagem))

    const [resultado] = await publishPost(post())

    expect(resultado).toMatchObject({ success: false, error: mensagem, transient: transitorio })
    expect(postsRepo.atualizarErroPublicacaoConta).toHaveBeenLastCalledWith(100, mensagem)
  })

  test('YouTube conectado direto ao Google (legado) publica pelo Google; agendar por ele é recusado', async () => {
    tokenNoBanco(linhaToken({ zernioAccountId: null }))
    publicarYoutube.mockResolvedValue({ id: 'yt_1' })
    const [publicado] = await publishPost(post({ accounts: [conta({ platform: 'youtube' })] }))
    expect(publicarYoutube).toHaveBeenCalled()
    expect(zernio.publicarZernioYoutube).not.toHaveBeenCalled()
    expect(postsRepo.salvarPublicacaoExterna).toHaveBeenCalledWith(7, expect.objectContaining({ externalPostId: 'yt_1', firstCommentHandled: false }))
    expect(publicado.success).toBe(true)

    tokenNoBanco(linhaToken({ zernioAccountId: null }))
    const [agendado] = await schedulePost(post({ scheduledFor: '2026-10-04T12:00:00Z', accounts: [conta({ platform: 'youtube' })] }))
    expect(agendado).toMatchObject({ success: false, error: expect.stringMatching(/não permite agendamento externo/) })
  })

  test('publicação simulada: aviso no log e a conta não é marcada como publicada', async () => {
    tokenNoBanco(linhaToken())
    zernio.publicarZernioInstagram.mockResolvedValue({ simulado: true, mensagem: 'modo de revisão' })

    const [resultado] = await publishPost(post())

    expect(resultado.success).toBe(true)
    expect(postsRepo.marcarContaPublicada).not.toHaveBeenCalled()
    expect(registrarLog).toHaveBeenCalledWith(expect.objectContaining({ type: 'warn', message: expect.stringMatching(/modo de revisão/) }))
  })
})

describe('finalizarZernioPendentes: confirmação por consulta (fallback do webhook)', () => {
  const pendente = (extra = {}) => ({ id: 7, userId: 3, postAccountId: 100, accountId: 9, platforms: ['instagram'], text: 'T', instagramPending: { provider: 'zernio', platform: 'instagram', zernioPostId: 'zp_1', accountName: 'Perfil', contaId: 9, criadoEm: new Date().toISOString(), ...extra } })
  const contasDoPost = (...contas) => postsRepo.listarContasDoPost.mockResolvedValue(contas)

  test('a rede confirmou: guarda o ID, marca a conta e fecha o post como published', async () => {
    postsRepo.listarPostsComInstagramPendente.mockResolvedValue([pendente()])
    zernioClient.getPost.mockResolvedValue({ post: { status: 'published', publishedAt: '2026-10-03T12:00:00Z', platforms: [{ platform: 'instagram', status: 'published', platformPostId: 'ig_1' }] } })
    contasDoPost({ platform: 'instagram', accountId: 9, handle: '@perfil', publicationConfirmed: true })

    await finalizarZernioPendentes()

    expect(postsRepo.salvarPublicacaoExterna).toHaveBeenCalledWith(7, expect.objectContaining({ externalPostId: 'ig_1', publishedAt: '2026-10-03T12:00:00Z' }))
    expect(postsRepo.limparInstagramPending).toHaveBeenCalledWith(100)
    expect(postsRepo.atualizarStatusPostSeProcessando).toHaveBeenCalledWith(7, 'published', null)
    expect(broadcastEvent).toHaveBeenCalledWith('post_published', expect.objectContaining({ id: 7, status: 'published' }), 3)
  })

  test('ainda processando dentro do prazo: não mexe em nada', async () => {
    postsRepo.listarPostsComInstagramPendente.mockResolvedValue([pendente()])
    zernioClient.getPost.mockResolvedValue({ status: 'processing', platforms: [{ platform: 'instagram', status: 'processing' }] })

    await finalizarZernioPendentes()

    expect(postsRepo.limparInstagramPending).not.toHaveBeenCalled()
    expect(postsRepo.atualizarStatusPostSeProcessando).not.toHaveBeenCalled()
  })

  test('processando há mais de 15 min: desiste com "Tempo esgotado" e fecha como error', async () => {
    postsRepo.listarPostsComInstagramPendente.mockResolvedValue([pendente({ criadoEm: new Date(Date.now() - 16 * 60000).toISOString() })])
    zernioClient.getPost.mockResolvedValue({ status: 'processing', platforms: [{ platform: 'instagram' }] })
    contasDoPost({ platform: 'instagram', accountId: 9, publicationConfirmed: false, publicationError: 'Tempo esgotado aguardando confirmação do Zernio.' })

    await finalizarZernioPendentes()

    expect(postsRepo.atualizarErroPublicacaoConta).toHaveBeenCalledWith(100, 'Tempo esgotado aguardando confirmação do Zernio.')
    expect(postsRepo.atualizarStatusPostSeProcessando).toHaveBeenCalledWith(7, 'error', 'instagram: Tempo esgotado aguardando confirmação do Zernio.')
  })

  test('agendado para o futuro: não consulta a Zernio antes da hora', async () => {
    postsRepo.listarPostsComInstagramPendente.mockResolvedValue([pendente({ scheduled: true, scheduledFor: new Date(Date.now() + 3600000).toISOString(), criadoEm: '2026-01-01T00:00:00Z' })])

    await finalizarZernioPendentes()

    expect(zernioClient.getPost).not.toHaveBeenCalled()
  })

  test('a rede recusou: grava o motivo da Zernio; com outra conta publicada, o post fica partial', async () => {
    postsRepo.listarPostsComInstagramPendente.mockResolvedValue([pendente()])
    zernioClient.getPost.mockResolvedValue({ platforms: [{ platform: 'instagram', status: 'failed', errorMessage: 'Vídeo longo demais' }] })
    contasDoPost(
      { platform: 'instagram', accountId: 9, handle: '@perfil', publicationError: 'Vídeo longo demais' },
      { platform: 'tiktok', accountId: 5, handle: '@tt', publicationConfirmed: true },
    )

    await finalizarZernioPendentes()

    expect(postsRepo.atualizarErroPublicacaoConta).toHaveBeenCalledWith(100, 'Vídeo longo demais')
    expect(postsRepo.atualizarStatusPostSeProcessando).toHaveBeenCalledWith(7, 'partial', 'instagram (@perfil): Vídeo longo demais')
  })

  test('outra conta do mesmo post ainda pendente: não fecha o status', async () => {
    postsRepo.listarPostsComInstagramPendente.mockResolvedValue([pendente()])
    zernioClient.getPost.mockResolvedValue({ status: 'published', platforms: [{ platform: 'instagram', platformPostId: 'ig_1' }] })
    postsRepo.existePendenciaInstagramNoPost.mockResolvedValue(true)

    await finalizarZernioPendentes()

    expect(postsRepo.marcarContaPublicada).toHaveBeenCalledWith(100)
    expect(postsRepo.atualizarStatusPostSeProcessando).not.toHaveBeenCalled()
  })

  test('pendência do fluxo direto do Instagram (não Zernio) não é tratada aqui', async () => {
    postsRepo.listarPostsComInstagramPendente.mockResolvedValue([{ ...pendente(), instagramPending: { provider: 'instagram', containerId: 'c1' } }])

    await finalizarZernioPendentes()

    expect(zernioClient.getPost).not.toHaveBeenCalled()
  })
})

describe('confirmações por webhook da Zernio', () => {
  const linha = (extra = {}) => ({ id: 7, userId: 3, postAccountId: 100, accountId: 9, platform: 'instagram', zernioAccountId: 'zac_1', handle: '@perfil', platforms: ['instagram'], instagramPending: { accountName: 'Perfil' }, ...extra })

  test('sucesso: acha a conta pelo metadata, grava o ID e fecha o post', async () => {
    postsRepo.listarPostsComZernioPendentePorMetadata.mockResolvedValue([linha()])
    postsRepo.listarContasDoPost.mockResolvedValue([{ platform: 'instagram', accountId: 9, publicationConfirmed: true }])

    const r = await confirmarPublicacaoZernio({ zernioPostId: 'zp_1', platform: 'instagram', zernioAccountId: 'zac_1', metadata: { postAccountId: '100' }, success: true, externalPostId: 'ig_1' })

    expect(r).toEqual({ matched: 1 })
    expect(postsRepo.listarPostsComZernioPendentePorPostId).not.toHaveBeenCalled()
    expect(postsRepo.salvarPublicacaoExterna).toHaveBeenCalledWith(7, expect.objectContaining({ externalPostId: 'ig_1', firstCommentHandled: true }))
    expect(registrarLog).toHaveBeenCalledWith(expect.objectContaining({ notification_key: 'zernio:post:7:account:100:published' }))
    expect(postsRepo.atualizarStatusPostSeProcessando).toHaveBeenCalledWith(7, 'published', null)
  })

  test('falha: grava o motivo; sem motivo, usa um texto padrão', async () => {
    postsRepo.listarPostsComZernioPendentePorPostId.mockResolvedValue([linha()])

    await confirmarPublicacaoZernio({ zernioPostId: 'zp_1', platform: 'instagram', success: false })

    expect(postsRepo.atualizarErroPublicacaoConta).toHaveBeenCalledWith(100, 'A Zernio não informou o motivo da falha.')
    expect(registrarLog).toHaveBeenCalledWith(expect.objectContaining({ type: 'err', notification_key: 'zernio:post:7:account:100:failed' }))
  })

  test('webhook de outra conta ou de outra rede não mexe nesta linha', async () => {
    postsRepo.listarPostsComZernioPendentePorPostId.mockResolvedValue([linha()])

    expect(await confirmarPublicacaoZernio({ zernioPostId: 'zp_1', platform: 'instagram', zernioAccountId: 'zac_OUTRA', success: true })).toEqual({ matched: 0 })
    expect(await confirmarPublicacaoZernio({ zernioPostId: 'zp_1', platform: 'tiktok', success: true })).toEqual({ matched: 0 })
    expect(await confirmarPublicacaoZernio({ zernioPostId: null, success: true })).toEqual({ matched: 0 })
    expect(postsRepo.marcarContaPublicada).not.toHaveBeenCalled()
  })

  test('agendamento aceito: só limpa o erro e registra, sem fechar o post', async () => {
    postsRepo.listarPostsComZernioPendentePorPostId.mockResolvedValue([linha()])

    expect(await confirmarAgendamentoZernio({ zernioPostId: 'zp_1', platform: 'instagram' })).toEqual({ matched: 1 })
    expect(postsRepo.atualizarErroPublicacaoConta).toHaveBeenCalledWith(100, null)
    expect(postsRepo.marcarContaPublicada).not.toHaveBeenCalled()
    expect(postsRepo.atualizarStatusPostSeProcessando).not.toHaveBeenCalled()
    expect(await confirmarAgendamentoZernio({ zernioPostId: null })).toEqual({ matched: 0 })
  })
})
