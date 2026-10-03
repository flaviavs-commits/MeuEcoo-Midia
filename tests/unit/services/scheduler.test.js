// Caracterização do agendador (src/services/scheduler.js): o que acontece com um post quando a
// publicação dá certo, falha de vez, falha por instabilidade ou fica pendente, e como cada etapa
// do tick de 1 minuto fica isolada das outras. Providers e banco são falsos.
jest.mock('node-cron', () => ({ schedule: jest.fn() }))
jest.mock('../../../src/infra/social/publisher', () => ({
  publishPost: jest.fn(),
  finalizarInstagramPendentes: jest.fn().mockResolvedValue(),
  finalizarZernioPendentes: jest.fn().mockResolvedValue(),
  buscarContaToken: jest.fn(),
}))
jest.mock('../../../src/repositories/logsRepository', () => ({ registrarLog: jest.fn().mockResolvedValue(), broadcastEvent: jest.fn() }))
jest.mock('../../../src/infra/db/postsRepository', () => ({
  atualizarStatusPost: jest.fn().mockResolvedValue(),
  reagendarParaRetry: jest.fn().mockResolvedValue(),
  recuperarPostsProcessingStale: jest.fn().mockResolvedValue([]),
  reservarPostsPendentes: jest.fn().mockResolvedValue([]),
  listarPrimeirosComentariosPendentes: jest.fn().mockResolvedValue([]),
  atualizarStatusPrimeiroComentario: jest.fn().mockResolvedValue(),
}))
jest.mock('../../../src/repositories/tokensRepository', () => ({ renovarTodos: jest.fn() }))
jest.mock('../../../src/db/pool', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }))
jest.mock('../../../src/services/pushService', () => ({ enviarPush: jest.fn().mockResolvedValue() }))
jest.mock('../../../src/services/platformHealth', () => ({ verificarSaudePlataformas: jest.fn(), garantirSaudeRecente: jest.fn().mockResolvedValue(false) }))
jest.mock('../../../src/infra/social/youtubePublisher', () => ({ comentarYoutube: jest.fn().mockResolvedValue() }))
jest.mock('../../../src/services/prioritySchedulers', () => ({
  processarFilasRecorrentes: jest.fn().mockResolvedValue(),
  processarRelatoriosAgendados: jest.fn().mockResolvedValue(),
}))
jest.mock('../../../src/services/webhookService', () => ({ dispatchWebhook: jest.fn().mockResolvedValue() }))
jest.mock('../../../src/services/mediaCleanupService', () => ({ limparMidiasExpiradas: jest.fn() }))
jest.mock('../../../src/services/zernioWebhookService', () => ({ processarZernioWebhooksPendentes: jest.fn().mockResolvedValue() }))

const cron = require('node-cron')
const publisher = require('../../../src/infra/social/publisher')
const { registrarLog, broadcastEvent } = require('../../../src/repositories/logsRepository')
const postsRepo = require('../../../src/infra/db/postsRepository')
const tokensRepo = require('../../../src/repositories/tokensRepository')
const pool = require('../../../src/db/pool')
const { enviarPush } = require('../../../src/services/pushService')
const { comentarYoutube } = require('../../../src/infra/social/youtubePublisher')
const prioritySchedulers = require('../../../src/services/prioritySchedulers')
const { dispatchWebhook } = require('../../../src/services/webhookService')
const { limparMidiasExpiradas } = require('../../../src/services/mediaCleanupService')
const { processarZernioWebhooksPendentes } = require('../../../src/services/zernioWebhookService')
const scheduler = require('../../../src/services/scheduler')

const post = (extra = {}) => ({ id: 7, userId: 3, text: 'Texto do post', platforms: ['instagram', 'tiktok'], retryCount: 0, ...extra })
const ok = platform => ({ platform, success: true })
const falha = (platform, transient = false) => ({ platform, account: '@perfil', success: false, error: `erro em ${platform}`, transient })
const mensagensDeLog = () => registrarLog.mock.calls.map(([log]) => log.message)

beforeEach(() => {
  jest.clearAllMocks()
  pool.query.mockResolvedValue({ rows: [] })
  postsRepo.reservarPostsPendentes.mockResolvedValue([])
  postsRepo.recuperarPostsProcessingStale.mockResolvedValue([])
  postsRepo.listarPrimeirosComentariosPendentes.mockResolvedValue([])
})

