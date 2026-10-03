const tls = require('tls')

const postgresCa = process.env.PGSSL_CA_B64
  ? (() => {
      const der = Buffer.from(process.env.PGSSL_CA_B64, 'base64')
      const body = der.toString('base64').match(/.{1,64}/g)?.join('\n') || ''
      return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----`
    })()
  : String(process.env.PGSSL_CA || '').replace(/\\n/g, '\n')
const postgresFingerprint = String(process.env.PGSSL_SERVER_FINGERPRINT || '').replace(/[^a-f0-9]/gi, '').toUpperCase()
const configuredPoolMax = Number(process.env.PG_POOL_MAX)
const poolMax = Number.isFinite(configuredPoolMax) && configuredPoolMax > 0 ? configuredPoolMax : 10

function checkPostgresCertificate(hostname, certificate) {
  if (postgresFingerprint && certificate?.fingerprint256) {
    const actual = certificate.fingerprint256.replace(/[^a-f0-9]/gi, '').toUpperCase()
    return actual === postgresFingerprint ? undefined : new Error('Fingerprint TLS do PostgreSQL não corresponde')
  }
  return tls.checkServerIdentity(hostname, certificate)
}

// Configuração comum a todo pool do app (requisições e migrations): TLS validado em produção,
// limites de tempo e tamanho. Recebe a URL para que cada pool aponte para o papel certo.
function opcoesPool(connectionString, { max = poolMax } = {}) {
  return {
    connectionString,
    // Nunca desabilitar a validação do certificado em produção. Se a
    // implantação usa uma CA privada, forneça PGSSL_CA em vez de aceitar
    // qualquer certificado apresentado pelo servidor.
    ssl: process.env.NODE_ENV === 'production'
      ? {
          rejectUnauthorized: true,
          ...(postgresCa ? { ca: postgresCa } : {}),
          ...(postgresFingerprint ? { checkServerIdentity: checkPostgresCertificate } : {})
        }
      : undefined,
    // O pool é por réplica. Mantê-lo configurável e moderado evita multiplicar
    // conexões no PostgreSQL quando a API escala horizontalmente no Railway.
    // Use PG_POOL_MAX maior somente após medir a capacidade do banco.
    max,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS || 30000),
    query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS || 35000)
  }
}

module.exports = { opcoesPool }
