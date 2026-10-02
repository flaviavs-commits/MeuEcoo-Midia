// Integração com o Meu Ecoo — fonte da verdade da identidade do ecossistema
// Vitis Souls (decisão de 29/07/2026). Este app mantém seu próprio banco,
// bcrypt e TOTP; nenhum dado interno muda de dono. O que muda é a credencial:
//
//   - sincronizarCredencial: depois de um login local certo (bcrypt), empurra
//     a senha em texto para o Meu Ecoo gravar o hash pbkdf2 dele. Best-effort:
//     nunca lança, nunca bloqueia o login.
//   - autenticarViaMeuEcoo: fallback quando o bcrypt local falha (ex.: senha
//     trocada só no Meu Ecoo). Se confirmar, o chamador re-hasheia com bcrypt.

const PARTNER_LOGIN_PATH = '/api/partner/auth/login'
const PARTNER_SYNC_PATH = '/api/partner/auth/sync-credential'
const TIMEOUT_MS = 5000
const { safeMessage } = require('../utils/redact')

// Cada endpoint de parceiro reconhece o app por um token diferente. Desde
// 24/08/2026 o Meu Ecoo só aceita a sincronização com o token próprio do app
// (CREDENTIAL_SYNC_SOCIAL_API_MANAGER_TOKEN do lado de lá); o token de login é
// recusado com 403. Por isso não há fallback de um token para o outro.
const TOKEN_POR_OPERACAO = {
  login: 'MEU_ECOO_SERVICE_TOKEN',
  sincronizacao: 'MEU_ECOO_CREDENTIAL_SYNC_TOKEN',
}

function getConfig(operacao) {
  const url = process.env.MEU_ECOO_API_URL
  const token = String(process.env[TOKEN_POR_OPERACAO[operacao]] || '').trim()
  if (!url || !token) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) return null
    return { url: parsed.toString().replace(/\/$/, ''), token }
  } catch {
    return null
  }
}

async function sincronizarCredencial(email, password, nome) {
  const config = getConfig('sincronizacao')
  if (!config) return

  try {
    const res = await fetch(`${config.url}${PARTNER_SYNC_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Token': config.token },
      body: JSON.stringify({ email, password, nome, origemApp: 'social-api-manager' }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    // Best-effort, mas não silencioso: um 403 aqui passou um mês sem ninguém ver.
    if (!res.ok) console.error('[Meu Ecoo] falha ao sincronizar credencial:', `HTTP ${res.status}`)
  } catch (err) {
    console.error('[Meu Ecoo] falha ao sincronizar credencial:', safeMessage(err?.message))
  }
}

async function autenticarViaMeuEcoo(email, password) {
  const config = getConfig('login')
  if (!config) return false

  try {
    const res = await fetch(`${config.url}${PARTNER_LOGIN_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Token': config.token },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return res.ok
  } catch (err) {
    console.error('[Meu Ecoo] falha ao autenticar via fallback:', safeMessage(err?.message))
    return false
  }
}

module.exports = { sincronizarCredencial, autenticarViaMeuEcoo }
