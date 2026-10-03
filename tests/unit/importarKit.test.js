// Testes unitários — caso de uso importarKit (lote de posts → rascunhos)
jest.mock('../../src/middleware/logger', () => ({ addLog: jest.fn() }))
const { importarKit } = require('../../src/use-cases/drafts/importarKit')
const { MidiaImportadaInvalida } = require('../../src/infra/storage/importarMidiaPorUrl')

function deps(overrides = {}) {
  let id = 100
  return {
    draftsRepo: { criar: jest.fn(async () => ({ id: ++id })) },
    importarMidiaPorUrl: jest.fn(async url => ({ path: `blob:${url}`, type: 'image', name: 'a.jpg', mimeType: 'image/jpeg', size: 1 })),
    excluirBlobs: jest.fn().mockResolvedValue(0),
    addLog: jest.fn(),
    ...overrides,
  }
}

test('cria um rascunho por item, com a mídia já no Blob, e nunca publica', async () => {
  const d = deps()
  const result = await importarKit({
    userId: 7,
    kit: { title: 'Kit 03/10', items: [{ textByPlatform: { instagram: 'oi' }, media: ['https://x/a.jpg'] }, { title: 'Segundo', text: 'tchau', platforms: ['tiktok'] }] },
    deps: d,
  })

  expect(result).toMatchObject({ total: 2, criados: 2, falharam: 0 })
  expect(d.draftsRepo.criar).toHaveBeenNthCalledWith(1, expect.objectContaining({
    userId: 7, title: 'Kit 03/10 — item 1', platforms: ['instagram'], textByPlatform: { instagram: 'oi' },
    mediaItems: [expect.objectContaining({ path: 'blob:https://x/a.jpg' })],
  }))
  expect(d.draftsRepo.criar).toHaveBeenNthCalledWith(2, expect.objectContaining({ title: 'Segundo', mediaItems: [] }))
})

test('item inválido não impede os outros e volta com a mensagem', async () => {
  const d = deps()
  const result = await importarKit({ userId: 7, kit: { items: [{ text: 'ok' }, {}] }, deps: d })

  expect(result).toMatchObject({ total: 2, criados: 1, falharam: 1 })
  expect(result.itens[1]).toEqual({ index: 1, ok: false, erro: 'o item precisa de text ou textByPlatform' })
})

test('mídia recusada derruba só aquele item e apaga do Blob as mídias dele que já subiram', async () => {
  const d = deps({
    importarMidiaPorUrl: jest.fn()
      .mockResolvedValueOnce({ path: 'blob:primeira', type: 'image' })
      .mockRejectedValueOnce(new MidiaImportadaInvalida('Tipo de mídia não permitido: text/html')),
  })
  const result = await importarKit({ userId: 7, kit: { items: [{ text: 'a', media: ['https://x/1.jpg', 'https://x/2.html'] }] }, deps: d })

  expect(result.itens[0]).toMatchObject({ ok: false, erro: 'Tipo de mídia não permitido: text/html' })
  expect(d.excluirBlobs).toHaveBeenCalledWith(['blob:primeira'])
  expect(d.draftsRepo.criar).not.toHaveBeenCalled()
})

test('falha inesperada (banco) vira frase neutra na tela e vai inteira para o log', async () => {
  const d = deps({ draftsRepo: { criar: jest.fn().mockRejectedValue(new Error('connection terminated')) } })
  const result = await importarKit({ userId: 7, kit: { items: [{ text: 'a' }] }, deps: d })

  expect(result.itens[0].erro).toBe('Erro interno ao salvar este item. Tente de novo.')
  expect(d.addLog).toHaveBeenCalledWith('err', expect.stringContaining('connection terminated'), null, null, 7)
})

test('kit inválido inteiro lança 400 e não cria nada', async () => {
  const d = deps()
  await expect(importarKit({ userId: 7, kit: { items: [] }, deps: d })).rejects.toMatchObject({ statusCode: 400 })
  expect(d.draftsRepo.criar).not.toHaveBeenCalled()
})
