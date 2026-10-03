jest.mock('../../../src/db/pool', () => ({ query: jest.fn() }))
jest.mock('../../../src/infra/storage/blobStorage', () => ({
  canonicalBlobUrl: value => /^https:\/\/blob\.example\//i.test(value) ? value : null,
  excluirBlobs: jest.fn()
}))

const pool = require('../../../src/db/pool')
const { excluirBlobs } = require('../../../src/infra/storage/blobStorage')
const {
  SUCCESS_RETENTION_HOURS,
  FAILURE_RETENTION_DAYS,
  collectBlobUrls,
  limparMidiasExpiradas
} = require('../../../src/services/mediaCleanupService')

beforeEach(() => jest.clearAllMocks())

describe('mediaCleanupService', () => {
  test('define os prazos de sucesso e falha', () => {
    expect(SUCCESS_RETENTION_HOURS).toBe(48)
    expect(FAILURE_RETENTION_DAYS).toBe(7)
  })

  test('coleta mídias compartilhadas e específicas por conta', () => {
    const result = collectBlobUrls({
      mediaPath: 'https://blob.example/shared.jpg',
      mediaItems: [{ path: 'https://blob.example/carousel-1.jpg' }],
      accountMediaItems: [[{ path: 'https://blob.example/account.mp4' }]]
    })

    expect(result.targets).toEqual(new Set([
      'https://blob.example/shared.jpg',
      'https://blob.example/carousel-1.jpg',
      'https://blob.example/account.mp4'
    ]))
  })

  test('exclui mídia expirada e marca o post quando não há referências', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 10, mediaPath: 'https://blob.example/post.jpg', mediaItems: null, accountMediaItems: [] }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1 })
    excluirBlobs.mockResolvedValueOnce(1)

    const result = await limparMidiasExpiradas()

    expect(excluirBlobs).toHaveBeenCalledWith(['https://blob.example/post.jpg'])
    expect(pool.query).toHaveBeenCalledTimes(3)
    expect(result).toMatchObject({ candidates: 1, deleted: 1, deferred: 0, marked: 1, errors: 0 })
  })

  test('adia a exclusão quando a mídia também está referenciada', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 11, mediaPath: 'https://blob.example/post.jpg', mediaItems: null, accountMediaItems: [] }] })
      .mockResolvedValueOnce({ rows: [{ url: 'https://blob.example/post.jpg' }] })

    const result = await limparMidiasExpiradas()

    expect(excluirBlobs).not.toHaveBeenCalled()
    expect(pool.query).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ candidates: 1, deleted: 0, deferred: 1, marked: 0, errors: 0 })
  })

  test('entrega ao dono a mídia usada por fila, rascunho ou biblioteca: não apaga e marca o post', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 12, mediaPath: 'https://blob.example/fila.jpg', mediaItems: null, accountMediaItems: [] }] })
      .mockResolvedValueOnce({ rows: [{ url: 'https://blob.example/fila.jpg', origem: 'dono' }] })
      .mockResolvedValueOnce({ rowCount: 1 })

    const result = await limparMidiasExpiradas()

    expect(excluirBlobs).not.toHaveBeenCalled()
    expect(pool.query.mock.calls[2][1]).toEqual([[12]])
    expect(result).toMatchObject({ candidates: 1, deleted: 0, deferred: 0, handedOff: 1, marked: 1, errors: 0 })
  })

  test('um dono permanente vence a espera por outro post ativo', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 13, mediaPath: 'https://blob.example/x.jpg', mediaItems: null, accountMediaItems: [] }] })
      .mockResolvedValueOnce({ rows: [{ url: 'https://blob.example/x.jpg', origem: 'post' }, { url: 'https://blob.example/x.jpg', origem: 'dono' }] })
      .mockResolvedValueOnce({ rowCount: 1 })

    const result = await limparMidiasExpiradas()

    expect(excluirBlobs).not.toHaveBeenCalled()
    expect(result).toMatchObject({ deferred: 0, handedOff: 1, marked: 1 })
  })

  test('se a exclusão falha, marca só os posts que não tinham arquivo a apagar', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [
        { id: 14, mediaPath: 'https://blob.example/apagar.jpg', mediaItems: null, accountMediaItems: [] },
        { id: 15, mediaPath: 'https://blob.example/fila.jpg', mediaItems: null, accountMediaItems: [] },
      ] })
      .mockResolvedValueOnce({ rows: [{ url: 'https://blob.example/fila.jpg', origem: 'dono' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
    excluirBlobs.mockRejectedValueOnce(new Error('Blob fora do ar'))

    const result = await limparMidiasExpiradas()

    expect(pool.query.mock.calls[2][1]).toEqual([[15]])
    expect(result).toMatchObject({ deleted: 0, handedOff: 1, marked: 1, errors: 1 })
  })
})
