// Regras do kit de importação (contrato em docs/KIT-IMPORTACAO.md). Sem
// Express, banco nem rede: só decide o que é um kit válido e normaliza cada
// item no formato que vira rascunho.
const { ValidationError } = require('../posts/errors')

const REDES = ['facebook', 'instagram', 'youtube', 'tiktok']
const MAX_ITENS = 20
const MAX_MIDIAS_POR_ITEM = 10
const MAX_MIDIAS_POR_KIT = 30
const MAX_TITULO = 200
const MAX_TEXTO = 10_000

function texto(valor, campo, max) {
  if (valor === undefined || valor === null || valor === '') return null
  if (typeof valor !== 'string') throw new ValidationError(`${campo} precisa ser texto`)
  const limpo = valor.trim()
  if (limpo.length > max) throw new ValidationError(`${campo} passa de ${max} caracteres`)
  return limpo || null
}

// Erro de um item não derruba o kit: vira { ok: false, erro } e os outros
// itens seguem (mesmo padrão do Baú ao salvar ideias geradas em lote).
function normalizarItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new ValidationError('o item precisa ser um objeto')

  const textByPlatform = {}
  if (item.textByPlatform !== undefined) {
    if (!item.textByPlatform || typeof item.textByPlatform !== 'object' || Array.isArray(item.textByPlatform)) {
      throw new ValidationError('textByPlatform precisa ser um objeto { rede: texto }')
    }
    for (const [rede, valor] of Object.entries(item.textByPlatform)) {
      if (!REDES.includes(rede)) throw new ValidationError(`rede desconhecida em textByPlatform: ${rede}`)
      const limpo = texto(valor, `textByPlatform.${rede}`, MAX_TEXTO)
      if (limpo) textByPlatform[rede] = limpo
    }
  }

  let platforms = item.platforms
  if (platforms === undefined) platforms = Object.keys(textByPlatform)
  if (!Array.isArray(platforms) || platforms.some(rede => !REDES.includes(rede))) {
    throw new ValidationError(`platforms precisa ser uma lista com: ${REDES.join(', ')}`)
  }

  const text = texto(item.text, 'text', MAX_TEXTO)
  if (!text && !Object.keys(textByPlatform).length) throw new ValidationError('o item precisa de text ou textByPlatform')

  const media = item.media === undefined ? [] : item.media
  if (!Array.isArray(media)) throw new ValidationError('media precisa ser uma lista')
  if (media.length > MAX_MIDIAS_POR_ITEM) throw new ValidationError(`no máximo ${MAX_MIDIAS_POR_ITEM} mídias por item`)
  const mediaUrls = media.map((entrada, posicao) => {
    const url = typeof entrada === 'string' ? entrada : entrada?.url
    if (typeof url !== 'string' || !url.startsWith('https://')) throw new ValidationError(`media[${posicao}] precisa ter uma url https`)
    return url
  })

  return {
    title: texto(item.title, 'title', MAX_TITULO),
    text,
    textByPlatform,
    platforms: [...new Set(platforms)],
    mediaUrls,
  }
}

// Erros do kit inteiro (formato, quantidade) respondem 400 e nada é criado.
function validarKit(kit) {
  if (!kit || typeof kit !== 'object' || Array.isArray(kit)) throw new ValidationError('O kit precisa ser um objeto JSON com "items".')
  if (!Array.isArray(kit.items) || !kit.items.length) throw new ValidationError('O kit precisa de uma lista "items" com pelo menos um item.')
  if (kit.items.length > MAX_ITENS) throw new ValidationError(`O kit pode ter no máximo ${MAX_ITENS} itens.`)
  const totalMidias = kit.items.reduce((total, item) => total + (Array.isArray(item?.media) ? item.media.length : 0), 0)
  if (totalMidias > MAX_MIDIAS_POR_KIT) throw new ValidationError(`O kit pode ter no máximo ${MAX_MIDIAS_POR_KIT} mídias no total.`)
  return { title: texto(kit.title, 'title', MAX_TITULO) }
}

module.exports = { validarKit, normalizarItem, REDES, MAX_ITENS, MAX_MIDIAS_POR_ITEM, MAX_MIDIAS_POR_KIT }
