// Limpeza de mídias contra o SQL real (src/services/mediaCleanupService.js): o cenário de produção
// de 03/10/2026, em que 14 posts vencidos compartilhavam o arquivo de uma fila recorrente e eram
// adiados a cada hora para sempre. O Blob é simulado; o banco é real.
jest.mock('../../src/infra/storage/blobStorage', () => ({
  canonicalBlobUrl: valor => /^https:\/\/blob\.example\//i.test(valor) ? valor : null,
  excluirBlobs: jest.fn(async urls => urls.length),
}))

const { urlDoBanco, prepararBanco, limparBanco } = require('./setup')

const temBanco = Boolean(urlDoBanco())
const descrever = temBanco ? describe : describe.skip

descrever('limpeza de mídias (Postgres real)', () => {
  let banco, ids
  const umValor = async (texto, params) => (await banco.pool.query(texto, params)).rows[0]
  const postVencido = async (usuario, midia) => umValor(
    "INSERT INTO posts (user_id, text, platforms, scheduled_at, status, media_path, media_cleanup_after) VALUES ($1, 'vencido', ARRAY['instagram'], NOW() - INTERVAL '20 days', 'error', $2, NOW() - INTERVAL '1 day') RETURNING id",
    [usuario, midia]
  )

  beforeAll(async () => {
    banco = await prepararBanco()
    const { id: usuario } = await umValor("INSERT INTO users (email, plan, plan_active) VALUES ('midias@teste.local', 'pro', TRUE) RETURNING id")
    await banco.pool.query("INSERT INTO content_queues (user_id, name, content) VALUES ($1, 'Fila', '{\"mediaPath\": \"https://blob.example/fila.jpg\"}')", [usuario])
    await banco.pool.query("INSERT INTO posts (user_id, text, platforms, scheduled_at, status, media_path) VALUES ($1, 'ainda agendado', ARRAY['instagram'], NOW() + INTERVAL '1 day', 'scheduled', 'https://blob.example/em-uso.jpg')", [usuario])
    ids = {
      filaA: (await postVencido(usuario, 'https://blob.example/fila.jpg')).id,
      filaB: (await postVencido(usuario, 'https://blob.example/fila.jpg')).id,
      sozinho: (await postVencido(usuario, 'https://blob.example/sozinho.jpg')).id,
      esperando: (await postVencido(usuario, 'https://blob.example/em-uso.jpg')).id,
    }
  })

  afterAll(async () => { await limparBanco(banco) })

  test('apaga o que não tem uso, entrega à fila o que ela usa e espera o post ainda agendado', async () => {
    const { excluirBlobs } = require('../../src/infra/storage/blobStorage')
    const { limparMidiasExpiradas } = require('../../src/services/mediaCleanupService')

    const resultado = await limparMidiasExpiradas()

    expect(excluirBlobs).toHaveBeenCalledWith(['https://blob.example/sozinho.jpg'])
    expect(resultado).toEqual({ candidates: 4, deleted: 1, deferred: 1, handedOff: 2, marked: 3, errors: 0 })
    const { rows } = await banco.pool.query('SELECT id, media_cleaned_at IS NOT NULL AS limpo FROM posts WHERE id = ANY($1) ORDER BY id', [Object.values(ids)])
    expect(Object.fromEntries(rows.map(r => [r.id, r.limpo]))).toEqual({ [ids.filaA]: true, [ids.filaB]: true, [ids.sozinho]: true, [ids.esperando]: false })
  })

  test('na execução seguinte, os posts entregues à fila não voltam como candidatos', async () => {
    const { limparMidiasExpiradas } = require('../../src/services/mediaCleanupService')
    expect(await limparMidiasExpiradas()).toEqual({ candidates: 1, deleted: 0, deferred: 1, handedOff: 0, marked: 0, errors: 0 })
  })
})
