const draftsRepo = require('../../repositories/draftsRepository')
const { importarMidiaPorUrl, MidiaImportadaInvalida } = require('../../infra/storage/importarMidiaPorUrl')
const { excluirBlobs } = require('../../infra/storage/blobStorage')
const { validarKit, normalizarItem } = require('../../domain/drafts/kit')
const { ValidationError } = require('../../domain/posts/errors')
const { addLog } = require('../../middleware/logger')

// Importa um kit (lote de posts prontos) como rascunhos do Baú de Ideias.
// Nunca publica nem agenda: a pessoa revisa cada rascunho e decide no Meu
// Post. Cada item é independente; um item que falha não impede os outros, e
// a resposta diz qual falhou e por quê. Se uma mídia de um item falhar, o
// item inteiro falha (um rascunho sem a peça aprovada sairia incompleto sem
// ninguém perceber) e as mídias dele que já subiram são apagadas do Blob.
async function importarKit({ userId, kit, deps = {} }) {
  const repo = deps.draftsRepo || draftsRepo
  const importarMidia = deps.importarMidiaPorUrl || importarMidiaPorUrl
  const apagarBlobs = deps.excluirBlobs || excluirBlobs
  const registrar = deps.addLog || addLog

  const { title: tituloKit } = validarKit(kit)
  const resultados = []

  for (const [indice, bruto] of kit.items.entries()) {
    const enviadas = []
    try {
      const item = normalizarItem(bruto)
      for (const url of item.mediaUrls) enviadas.push(await importarMidia(url))
      const title = item.title || (tituloKit ? `${tituloKit} — item ${indice + 1}` : null)
      const draft = await repo.criar({
        userId,
        title,
        text: item.text,
        platforms: item.platforms,
        textByPlatform: item.textByPlatform,
        mediaItems: enviadas,
      })
      resultados.push({ index: indice, ok: true, draftId: draft.id, title })
    } catch (error) {
      if (enviadas.length) await apagarBlobs(enviadas.map(midia => midia.path)).catch(() => {})
      // Erro esperado (item ou mídia inválidos) volta com a própria mensagem;
      // falha de banco ou Blob vira uma frase neutra para a tela e vai inteira
      // para o log, sem vazar detalhe técnico.
      const esperado = error instanceof ValidationError || error instanceof MidiaImportadaInvalida
      if (!esperado) await registrar('err', `Falha ao importar o item ${indice + 1} de um kit: ${error.message}`, null, null, userId)
      resultados.push({ index: indice, ok: false, erro: esperado ? error.message : 'Erro interno ao salvar este item. Tente de novo.' })
    }
  }

  const criados = resultados.filter(resultado => resultado.ok).length
  return { total: resultados.length, criados, falharam: resultados.length - criados, itens: resultados }
}

module.exports = { importarKit }