describe('processarPost: status final do post', () => {
  test('tudo publicado: published, sem detalhe de falha, com log, evento, webhook e push', async () => {
    publisher.publishPost.mockResolvedValue([ok('instagram'), ok('tiktok')])
    pool.query.mockResolvedValue({ rows: [{ endpoint: 'https://push.example/1', p256dh: 'k', auth: 'a' }] })

    await scheduler.processarPost(post())

    expect(postsRepo.atualizarStatusPost).toHaveBeenCalledWith(7, 'published', null)
    expect(registrarLog).toHaveBeenCalledWith(expect.objectContaining({ type: 'ok', user_id: 3 }))
    expect(broadcastEvent).toHaveBeenCalledWith('post_published', expect.objectContaining({ id: 7, status: 'published' }), 3)
    expect(dispatchWebhook).toHaveBeenCalledWith('post_published', expect.objectContaining({ id: 7, status: 'published' }), 3)
    expect(enviarPush).toHaveBeenCalledTimes(1)
    expect(enviarPush.mock.calls[0][1].title).toMatch(/publicado/)
  })

  test('uma rede publicou e outra falhou: partial, com o motivo da rede que falhou', async () => {
    publisher.publishPost.mockResolvedValue([ok('instagram'), falha('tiktok')])

    await scheduler.processarPost(post())

    expect(postsRepo.atualizarStatusPost).toHaveBeenCalledWith(7, 'partial', 'tiktok (@perfil): erro em tiktok')
    expect(postsRepo.reagendarParaRetry).not.toHaveBeenCalled()
  })

  test('uma rede publicou e a outra falhou por instabilidade: não reagenda (duplicaria a que já saiu)', async () => {
    publisher.publishPost.mockResolvedValue([ok('instagram'), falha('tiktok', true)])

    await scheduler.processarPost(post())

    expect(postsRepo.reagendarParaRetry).not.toHaveBeenCalled()
    expect(postsRepo.atualizarStatusPost).toHaveBeenCalledWith(7, 'partial', expect.any(String))
  })

  test('todas falharam por instabilidade na 1ª tentativa: reagenda em 1 min e não fecha o post', async () => {
    publisher.publishPost.mockResolvedValue([falha('instagram', true), falha('tiktok', true)])
    const antes = Date.now()

    await scheduler.processarPost(post({ retryCount: 0 }))

    const [id, quando] = postsRepo.reagendarParaRetry.mock.calls[0]
    expect(id).toBe(7)
    expect(quando.getTime() - antes).toBeGreaterThanOrEqual(60000 - 50)
    expect(quando.getTime() - antes).toBeLessThan(61000)
    expect(postsRepo.atualizarStatusPost).not.toHaveBeenCalled()
    expect(broadcastEvent).not.toHaveBeenCalled()
    expect(mensagensDeLog()[0]).toMatch(/nova tentativa em 1 min \(tentativa 1\/3\)/)
  })

  test('a 3ª tentativa reagenda em 15 min e a 4ª desiste: error definitivo', async () => {
    publisher.publishPost.mockResolvedValue([falha('instagram', true)])
    await scheduler.processarPost(post({ retryCount: 2 }))
    expect(mensagensDeLog()[0]).toMatch(/nova tentativa em 15 min \(tentativa 3\/3\)/)

    jest.clearAllMocks()
    publisher.publishPost.mockResolvedValue([falha('instagram', true)])
    await scheduler.processarPost(post({ retryCount: 3 }))
    expect(postsRepo.reagendarParaRetry).not.toHaveBeenCalled()
    expect(postsRepo.atualizarStatusPost).toHaveBeenCalledWith(7, 'error', expect.stringContaining('instagram'))
  })

  test('falha permanente junto com transitória: error, sem nova tentativa', async () => {
    publisher.publishPost.mockResolvedValue([falha('instagram', true), falha('tiktok', false)])

    await scheduler.processarPost(post())

    expect(postsRepo.reagendarParaRetry).not.toHaveBeenCalled()
    expect(postsRepo.atualizarStatusPost).toHaveBeenCalledWith(7, 'error', 'instagram (@perfil): erro em instagram | tiktok (@perfil): erro em tiktok')
  })

  test('rede ainda processando (pending): fica em processing, sem log nem evento de conclusão', async () => {
    publisher.publishPost.mockResolvedValue([{ platform: 'instagram', success: 'pending' }, ok('tiktok')])

    await scheduler.processarPost(post())

    expect(postsRepo.atualizarStatusPost).toHaveBeenCalledWith(7, 'processing')
    expect(registrarLog).not.toHaveBeenCalled()
    expect(broadcastEvent).not.toHaveBeenCalled()
  })

  test('erro fora do publisher: error com a mensagem, log e push de falha', async () => {
    publisher.publishPost.mockRejectedValue(new Error('Zernio fora do ar'))
    pool.query.mockResolvedValue({ rows: [{ endpoint: 'https://push.example/1', p256dh: 'k', auth: 'a' }] })

    await scheduler.processarPost(post())

    expect(postsRepo.atualizarStatusPost).toHaveBeenCalledWith(7, 'error', 'Zernio fora do ar')
    expect(mensagensDeLog()).toContain('Post #7 falhou ao publicar: Zernio fora do ar')
    expect(enviarPush.mock.calls[0][1].title).toMatch(/Falha/)
  })

  test('erro sem mensagem: grava o nome do erro e a linha do stack, não um texto vazio', async () => {
    const erro = new TypeError('')
    erro.stack = 'TypeError\n    at publicarNaConta (publisher.js:200:10)'
    publisher.publishPost.mockRejectedValue(erro)

    await scheduler.processarPost(post())

    expect(postsRepo.atualizarStatusPost).toHaveBeenCalledWith(7, 'error', 'TypeError: at publicarNaConta (publisher.js:200:10)')
  })

  test('falha no push não muda o status já gravado', async () => {
    publisher.publishPost.mockResolvedValue([ok('instagram')])
    pool.query.mockRejectedValue(new Error('banco caiu'))
    const erroConsole = jest.spyOn(console, 'error').mockImplementation(() => {})

    await scheduler.processarPost(post())

    expect(postsRepo.atualizarStatusPost).toHaveBeenCalledWith(7, 'published', null)
    erroConsole.mockRestore()
  })
})

