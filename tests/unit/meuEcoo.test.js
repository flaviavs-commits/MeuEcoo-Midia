const { sincronizarCredencial, autenticarViaMeuEcoo } = require('../../src/services/meuEcoo')

const URL_MEU_ECOO = 'https://meu-ecoo.exemplo.com'

function headersDaChamada(indice = 0) {
  return global.fetch.mock.calls[indice][1].headers
}

describe('integração com o Meu Ecoo', () => {
  const envOriginal = { ...process.env }

  beforeEach(() => {
    process.env.MEU_ECOO_API_URL = URL_MEU_ECOO
    process.env.MEU_ECOO_SERVICE_TOKEN = 'token-login-compartilhado'
    process.env.MEU_ECOO_CREDENTIAL_SYNC_TOKEN = 'token-sync-do-social'
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 })
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = { ...envOriginal }
    delete global.fetch
    jest.restoreAllMocks()
  })

  // Desde 24/08/2026 o Meu Ecoo só aceita a sincronização com o token próprio
  // de cada app (CREDENTIAL_SYNC_*); com o token de login ele responde 403.
  test('sincroniza a senha com o token de sincronização, não com o de login', async () => {
    await sincronizarCredencial('ana@exemplo.com', 'senha-certa-123', 'Ana')

    expect(global.fetch).toHaveBeenCalledWith(`${URL_MEU_ECOO}/api/partner/auth/sync-credential`, expect.any(Object))
    expect(headersDaChamada()['X-Service-Token']).toBe('token-sync-do-social')
  })

  test('o login de fallback continua com o token de login', async () => {
    await autenticarViaMeuEcoo('ana@exemplo.com', 'senha-certa-123')

    expect(global.fetch).toHaveBeenCalledWith(`${URL_MEU_ECOO}/api/partner/auth/login`, expect.any(Object))
    expect(headersDaChamada()['X-Service-Token']).toBe('token-login-compartilhado')
  })

  test('sem token de sincronização, não chama o Meu Ecoo nem usa o token de login no lugar', async () => {
    delete process.env.MEU_ECOO_CREDENTIAL_SYNC_TOKEN

    await sincronizarCredencial('ana@exemplo.com', 'senha-certa-123', 'Ana')

    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('resposta recusada vira erro no log sem derrubar o login', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 403 })

    await expect(sincronizarCredencial('ana@exemplo.com', 'senha-certa-123', 'Ana')).resolves.toBeUndefined()

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('sincronizar credencial'), expect.stringContaining('403'))
    expect(JSON.stringify(console.error.mock.calls)).not.toContain('senha-certa-123')
  })
})
