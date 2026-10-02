const crypto = require('node:crypto')
const rateLimit = require('express-rate-limit')

// Chaves dos limites de tentativas (express-rate-limit).
//
// Em produção o processo recebe tudo pelo salto interno do Railway: req.ip é o
// mesmo para todos os clientes (medido em 02/10/2026), então qualquer limite
// chaveado por req.ip junta o app inteiro numa chave só. O endereço real da
// conexão vem no X-Real-IP, que a borda do Railway regrava (um X-Real-IP ou
// X-Forwarded-For enviado pelo cliente não chega ao processo).
//
// Atenção: o navegador chega pela Vercel (rewrite de /api e /auth), então para
// ele esse endereço é o IP de saída da Vercel, dividido entre vários usuários.
// O IP do usuário que a Vercel repassa (X-Vercel-Forwarded-For) não serve de
// chave: a Vercel não limpa esse header e quem chama o Railway direto também
// pode inventá-lo. Por isso o IP é só um teto alto, e a proteção de cada conta
// vem das chaves por e-mail, token e usuário.

function ipDoCliente(req) {
  if (process.env.RAILWAY_ENVIRONMENT_ID) {
    const ipDaBorda = String(req.headers?.['x-real-ip'] || '').split(',')[0].trim()
    if (ipDaBorda) return ipDaBorda
  }
  return req.ip
}

function resumo(valor) {
  return crypto.createHash('sha256').update(String(valor)).digest('hex').slice(0, 32)
}

function chavePorIp(req) {
  return `ip:${rateLimit.ipKeyGenerator(ipDoCliente(req))}`
}

// O e-mail entra na tabela de contadores só como hash.
function chavePorEmail(req) {
  const email = String(req.body?.email || '').trim().toLowerCase()
  return email ? `email:${resumo(email)}` : chavePorIp(req)
}

function chavePorUsuario(req) {
  return req.user?.id ? `user:${req.user.id}` : chavePorIp(req)
}

// Para fluxos que identificam a pessoa por um token (2FA pendente, link de
// redefinição de senha) e não por e-mail.
function chavePorSegredo(lerSegredo) {
  return req => {
    const segredo = lerSegredo(req)
    return segredo ? `segredo:${resumo(segredo)}` : chavePorIp(req)
  }
}

module.exports = { ipDoCliente, chavePorIp, chavePorEmail, chavePorUsuario, chavePorSegredo }
