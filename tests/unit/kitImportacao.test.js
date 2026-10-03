// Testes unitários — regras do kit de importação (src/domain/drafts/kit.js)
const { validarKit, normalizarItem, MAX_ITENS } = require('../../src/domain/drafts/kit')

describe('validarKit', () => {
  test('aceita um kit com items e devolve o título limpo', () => {
    expect(validarKit({ title: '  Kit de 03/10 ', items: [{ text: 'a' }] })).toEqual({ title: 'Kit de 03/10' })
  })

  test.each([
    [null, 'objeto JSON'],
    [[], 'objeto JSON'],
    [{ items: [] }, 'pelo menos um item'],
    [{ items: Array.from({ length: MAX_ITENS + 1 }, () => ({ text: 'a' })) }, `no máximo ${MAX_ITENS} itens`],
    [{ items: [{ text: 'a', media: Array(16).fill('https://x/a.jpg') }, { text: 'b', media: Array(15).fill('https://x/b.jpg') }] }, 'no máximo 30 mídias'],
  ])('recusa o kit inteiro com 400: %#', (kit, mensagem) => {
    expect(() => validarKit(kit)).toThrow(mensagem)
    try { validarKit(kit) } catch (error) { expect(error.statusCode).toBe(400) }
  })
})

describe('normalizarItem', () => {
  test('deduz as redes de textByPlatform quando platforms não vem', () => {
    const item = normalizarItem({ textByPlatform: { instagram: ' legenda ', tiktok: 'curto' } })
    expect(item.platforms).toEqual(['instagram', 'tiktok'])
    expect(item.textByPlatform).toEqual({ instagram: 'legenda', tiktok: 'curto' })
  })

  test('aceita mídia como string ou { url } e só https', () => {
    expect(normalizarItem({ text: 'a', media: ['https://x/a.jpg', { url: 'https://x/b.mp4' }] }).mediaUrls).toEqual(['https://x/a.jpg', 'https://x/b.mp4'])
    expect(() => normalizarItem({ text: 'a', media: ['http://x/a.jpg'] })).toThrow('url https')
  })

  test.each([
    [{}, 'text ou textByPlatform'],
    [{ text: 'a', platforms: ['orkut'] }, 'platforms'],
    [{ textByPlatform: { orkut: 'a' } }, 'rede desconhecida'],
    [{ text: 'a', media: Array(11).fill('https://x/a.jpg') }, 'no máximo 10 mídias'],
    [{ text: 'x'.repeat(10_001) }, 'passa de 10000'],
  ])('recusa item inválido: %#', (item, mensagem) => {
    expect(() => normalizarItem(item)).toThrow(mensagem)
  })
})
