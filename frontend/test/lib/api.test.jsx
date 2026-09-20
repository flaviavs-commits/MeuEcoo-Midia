import { publicApiFetch } from '../../src/lib/api.js'

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
})
