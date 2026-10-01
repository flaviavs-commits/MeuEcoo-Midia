// Token CSRF e sessão: o cliente guarda estado no módulo, então cada teste importa uma cópia nova.
function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, text: () => Promise.resolve(body == null ? '' : JSON.stringify(body)) }
}

async function freshApi() {
  vi.resetModules()
  return import('../../src/lib/api.js')
}

describe('cliente HTTP — token CSRF e sessão', () => {
  const originalLocation = window.location

  beforeEach(() => {
    delete window.location
    window.location = { ...originalLocation, pathname: '/app/perfil', assign: vi.fn() }
  })
  afterEach(() => {
    window.location = originalLocation
    vi.unstubAllGlobals()
  })

  it('busca o token uma vez só para escritas em paralelo', async () => {
    const fetchMock = vi.fn((url, init = {}) => {
      if (url.endsWith('/auth/csrf')) return Promise.resolve({ json: () => Promise.resolve({ token: 't1' }) })
      return Promise.resolve(jsonResponse(200, { ok: true, token: init.headers['X-CSRF-Token'] }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const { apiFetch } = await freshApi()

    const results = await Promise.all([1, 2, 3].map(index => apiFetch(`/api/drafts/${index}`, { method: 'DELETE' })))

    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/csrf'))).toHaveLength(1)
    expect(results.map(result => result.token)).toEqual(['t1', 't1', 't1'])
  })

  it('renova o token vencido e repete a escrita uma vez', async () => {
    let issued = 0
    const fetchMock = vi.fn((url, init = {}) => {
      if (url.endsWith('/auth/csrf')) { issued += 1; return Promise.resolve({ json: () => Promise.resolve({ token: `t${issued}` }) }) }
      return Promise.resolve(init.headers['X-CSRF-Token'] === 't1'
        ? jsonResponse(403, { erro: 'Token CSRF ausente ou inválido.' })
        : jsonResponse(200, { saved: true }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const { apiFetch } = await freshApi()

    await expect(apiFetch('/api/me/profile', { method: 'PATCH', body: '{}' })).resolves.toEqual({ saved: true })
    expect(issued).toBe(2)
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/api/me/profile'))).toHaveLength(2)
  })

  it('não repete para sempre se o servidor continuar recusando', async () => {
    const fetchMock = vi.fn(url => url.endsWith('/auth/csrf')
      ? Promise.resolve({ json: () => Promise.resolve({ token: 'x' }) })
      : Promise.resolve(jsonResponse(403, { erro: 'Token CSRF ausente ou inválido.' })))
    vi.stubGlobal('fetch', fetchMock)
    const { apiFetch } = await freshApi()

    await expect(apiFetch('/api/me/profile', { method: 'PATCH', body: '{}' })).rejects.toMatchObject({ status: 403, message: 'Token CSRF ausente ou inválido.' })
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/api/me/profile'))).toHaveLength(2)
  })

  it('um 401 que não é de sessão ("Senha atual incorreta.") não desloga quando a chamada pede', async () => {
    const fetchMock = vi.fn(url => url.endsWith('/auth/csrf')
      ? Promise.resolve({ json: () => Promise.resolve({ token: 't' }) })
      : Promise.resolve(jsonResponse(401, { erro: 'Senha atual incorreta.' })))
    vi.stubGlobal('fetch', fetchMock)
    const { apiFetch } = await freshApi()

    await expect(apiFetch('/api/me/password', { method: 'POST', body: '{}', keepSessionOn401: true }))
      .rejects.toMatchObject({ status: 401, message: 'Senha atual incorreta.' })
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/auth/login/logout'))).toBe(false)
    expect(window.location.assign).not.toHaveBeenCalled()
  })

  it('com a sessão vencida, várias respostas 401 levam ao login uma vez só', async () => {
    const fetchMock = vi.fn(url => {
      if (url.endsWith('/auth/csrf')) return Promise.resolve({ json: () => Promise.resolve({ token: 't' }) })
      if (url.endsWith('/auth/login/logout')) return Promise.resolve(jsonResponse(200, { ok: true }))
      return Promise.resolve(jsonResponse(401, { erro: 'Não autenticado' }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const { apiFetch } = await freshApi()

    const results = await Promise.allSettled(['/api/posts', '/api/accounts', '/api/logs?limit=30'].map(path => apiFetch(path)))

    expect(results.every(result => result.status === 'rejected' && result.reason.status === 401)).toBe(true)
    await vi.waitFor(() => expect(window.location.assign).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/auth/login/logout'))).toHaveLength(1)
    expect(window.location.assign).toHaveBeenCalledWith('/login.html?next=perfil')
  })
})
