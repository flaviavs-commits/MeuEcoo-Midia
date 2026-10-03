// Testes unitários — importarMidiaPorUrl (download de mídia do kit para o Blob)
//
// É o único ponto em que o servidor baixa uma URL escolhida pelo usuário,
// então os testes cobrem cada salvaguarda contra SSRF e contra arquivo ruim.
const mockOutbound = { url: 'https://cdn.exemplo.com/peca.jpg', dispatcher: { fixo: true }, close: jest.fn().mockResolvedValue() }
jest.mock('../../src/utils/outboundUrl', () => ({ prepareOutboundHttpsRequest: jest.fn() }))
jest.mock('../../src/infra/storage/blobStorage', () => {
  const real = jest.requireActual('../../src/infra/storage/blobStorage')
  return { ...real, salvarBuffer: jest.fn().mockResolvedValue('https://blob.exemplo/abc-kit.jpg'), mediaProxyUrl: jest.fn(() => null) }
})

const { prepareOutboundHttpsRequest } = require('../../src/utils/outboundUrl')
const blob = require('../../src/infra/storage/blobStorage')
const { importarMidiaPorUrl, MidiaImportadaInvalida } = require('../../src/infra/storage/importarMidiaPorUrl')

function resposta(corpo, { status = 200, tipo = 'image/jpeg', tamanho } = {}) {
  const headers = { 'content-type': tipo }
  if (tamanho !== undefined) headers['content-length'] = String(tamanho)
  return new Response(corpo, { status, headers })
}

beforeEach(() => {
  jest.clearAllMocks()
  prepareOutboundHttpsRequest.mockResolvedValue(mockOutbound)
})

test('baixa com o IP fixado e sem seguir redirect, salva no Blob e devolve o item no formato do upload', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(resposta(Buffer.from('imagem')))

  const item = await importarMidiaPorUrl('https://cdn.exemplo.com/peca.jpg', { fetchImpl })

  const [, opcoes] = fetchImpl.mock.calls[0]
  expect(opcoes.redirect).toBe('error')
  expect(opcoes.dispatcher).toBe(mockOutbound.dispatcher)
  expect(blob.salvarBuffer).toHaveBeenCalledWith(expect.stringMatching(/-kit\.jpg$/), expect.any(Buffer), 'image/jpeg')
  expect(item).toEqual({ path: 'https://blob.exemplo/abc-kit.jpg', type: 'image', name: 'peca.jpg', mimeType: 'image/jpeg', size: 6 })
  expect(mockOutbound.close).toHaveBeenCalled()
})

test('no modo de Blob privado grava a URL do proxy, como o upload do frontend', async () => {
  blob.mediaProxyUrl.mockReturnValueOnce('https://api.exemplo/media-proxy/tok/abc.jpg')
  const fetchImpl = jest.fn().mockResolvedValue(resposta(Buffer.from('x')))

  const item = await importarMidiaPorUrl('https://cdn.exemplo.com/peca.jpg', { fetchImpl })

  expect(item.path).toBe('https://api.exemplo/media-proxy/tok/abc.jpg')
})

test('host interno ou privado é recusado antes de qualquer conexão', async () => {
  prepareOutboundHttpsRequest.mockRejectedValue(new Error('Destino resolve para rede privada ou reservada'))
  const fetchImpl = jest.fn()

  await expect(importarMidiaPorUrl('https://169.254.169.254/x', { fetchImpl })).rejects.toThrow(MidiaImportadaInvalida)
  expect(fetchImpl).not.toHaveBeenCalled()
})

test('redirect (que o fetch recusa com redirect: error) vira mídia recusada e não salva nada', async () => {
  const fetchImpl = jest.fn().mockRejectedValue(new TypeError('fetch failed: unexpected redirect'))

  await expect(importarMidiaPorUrl('https://cdn.exemplo.com/peca.jpg', { fetchImpl })).rejects.toThrow('falha de conexão ou redirecionamento')
  expect(blob.salvarBuffer).not.toHaveBeenCalled()
  expect(mockOutbound.close).toHaveBeenCalled()
})

test('tipo fora da lista permitida é recusado', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(resposta('<html>', { tipo: 'text/html' }))

  await expect(importarMidiaPorUrl('https://cdn.exemplo.com/peca.jpg', { fetchImpl })).rejects.toThrow('Tipo de mídia não permitido: text/html')
  expect(blob.salvarBuffer).not.toHaveBeenCalled()
})

test('arquivo acima do limite é recusado pelo tamanho declarado', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(resposta(Buffer.from('x'), { tamanho: 51 * 1024 * 1024 }))

  await expect(importarMidiaPorUrl('https://cdn.exemplo.com/peca.jpg', { fetchImpl })).rejects.toThrow('tamanho máximo')
  expect(blob.salvarBuffer).not.toHaveBeenCalled()
})

test('status de erro do servidor de origem é recusado', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(resposta('nao achou', { status: 404 }))

  await expect(importarMidiaPorUrl('https://cdn.exemplo.com/peca.jpg', { fetchImpl })).rejects.toThrow('status 404')
})
