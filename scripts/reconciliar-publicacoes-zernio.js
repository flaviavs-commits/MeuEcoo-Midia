// Reconcilia com a Zernio as publicações cuja confirmação se perdeu.
// Uso (no ambiente com as variáveis do Railway, ex.: `railway ssh` no serviço da API):
//   node scripts/reconciliar-publicacoes-zernio.js --desde=2026-09-11            (simulação, não grava)
//   node scripts/reconciliar-publicacoes-zernio.js --desde=2026-09-11 --aplicar  (grava)
// Regras e salvaguardas: src/use-cases/posts/reconciliarPublicacoesZernio.js
require('dotenv').config()
const pool = require('../src/db/pool')
const { reconciliarPublicacoesZernio } = require('../src/use-cases/posts/reconciliarPublicacoesZernio')

function argumento(nome) {
  const encontrado = process.argv.find(arg => arg === `--${nome}` || arg.startsWith(`--${nome}=`))
  if (!encontrado) return null
  return encontrado.includes('=') ? encontrado.split('=').slice(1).join('=') : true
}

async function main() {
  const desde = argumento('desde')
  if (!desde || !/^\d{4}-\d{2}-\d{2}$/.test(desde)) throw new Error('Informe --desde=AAAA-MM-DD.')
  const aplicar = argumento('aplicar') === true
  const resultado = await reconciliarPublicacoesZernio({ desde: `${desde}T00:00:00Z`, aplicar })
  console.log(aplicar ? 'MODO APLICAR: alterações gravadas.' : 'SIMULAÇÃO: nada foi gravado. Use --aplicar para gravar.')
  console.log(`Posts da Zernio desde ${desde}: ${resultado.postsNaZernio}`)
  console.log(`Contas divergentes: ${resultado.divergentes.length}`)
  for (const d of resultado.divergentes) console.log(`  post ${d.postId} · conta ${d.postAccountId} · ${d.platform} · ${d.externalPostId || 'sem id externo'} · antes: ${d.erroLocal || 'não confirmada'}`)
  console.log(`Posts com status ${aplicar ? 'corrigido' : 'a corrigir'}: ${resultado.postsCorrigidos.length}`)
  for (const p of resultado.postsCorrigidos) console.log(`  post ${p.postId}: ${p.de} → ${p.para}`)
  if (resultado.ignorados.length) console.log(`Ignorados: ${JSON.stringify(resultado.ignorados)}`)
}

main()
  .catch(error => { console.error(`Falha: ${error.message}`); process.exitCode = 1 })
  .finally(() => pool.end().catch(() => {}))