describe('processarPendentes: o tick de 1 minuto', () => {
  test('publica cada post reservado uma vez', async () => {
    postsRepo.reservarPostsPendentes.mockResolvedValue([post({ id: 1 }), post({ id: 2 }), post({ id: 3 })])
    publisher.publishPost.mockResolvedValue([ok('instagram')])

    await scheduler.processarPendentes()

    expect(publisher.publishPost.mock.calls.map(([p]) => p.id).sort()).toEqual([1, 2, 3])
    expect(postsRepo.atualizarStatusPost).toHaveBeenCalledTimes(3)
  })

  test('uma etapa que falha não impede as seguintes', async () => {
    processarZernioWebhooksPendentes.mockRejectedValueOnce(new Error('webhooks'))
    prioritySchedulers.processarFilasRecorrentes.mockRejectedValueOnce(new Error('filas'))
    prioritySchedulers.processarRelatoriosAgendados.mockRejectedValueOnce(new Error('relatórios'))
    postsRepo.recuperarPostsProcessingStale.mockRejectedValueOnce(new Error('presos'))
    postsRepo.reservarPostsPendentes.mockRejectedValueOnce(new Error('reserva'))
    publisher.finalizarInstagramPendentes.mockRejectedValueOnce(new Error('instagram'))
    publisher.finalizarZernioPendentes.mockRejectedValueOnce(new Error('zernio'))
    postsRepo.listarPrimeirosComentariosPendentes.mockRejectedValueOnce(new Error('comentários'))

    await expect(scheduler.processarPendentes()).resolves.toBeUndefined()

    expect(mensagensDeLog()).toEqual([
      'Erro ao processar webhooks da Zernio: webhooks',
      'Erro ao processar fila recorrente: filas',
      'Erro ao processar relatório agendado: relatórios',
      'Erro ao recuperar publicações presas: presos',
      'Erro ao programar post: reserva',
      'Erro ao finalizar publicações pendentes do Instagram: instagram',
      'Erro ao finalizar publicações pendentes do Zernio: zernio',
      'Erro ao listar primeiros comentários pendentes: comentários',
    ])
  })

  test('confere a saúde das redes antes de publicar; se a checagem falhar, publica mesmo assim', async () => {
    const { garantirSaudeRecente } = require('../../../src/services/platformHealth')
    garantirSaudeRecente.mockRejectedValueOnce(new Error('banco lento'))
    postsRepo.reservarPostsPendentes.mockResolvedValueOnce([post({ id: 9 })])
    publisher.publishPost.mockResolvedValue([ok('instagram')])

    await scheduler.processarPendentes()

    expect(mensagensDeLog()[0]).toBe('Erro ao verificar a saúde das redes: banco lento')
    expect(publisher.publishPost).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }))
  })

  test('avisa quando encerra publicações presas em processamento', async () => {
    postsRepo.recuperarPostsProcessingStale.mockResolvedValueOnce([{ id: 1 }, { id: 2 }])

    await scheduler.processarPendentes()

    expect(mensagensDeLog()).toContain('2 publicação(ões) presas em processamento foram encerradas para revisão')
  })
})

