import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch, publicApiFetch } from '../../src/lib/api.js'

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: vi.fn().mockResolvedValue(JSON.stringify(body)) }
}

describe('api client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  // A sessão é o cookie (credentials: 'include') e toda escrita leva o token CSRF; um token antigo
  // guardado no navegador nunca é enviado.
  it('envia cookie e token CSRF e interpreta JSON', async () => {
    localStorage.setItem('authToken', 'session-token')
    const fetchMock = vi.fn(path => Promise.resolve(path === '/auth/csrf'
      ? { ok: true, status: 200, json: vi.fn().mockResolvedValue({ token: 'csrf-token' }) }
      : jsonResponse({ ok: true })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiFetch('/api/me', { method: 'POST', body: JSON.stringify({ name: 'Ana' }) })).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/me', expect.objectContaining({
      method: 'POST', credentials: 'include', signal: expect.any(AbortSignal),
      headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-token', 'Content-Type': 'application/json' })
    }))
    const [, init] = fetchMock.mock.calls.find(([path]) => path === '/api/me')
    expect(init.headers).not.toHaveProperty('Authorization')
  })

  // Texto que não é JSON vem de outro servidor (proxy, gateway): vira ApiError com o status certo e a
  // mensagem padrão em português, e o texto original fica só no corpo, sem chegar à pessoa.
  it('converte resposta de erro não-JSON em ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, text: vi.fn().mockResolvedValue('Gateway indisponível') }))
    await expect(publicApiFetch('/api/config')).rejects.toMatchObject({
      constructor: ApiError, status: 502, message: 'Não foi possível concluir a operação', body: { texto: 'Gateway indisponível' },
    })
  })

  it('converte abort/timeout em erro de rede controlado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    await expect(publicApiFetch('/api/config', { timeoutMs: 1 })).rejects.toMatchObject({ status: 408 })
  })
})
