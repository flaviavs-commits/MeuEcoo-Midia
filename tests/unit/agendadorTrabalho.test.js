// Detector de trabalho do agendador externo (plano docs/superpowers/plans/2026-10-02-agendador-externo-sleep.md, Task 3).
jest.mock('../../src/db/pool', () => ({ query: jest.fn() }))

const pool = require('../../src/db/pool')
const { haPostsParaProcessar, haMidiaParaLimpar, haTokensParaRenovar, detectarTrabalho } = require('../../src/services/agendadorTrabalho')
const { predicadoPostAgendadoVencido, predicadoProcessingParado } = require('../../src/infra/db/postsRepository')

const existe = valor => ({ rows: [{ existe: valor }] })
beforeEach(() => { jest.clearAllMocks(); pool.query.mockResolvedValue(existe(true)) })

describe('haPostsParaProcessar', () => {
  test('uma consulta só, cobrindo agendado vencido, processing parado, primeiro comentário e pendências', async () => {
    pool.query.mockResolvedValueOnce(existe(false))
    expect(await haPostsParaProcessar()).toBe(false)
    const [sql] = pool.query.mock.calls[0]
    expect(pool.query).toHaveBeenCalledTimes(1)
    for (const trecho of ["status = 'scheduled'", "status = 'processing'", 'post_first_comments', 'instagram_pending', "INTERVAL '48 hours'"]) expect(sql).toContain(trecho)
  })

  test('não olha platform_health: post vencido segurado por rede "down" antiga ainda acorda a API (Review Focus 1)', async () => {
    await haPostsParaProcessar()
    expect(pool.query.mock.calls[0][0]).not.toContain('platform_health')
    expect(predicadoPostAgendadoVencido()).not.toContain('platform_health')
  })

  test('os predicados são os mesmos que a reserva e a recuperação usam', () => {
    const repo = require('fs').readFileSync(require.resolve('../../src/infra/db/postsRepository'), 'utf8')
    expect(repo).toMatch(/WHERE \$\{predicadoPostAgendadoVencido\('p'\)\}/)
    expect(repo).toMatch(/WHERE \$\{predicadoProcessingParado\('p'\)\}/)
    expect(repo).toMatch(/platform_health WHERE status = 'down'/)
    expect(predicadoProcessingParado()).toContain("INTERVAL '6 hours'")
  })
})

describe('mídia e tokens', () => {
  test('mídia usa o mesmo predicado da limpeza', async () => {
    pool.query.mockResolvedValueOnce(existe(true))
    expect(await haMidiaParaLimpar()).toBe(true)
    expect(pool.query.mock.calls[0][0]).toContain('media_cleaned_at IS NULL')
  })

  test('tokens: vencidos ou vencendo em 7 dias', async () => {
    pool.query.mockResolvedValueOnce(existe(false))
    expect(await haTokensParaRenovar()).toBe(false)
    expect(pool.query.mock.calls[0][0]).toContain("INTERVAL '7 days'")
  })
})

describe('detectarTrabalho', () => {
  test('na janela de 6 h (12:03 UTC) consulta tudo', async () => {
    expect(await detectarTrabalho({ agora: new Date('2026-10-02T12:03:00Z') })).toEqual({ posts: true, midia: true, tokens: true })
    expect(pool.query).toHaveBeenCalledTimes(3)
  })

  test.each(['2026-10-02T13:03:00Z', '2026-10-02T12:07:00Z'])('fora da janela (%s) só consulta posts (Review Focus 5)', async quando => {
    expect(await detectarTrabalho({ agora: new Date(quando) })).toEqual({ posts: true, midia: false, tokens: false })
    expect(pool.query).toHaveBeenCalledTimes(1)
  })
})
