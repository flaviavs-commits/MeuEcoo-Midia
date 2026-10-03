const crypto = require('crypto')
const path = require('path')
const { prepareOutboundHttpsRequest } = require('../../utils/outboundUrl')
const { ALLOWED_MEDIA_TYPES, readResponseLimited, salvarBuffer, mediaProxyUrl } = require('./blobStorage')

// A importação de kit (POST /api/drafts/import) é o único lugar em que o
// servidor baixa uma mídia a partir de uma URL escolhida pelo usuário. As
// demais rotas só aceitam mídia que já está no Blob (criarPost.js). Por isso
// cada salvaguarda contra SSRF fica aqui, junta:
// - prepareOutboundHttpsRequest: só HTTPS público, e o IP validado é o mesmo
//   usado na conexão (contra DNS rebinding);
// - redirect: 'error': um 302 para a rede interna não pode passar por cima
//   da validação feita no host original;
// - tempo, tamanho e tipo limitados antes de gravar no Blob.
const TEMPO_LIMITE_MS = 20_000
const TAMANHO_MAXIMO_BYTES = 50 * 1024 * 1024

const EXTENSOES = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
  'image/heic': '.heic', 'image/heif': '.heif', 'image/avif': '.avif', 'image/tiff': '.tiff', 'image/bmp': '.bmp',
  'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm', 'video/x-matroska': '.mkv',
}

class MidiaImportadaInvalida extends Error {}

function nomeOriginal(url) {
  try {
    const nome = path.basename(new URL(url).pathname)
    return nome && nome !== '/' ? decodeURIComponent(nome).slice(0, 120) : 'midia-importada'
  } catch {
    return 'midia-importada'
  }
}

// Devolve o item no mesmo formato que o upload do frontend grava em
// drafts.media_items ({ path, type, name, mimeType, size }), para o rascunho
// abrir no Meu Post igual a qualquer outro.
async function importarMidiaPorUrl(url, { fetchImpl = fetch } = {}) {
  let outbound
  try {
    outbound = await prepareOutboundHttpsRequest(url)
  } catch (error) {
    throw new MidiaImportadaInvalida(`Endereço de mídia recusado: ${error.message}`)
  }

  try {
    let response
    try {
      response = await fetchImpl(outbound.url, {
        redirect: 'error',
        dispatcher: outbound.dispatcher,
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      })
    } catch (error) {
      throw new MidiaImportadaInvalida(`Não foi possível baixar a mídia: ${error.name === 'TimeoutError' ? 'tempo esgotado' : 'falha de conexão ou redirecionamento'}`)
    }
    if (!response.ok) {
      if (response.body) await response.body.cancel().catch(() => {})
      throw new MidiaImportadaInvalida(`A mídia respondeu com status ${response.status}`)
    }

    const mimeType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!ALLOWED_MEDIA_TYPES.has(mimeType)) {
      if (response.body) await response.body.cancel().catch(() => {})
      throw new MidiaImportadaInvalida(`Tipo de mídia não permitido: ${mimeType || 'desconhecido'}`)
    }

    let buffer
    try {
      buffer = await readResponseLimited(response, TAMANHO_MAXIMO_BYTES)
    } catch (error) {
      throw new MidiaImportadaInvalida(error.message)
    }
    if (!buffer.length) throw new MidiaImportadaInvalida('A mídia veio vazia')

    const blobUrl = await salvarBuffer(`${crypto.randomUUID()}-kit${EXTENSOES[mimeType] || ''}`, buffer, mimeType)
    return {
      path: mediaProxyUrl(blobUrl) || blobUrl,
      type: mimeType.startsWith('video/') ? 'video' : 'image',
      name: nomeOriginal(outbound.url),
      mimeType,
      size: buffer.length,
    }
  } finally {
    await outbound.close().catch(() => {})
  }
}

module.exports = { importarMidiaPorUrl, MidiaImportadaInvalida, TAMANHO_MAXIMO_BYTES }
