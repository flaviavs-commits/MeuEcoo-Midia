// Tick do agendador externo (scripts/agendador-tick.js; plano do agendador externo, Task 4).
const { chamarEndpoint, executarTick } = require('../../scripts/agendador-tick')

const resposta = status => ({ status, ok: status >= 200 && status < 300 })
const opcoes = (fetchImpl, extra = {}) => ({ baseUrl: 'http://api.interna:3000', segredo: 's3gredo', fetchImpl, esperar: jest.fn().mockResolvedValue(), ...extra })
const silencioso = { log: jest.fn(), error: jest.fn() }

describe('executarTick', () => {
  test('sem trabalho, não chama a API e sai com 0', async () => {
    const chamar = jest.fn()
    expect(await executarTick({ detectar: async () => ({ posts: false, midia: false, tokens: false }), chamar, log: silencioso })).toBe(0)
    expect(chamar).not.toHaveBeenCalled()
  })

  test('chama só os endpoints do trabalho encontrado', async () => {
    const chamar = jest.fn().mockResolvedValue({ ok: true, status: 200, tentativas: 1 })
    expect(await executarTick({ detectar: async () => ({ posts: true, midia: false, tokens: true }), chamar, log: silencioso })).toBe(0)
    expect(chamar.mock.calls.map(([caminho]) => caminho)).toEqual(['/api/cron/process-posts', '/api/cron/renew-tokens'])
  })

  test('uma chamada que falha faz o tick sair com 1', async () => {
    const chamar = jest.fn().mockResolvedValueOnce({ ok: true, status: 200, tentativas: 1 }).mockResolvedValueOnce({ ok: false, status: 500, tentativas: 1 })
    expect(await executarTick({ detectar: async () => ({ posts: true, midia: true, tokens: false }), chamar, log: silencioso })).toBe(1)
  })
})

describe('chamarEndpoint', () => {
  test('repete 502 enquanto a API acorda, com espera de 1 s e 2 s, e manda o segredo', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(resposta(502)).mockResolvedValueOnce(resposta(502)).mockResolvedValueOnce(resposta(200))
    const o = opcoes(fetchImpl)
    expect(await chamarEndpoint('/api/cron/process-posts', o)).toEqual({ ok: true, status: 200, tentativas: 3 })
    expect(o.esperar.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000])
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://api.interna:3000/api/cron/process-posts')
    expect(init.headers.Authorization).toBe('Bearer s3gredo')
  })

  test('401 (segredo errado) não repete (Review Focus 3)', async () => {
    const o = opcoes(jest.fn().mockResolvedValue(resposta(401)))
    expect(await chamarEndpoint('/api/cron/process-posts', o)).toEqual({ ok: false, status: 401, tentativas: 1 })
    expect(o.esperar).not.toHaveBeenCalled()
  })

  test('erro de rede repete até esgotar as 6 esperas (7 tentativas)', async () => {
    const o = opcoes(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    expect(await chamarEndpoint('/api/cron/process-posts', o)).toEqual({ ok: false, status: null, tentativas: 7 })
    expect(o.esperar.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000, 8000, 16000, 30000])
  })

  test('timeout conta como erro de rede e é repetido', async () => {
    const fetchImpl = jest.fn((_url, init) => new Promise((_, rejeitar) => init.signal.addEventListener('abort', () => rejeitar(Object.assign(new Error('abortado'), { name: 'AbortError' })))))
    fetchImpl.mockImplementationOnce((_url, init) => new Promise((_, rejeitar) => init.signal.addEventListener('abort', () => rejeitar(Object.assign(new Error('abortado'), { name: 'AbortError' })))))
      .mockResolvedValueOnce(resposta(200))
    expect(await chamarEndpoint('/api/cron/media-cleanup', opcoes(fetchImpl, { timeoutMs: 5 }))).toEqual({ ok: true, status: 200, tentativas: 2 })
  })
})
