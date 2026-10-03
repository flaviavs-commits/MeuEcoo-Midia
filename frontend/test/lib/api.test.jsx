import { apiFetch, publicApiFetch } from '../../src/lib/api.js'

function fetchThatAborts(_url, { signal }) {
  return new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => {
      const error = new Error('Aborted')
      error.name = 'AbortError'
      reject(error)
    }, { once: true })
  })
}

describe('cliente HTTP', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('mantém o timeout mesmo quando o chamador fornece um AbortSignal', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(fetchThatAborts))

    const pending = publicApiFetch('/slow', { signal: new AbortController().signal, timeoutMs: 100 })
    const assertion = expect(pending).rejects.toMatchObject({ name: 'ApiError', status: 408 })
    await vi.advanceTimersByTimeAsync(100)

    await assertion
  })

  it('propaga o cancelamento do chamador para o fetch', async () => {
    vi.stubGlobal('fetch', vi.fn(fetchThatAborts))
    const controller = new AbortController()
    const pending = publicApiFetch('/cancelled', { signal: controller.signal })
    const assertion = expect(pending).rejects.toMatchObject({ name: 'ApiError', status: 408 })

    controller.abort()

    await assertion
  })

  it('nunca mostra a página HTML de um proxy como mensagem de erro', async () => {
    const html = '<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head><body><h1>502 Bad Gateway</h1></body></html>'
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, text: async () => html })))

    const pending = apiFetch('/api/posts')
    const assertion = expect(pending).rejects.toMatchObject({ name: 'ApiError', status: 502, message: 'Não foi possível concluir a operação' })
    await vi.advanceTimersByTimeAsync(4000)
    await assertion
  })

  it('também descarta texto com marcação dentro de um JSON de erro', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, text: async () => JSON.stringify({ erro: '<b>Internal</b> failure' }) })))

    await expect(apiFetch('/api/posts')).rejects.toMatchObject({ status: 500, message: 'Não foi possível concluir a operação' })
  })

  it('troca a frase genérica de erro interno pelo texto padrão', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, text: async () => JSON.stringify({ erro: 'Erro interno do servidor' }) })))
    await expect(apiFetch('/api/posts')).rejects.toMatchObject({ status: 500, message: 'Não foi possível concluir a operação' })

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, text: async () => JSON.stringify({ message: 'Internal Server Error' }) })))
    await expect(apiFetch('/api/posts')).rejects.toMatchObject({ status: 500, message: 'Não foi possível concluir a operação' })
  })

  it('mantém a mensagem específica de um 5xx escrita pelo backend', async () => {
    const erro = 'Não foi possível iniciar a configuração do 2FA.'
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, text: async () => JSON.stringify({ erro }) })))

    await expect(apiFetch('/api/me/2fa/setup')).rejects.toMatchObject({ status: 500, message: erro })
  })

  it('mantém a mensagem escrita pelo backend para a pessoa', async () => {
    const erro = 'Escolha uma data pelo menos 20 minutos à frente.'
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ erro }) })))

    await expect(apiFetch('/api/posts')).rejects.toMatchObject({ status: 400, message: erro })
  })

  describe('API acordando do Sleep (502/503)', () => {
    const resposta = (status, corpo = {}) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(corpo) })

    it('GET com 502 é repetido depois de 1 s e devolve o corpo do 200', async () => {
      vi.useFakeTimers()
      const fetchMock = vi.fn().mockResolvedValueOnce(resposta(502)).mockResolvedValueOnce(resposta(200, { id: 7 }))
      vi.stubGlobal('fetch', fetchMock)

      const pending = apiFetch('/api/me')
      await vi.advanceTimersByTimeAsync(999)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      await expect(pending).resolves.toEqual({ id: 7 })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('POST com 502 não é repetido: repetir duplicaria o post (Review Focus 4)', async () => {
      const fetchMock = vi.fn(async url => String(url).endsWith('/auth/csrf') ? resposta(200, { token: 't' }) : resposta(502))
      vi.stubGlobal('fetch', fetchMock)

      await expect(apiFetch('/api/posts', { method: 'POST', body: JSON.stringify({ text: 'x' }) })).rejects.toMatchObject({ status: 502 })
      expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/posts'))).toHaveLength(1)
    })

    it('GET sem conexão tenta 3 vezes (esperas de 1 s e 3 s) e então desiste', async () => {
      vi.useFakeTimers()
      const fetchMock = vi.fn(async () => { throw new TypeError('Failed to fetch') })
      vi.stubGlobal('fetch', fetchMock)

      const pending = apiFetch('/api/me')
      const assertion = expect(pending).rejects.toMatchObject({ status: 0, message: 'Não foi possível conectar ao servidor.' })
      await vi.advanceTimersByTimeAsync(4000)
      await assertion
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('GET cancelado pelo chamador não é repetido', async () => {
      vi.stubGlobal('fetch', vi.fn(fetchThatAborts))
      const controller = new AbortController()
      const pending = apiFetch('/api/me', { signal: controller.signal })
      const assertion = expect(pending).rejects.toMatchObject({ status: 408 })
      controller.abort()
      await assertion
      expect(fetch).toHaveBeenCalledTimes(1)
    })
  })
})
