// Testes unitários — reconciliação das confirmações perdidas da Zernio
const { reconciliarPublicacoesZernio, statusCalculado } = require('../../src/use-cases/posts/reconciliarPublicacoesZernio')

function postZernio(id, postAccountId, platform, status = 'published', platformPostId = `ext-${id}`) {
  return { _id: id, metadata: { app: 'social-api-manager', postId: '10', postAccountId: String(postAccountId), platform }, platforms: [{ platform, status, platformPostId, publishedAt: '2026-09-25T10:00:00Z' }] }
}

function cenario({ linhas, postsZernio, publicacoes = [] }) {
  const estado = new Map(linhas.map(l => [l.postAccountId, { ...l }]))
  const postsRepo = {
    buscarContaDoPost: jest.fn(async id => (estado.has(id) ? { ...estado.get(id) } : null)),
    listarContasDoPost: jest.fn(async postId => [...estado.values()].filter(l => l.postId === postId)),
    listarPublicacoesDosPosts: jest.fn(async () => publicacoes),
    salvarPublicacaoExterna: jest.fn(),
    marcarContaPublicada: jest.fn(async id => { estado.get(id).publicationConfirmed = true }),
    atualizarErroPublicacaoConta: jest.fn(async (id, erro) => { estado.get(id).publicationError = erro }),
    atualizarStatusPost: jest.fn(),
  }
  const zernioClient = {
    listProfiles: jest.fn(async () => ({ profiles: [{ _id: 'p1' }, { _id: 'p2' }] })),
    listPosts: jest.fn(async ({ profileId }) => ({ posts: profileId === 'p1' ? postsZernio : postsZernio.slice(0, 1), pagination: { pages: 1 } })),
  }
  return { deps: { postsRepo, zernioClient, registrarLog: jest.fn() }, postsRepo }
}

const TIMEOUT = 'Tempo esgotado aguardando confirmação do Zernio.'
const linhaBase = { postId: 10, accountId: 1, userId: 7, postStatus: 'partial' }

test('simulação lista as divergências e o status final sem gravar nada', async () => {
  const { deps, postsRepo } = cenario({
    linhas: [
      { ...linhaBase, postAccountId: 101, platform: 'instagram', publicationConfirmed: false, publicationError: TIMEOUT },
      { ...linhaBase, postAccountId: 102, platform: 'youtube', publicationConfirmed: true, publicationError: null },
    ],
    postsZernio: [postZernio('z1', 101, 'instagram'), postZernio('z2', 102, 'youtube')],
  })

  const r = await reconciliarPublicacoesZernio({ desde: '2026-09-11T00:00:00Z', deps })

  expect(r.postsNaZernio).toBe(2)
  expect(r.divergentes).toEqual([expect.objectContaining({ postId: 10, postAccountId: 101, platform: 'instagram', externalPostId: 'ext-z1' })])
  expect(r.postsCorrigidos).toEqual([{ postId: 10, de: 'partial', para: 'published' }])
  for (const fn of ['salvarPublicacaoExterna', 'marcarContaPublicada', 'atualizarErroPublicacaoConta', 'atualizarStatusPost']) expect(postsRepo[fn]).not.toHaveBeenCalled()
})

test('aplicar grava pela mesma via do webhook, sem agendar primeiro comentário, e fecha o post', async () => {
  const { deps, postsRepo } = cenario({
    linhas: [{ ...linhaBase, postStatus: 'error', postAccountId: 101, platform: 'tiktok', publicationConfirmed: false, publicationError: TIMEOUT }],
    postsZernio: [postZernio('z1', 101, 'tiktok')],
  })

  const r = await reconciliarPublicacoesZernio({ desde: '2026-09-11T00:00:00Z', aplicar: true, deps })

  expect(postsRepo.salvarPublicacaoExterna).toHaveBeenCalledWith(10, expect.objectContaining({ externalPostId: 'ext-z1', externalPlatform: 'tiktok', accountId: 1, firstCommentHandled: true }))
  expect(postsRepo.marcarContaPublicada).toHaveBeenCalledWith(101)
  expect(postsRepo.atualizarErroPublicacaoConta).toHaveBeenCalledWith(101, null)
  expect(postsRepo.atualizarStatusPost).toHaveBeenCalledWith(10, 'published', null)
  expect(r.postsCorrigidos).toEqual([{ postId: 10, de: 'error', para: 'published' }])
  expect(deps.registrarLog).toHaveBeenCalledWith(expect.objectContaining({ notification_key: 'zernio:reconciliacao:10:account:101' }))
})

test('post cancelado ou já publicado não é tocado', async () => {
  const { deps, postsRepo } = cenario({
    linhas: [
      { ...linhaBase, postStatus: 'cancelled', postAccountId: 101, platform: 'instagram', publicationConfirmed: false, publicationError: TIMEOUT },
      { ...linhaBase, postId: 11, postStatus: 'published', postAccountId: 201, platform: 'instagram', publicationConfirmed: true, publicationError: null },
    ],
    postsZernio: [postZernio('z1', 101, 'instagram'), postZernio('z2', 201, 'instagram')],
  })

  const r = await reconciliarPublicacoesZernio({ desde: '2026-09-11T00:00:00Z', aplicar: true, deps })

  expect(r.divergentes).toEqual([])
  expect(r.ignorados).toEqual([{ postId: 10, motivo: 'status cancelled' }])
  expect(postsRepo.atualizarStatusPost).not.toHaveBeenCalled()
})

test('entrada que a Zernio não publicou não é confirmada', async () => {
  const { deps } = cenario({
    linhas: [{ ...linhaBase, postAccountId: 101, platform: 'instagram', publicationConfirmed: false, publicationError: TIMEOUT }],
    postsZernio: [postZernio('z1', 101, 'instagram', 'failed')],
  })

  const r = await reconciliarPublicacoesZernio({ desde: '2026-09-11T00:00:00Z', deps })

  expect(r.divergentes).toEqual([])
})

test('statusCalculado segue a regra do publisher', () => {
  const ok = { platform: 'instagram', accountId: 1, publicationConfirmed: true }
  const falha = { platform: 'tiktok', accountId: 2, publicationConfirmed: false, publicationError: 'x', handle: 'h' }
  expect(statusCalculado([ok], []).status).toBe('published')
  expect(statusCalculado([ok, falha], [])).toEqual({ status: 'partial', falhas: 'tiktok (h): x' })
  expect(statusCalculado([falha], [{ platform: 'tiktok', accountId: 2 }]).status).toBe('published')
})
