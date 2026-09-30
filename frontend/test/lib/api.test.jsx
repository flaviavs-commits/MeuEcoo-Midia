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
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, text: async () => html })))

    await expect(apiFetch('/api/posts')).rejects.toMatchObject({ name: 'ApiError', status: 502, message: 'Não foi possível concluir a operação' })
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
})
