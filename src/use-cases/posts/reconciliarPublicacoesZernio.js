const postsRepoPadrao = require('../../infra/db/postsRepository')
const zernioClientPadrao = require('../../infra/social/zernioClient')
const { registrarLog: registrarLogPadrao } = require('../../repositories/logsRepository')

// Reconciliação das confirmações da Zernio que se perderam. Entre 11/09 e
// 02/10/2026 o webhook da Zernio ficou fora (503 e depois desativado), e o app
// marcou como "Tempo esgotado aguardando confirmação" publicações que a Zernio
// fez de verdade. Esta rotina parte do que a Zernio diz (posts com metadata do
// app), compara com post_accounts e, só com aplicar = true, grava a publicação
// pelas mesmas funções do webhook e recalcula o status do post.
//
// Nunca toca em post cancelado nem em post que não esteja em error/partial, e
// não agenda o primeiro comentário automático: comentar semanas depois da
// publicação não é o que a pessoa pediu.
const STATUS_RECONCILIAVEIS = ['error', 'partial']

function entradaDaRede(post, platform) {
  return (Array.isArray(post?.platforms) ? post.platforms : []).find(entrada => entrada?.platform === platform) || null
}

async function listarPostsDaZernio(zernioClient, desde) {
  const { profiles = [] } = await zernioClient.listProfiles()
  const porId = new Map()
  for (const perfil of profiles) {
    for (let page = 1; page < 50; page++) {
      const resposta = await zernioClient.listPosts({ profileId: perfil._id, page, limit: 100, dateFrom: desde })
      for (const post of resposta?.posts || []) porId.set(post._id, post)
      const paginas = resposta?.pagination?.pages
      if (!paginas || page >= paginas) break
    }
  }
  return [...porId.values()]
}

// Mesma regra de fecharStatusSeSemPendencias (publisher.js): todas as contas
// publicadas → published; alguma → partial; nenhuma → error.
function statusCalculado(contas, publicacoes) {
  const publicadas = new Set(publicacoes.map(p => `${p.platform}:${p.accountId}`))
  const resultados = contas.map(conta => ({
    conta,
    sucesso: conta.publicationConfirmed === true || publicadas.has(`${conta.platform}:${conta.accountId}`),
  }))
  const status = resultados.every(r => r.sucesso) ? 'published' : resultados.some(r => r.sucesso) ? 'partial' : 'error'
  const falhas = resultados.filter(r => !r.sucesso)
    .map(({ conta }) => `${conta.platform}${conta.handle ? ` (${conta.handle})` : ''}: ${conta.publicationError || 'A rede não informou o motivo.'}`)
    .join(' | ') || null
  return { status, falhas }
}

async function reconciliarPublicacoesZernio({ desde, aplicar = false, deps = {} }) {
  const postsRepo = deps.postsRepo || postsRepoPadrao
  const zernioClient = deps.zernioClient || zernioClientPadrao
  const registrarLog = deps.registrarLog || registrarLogPadrao

  const postsZernio = await listarPostsDaZernio(zernioClient, desde)
  const divergentes = []
  const ignorados = []
  const postsAfetados = new Set()

  for (const postZernio of postsZernio) {
    const metadata = postZernio.metadata || {}
    if (metadata.app !== 'social-api-manager' || !metadata.postAccountId || !metadata.platform) continue
    const entrada = entradaDaRede(postZernio, metadata.platform)
    if (entrada?.status !== 'published') continue

    const linha = await postsRepo.buscarContaDoPost(Number(metadata.postAccountId))
    if (!linha) { ignorados.push({ zernioPostId: postZernio._id, motivo: 'sem linha local' }); continue }
    if (!STATUS_RECONCILIAVEIS.includes(linha.postStatus)) {
      if (linha.postStatus !== 'published') ignorados.push({ postId: linha.postId, motivo: `status ${linha.postStatus}` })
      continue
    }
    postsAfetados.add(linha.postId)
    if (linha.publicationConfirmed && !linha.publicationError) continue

    const externalPostId = entrada.platformPostId || null
    divergentes.push({ postId: linha.postId, postAccountId: linha.postAccountId, platform: linha.platform, externalPostId, erroLocal: linha.publicationError })
    if (!aplicar) continue

    if (externalPostId) {
      await postsRepo.salvarPublicacaoExterna(linha.postId, {
        externalPostId,
        externalPlatform: linha.platform,
        publishedAt: entrada.publishedAt || postZernio.publishedAt || postZernio.updatedAt || new Date().toISOString(),
        accountId: linha.accountId,
        firstCommentHandled: true,
      })
    }
    await postsRepo.marcarContaPublicada(linha.postAccountId)
    await postsRepo.atualizarErroPublicacaoConta(linha.postAccountId, null)
    await registrarLog({
      type: 'ok',
      message: `Publicação no ${linha.platform} confirmada pela reconciliação com a Zernio (a confirmação original se perdeu).`,
      platform: linha.platform,
      conta_id: linha.accountId,
      user_id: linha.userId,
      notification_key: `zernio:reconciliacao:${linha.postId}:account:${linha.postAccountId}`,
    })
  }

  const postsCorrigidos = []
  for (const postId of postsAfetados) {
    const contas = await postsRepo.listarContasDoPost(postId)
    const publicacoes = await postsRepo.listarPublicacoesDosPosts([postId])
    // Em simulação, as linhas divergentes contam como já confirmadas para mostrar o resultado final.
    const simuladas = aplicar ? contas : contas.map(conta => divergentes.some(d => d.postAccountId === conta.postAccountId)
      ? { ...conta, publicationConfirmed: true, publicationError: null }
      : conta)
    const { status, falhas } = statusCalculado(simuladas, publicacoes)
    const atual = (await postsRepo.buscarContaDoPost(contas[0]?.postAccountId))?.postStatus
    if (!atual || atual === status) continue
    postsCorrigidos.push({ postId, de: atual, para: status })
    if (aplicar) await postsRepo.atualizarStatusPost(postId, status, status === 'published' ? null : falhas)
  }

  return { aplicado: aplicar, postsNaZernio: postsZernio.length, divergentes, postsCorrigidos, ignorados }
}

module.exports = { reconciliarPublicacoesZernio, statusCalculado }