describe('primeiro comentário automático', () => {
  const item = extra => ({ firstCommentId: 50, platform: 'youtube', userId: 3, userRole: 'user', accountId: 9, externalPostId: 'vid1', firstComment: 'Oi', ...extra })

  test('publica o comentário com o token da conta do dono e marca done', async () => {
    postsRepo.listarPrimeirosComentariosPendentes.mockResolvedValueOnce([item()])
    publisher.buscarContaToken.mockResolvedValueOnce({ token: 'sintetico' })

    await scheduler.processarPendentes()

    expect(publisher.buscarContaToken).toHaveBeenCalledWith('youtube', 3, false, 9)
    expect(comentarYoutube).toHaveBeenCalledWith({ token: 'sintetico' }, 'vid1', 'Oi')
    expect(postsRepo.atualizarStatusPrimeiroComentario).toHaveBeenCalledWith(50, 'done')
  })

  test('conta desconectada: failed com o motivo, sem tentar comentar', async () => {
    postsRepo.listarPrimeirosComentariosPendentes.mockResolvedValueOnce([item()])
    publisher.buscarContaToken.mockResolvedValueOnce(null)

    await scheduler.processarPendentes()

    expect(comentarYoutube).not.toHaveBeenCalled()
    expect(postsRepo.atualizarStatusPrimeiroComentario).toHaveBeenCalledWith(50, 'failed', expect.stringMatching(/desconectada/))
  })

  test('rede sem comentário automático: failed explícito em vez de tentar para sempre', async () => {
    postsRepo.listarPrimeirosComentariosPendentes.mockResolvedValueOnce([item({ platform: 'instagram' })])

    await scheduler.processarPendentes()

    expect(postsRepo.atualizarStatusPrimeiroComentario).toHaveBeenCalledWith(50, 'failed', 'Plataforma instagram não suporta comentário automático')
  })
})

describe('rotinas de manutenção', () => {
  test('renovação de tokens: registra o resumo, como aviso quando algo falhou', async () => {
    tokensRepo.renovarTodos.mockResolvedValueOnce({ total: 3, renewed: [1], requiresManual: [2], failed: [3] })

    await scheduler.renovarTokensProativamente()

    expect(tokensRepo.renovarTodos).toHaveBeenCalledWith(null, true)
    expect(registrarLog).toHaveBeenCalledWith(expect.objectContaining({ type: 'warn', message: expect.stringMatching(/1 renovados, 1 exigem reconexão, 1 falharam \(de 3\)/) }))
  })

  test('renovação de tokens sem nada a renovar não grava log; erro grava err', async () => {
    tokensRepo.renovarTodos.mockResolvedValueOnce({ total: 0, renewed: [], requiresManual: [], failed: [] })
    await scheduler.renovarTokensProativamente()
    expect(registrarLog).not.toHaveBeenCalled()

    tokensRepo.renovarTodos.mockRejectedValueOnce(new Error('Google fora'))
    await scheduler.renovarTokensProativamente()
    expect(registrarLog).toHaveBeenCalledWith(expect.objectContaining({ type: 'err', message: 'Erro na renovação automática de tokens: Google fora' }))
  })

  test('limpeza de mídias: registra o resultado e trata erro sem derrubar o tick', async () => {
    limparMidiasExpiradas.mockResolvedValueOnce({ candidates: 2, deleted: 1, deferred: 0, handedOff: 1, marked: 2, errors: 0 })
    await scheduler.executarLimpezaMidias()
    expect(mensagensDeLog()[0]).toBe('Limpeza de mídias: 1 arquivo(s) excluído(s), 0 adiado(s), 1 mantido(s) por estar em fila, rascunho ou biblioteca, 0 erro(s)')

    limparMidiasExpiradas.mockRejectedValueOnce(new Error('Blob fora'))
    await expect(scheduler.executarLimpezaMidias()).resolves.toMatchObject({ errors: 1 })
  })

  test('start agenda as três rotinas e roda cada uma uma vez na subida (saúde das redes é sob demanda)', async () => {
    tokensRepo.renovarTodos.mockResolvedValue({ total: 0, renewed: [], requiresManual: [], failed: [] })
    limparMidiasExpiradas.mockResolvedValue({ candidates: 0, deleted: 0, deferred: 0, handedOff: 0, marked: 0, errors: 0 })
    const { verificarSaudePlataformas, garantirSaudeRecente } = require('../../../src/services/platformHealth')

    scheduler.start()
    await new Promise(resolve => setImmediate(resolve))

    expect(cron.schedule.mock.calls.map(([expressao]) => expressao)).toEqual(['* * * * *', '0 */6 * * *', '17 * * * *'])
    expect(tokensRepo.renovarTodos).toHaveBeenCalledTimes(1)
    expect(limparMidiasExpiradas).toHaveBeenCalledTimes(1)
    expect(verificarSaudePlataformas).not.toHaveBeenCalled()
    expect(garantirSaudeRecente).toHaveBeenCalledTimes(1)
  })
})
