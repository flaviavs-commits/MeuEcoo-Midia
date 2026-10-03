const accounts = require('../../repositories/contasRepository')
const zernioClient = require('../../infra/social/zernioClient')
const usersRepo = require('../../repositories/usersRepository')
const { registrarLog } = require('../../repositories/logsRepository')
const mailer = require('../../services/mailer')
const { addLog } = require('../../middleware/logger')
const { PLATFORMS, TIPOS, parseId, serverError } = require('../../utils/http')

// A sincronização roda a cada abertura de tela que lista contas, então o aviso
// sai uma vez por usuário por dia: o log tem notification_key, e o ON CONFLICT
// do registrarLog não grava (nem devolve) o repetido. Melhor esforço, como os
// alertas de cobrança: falha de e-mail vira log, nunca erro para a tela.
// Em 03/10/2026 todas as contas sumiram da Zernio e ninguém foi avisado por
// uma semana (a saúde das redes só mede se a API responde).
async function alertarAdminsContasDesconectadas(userId, quantidade) {
  try {
    const dia = new Date().toISOString().slice(0, 10)
    const log = await registrarLog({
      type: 'err',
      message: `${quantidade} conta(s) desconectada(s) no Zernio: a publicação nelas falha até o usuário reconectar`,
      user_id: userId,
      notification_key: `zernio-contas-desconectadas:${userId}:${dia}`,
    })
    if (!log) return
    const recipients = await usersRepo.listarEmailsAdmins()
    if (!recipients.length) return
    const usuario = await usersRepo.buscarPorId(userId).catch(() => null)
    const base = String(process.env.FRONTEND_URL || process.env.BASE_URL || '').replace(/\/$/, '')
    await mailer.enviarEmailAlertaAdmin(recipients, {
      title: 'Contas desconectadas no Zernio',
      description: 'A sincronização encontrou contas que não estão mais conectadas no Zernio. Os posts dessas contas vão falhar até a pessoa reconectar em Contas.',
      rows: [['Conta no app', usuario?.email ? `#${userId} (${usuario.email})` : `#${userId}`], ['Contas desconectadas', String(quantidade)]],
      adminUrl: `${base}/admin.html`,
    })
  } catch (error) {
    addLog('err', `Falha ao avisar os admins sobre contas desconectadas no Zernio: ${error.message}`, null, null, userId)
  }
}

async function reconciliarContasZernio(userId) {
  const locais = await accounts.listarIdsZernioDoUsuario(userId)
  if (!locais.length) return

  try {
    // Contas legadas sem profile_id continuam no perfil antigo compartilhado;
    // não as reconciliamos contra o novo perfil do cliente.
    const porPerfil = new Map()
    for (const local of locais) {
      if (!local.zernioProfileId) continue
      const grupo = porPerfil.get(local.zernioProfileId) || []
      grupo.push(local)
      porPerfil.set(local.zernioProfileId, grupo)
    }

    let desconectadas = 0
    let reativadas = 0
    // A lista da Zernio é confiável mesmo vazia (decisão do Felipe,
    // 03/10/2026): naquele dia ela listava zero contas em todos os perfis e
    // todas tinham de fato sido desconectadas. Adiar o vazio deixaria a conta
    // aparecendo como conectada e o post falhando sem ninguém ser avisado; e
    // um vazio errado se desfaz sozinho, porque a sincronização só desativa.
    for (const [profileId] of porPerfil) {
      const resposta = await zernioClient.listAccounts({ profileId, includeOverLimit: true })
      const idsAtivos = (resposta.accounts || []).map(account => account._id || account.accountId || account.id).filter(Boolean)
      const resultado = await accounts.sincronizarContasZernio(userId, profileId, idsAtivos)
      desconectadas += resultado.desconectadas
      reativadas += resultado.reativadas
    }
    if (desconectadas) {
      addLog('warn', `${desconectadas} conta(s) marcada(s) como desconectada(s) no Zernio: é preciso reconectar`, null, null, userId)
      await alertarAdminsContasDesconectadas(userId, desconectadas)
    }
    if (reativadas) addLog('info', `${reativadas} conta(s) voltaram a aparecer conectadas no Zernio`, null, null, userId)
  } catch (error) {
    // Falha no provedor não deve impedir o usuário de ver e gerenciar as
    // contas locais, nem deve ser interpretada como exclusão remota.
    addLog('warn', `Não foi possível sincronizar exclusões do Zernio: ${error.message}`, null, null, userId)
  }
}

async function getStats(req, res) {
  try { res.json(await accounts.getDashboardStats(req.user.id, false)) }
  catch (error) { serverError(res, error) }
}

async function list(req, res) {
  try {
    const { platform, tipo, ativo } = req.query
    if (platform !== undefined && !PLATFORMS.includes(platform)) return res.status(400).json({ erro: `platform inválida. Use um de: ${PLATFORMS.join(', ')}` })
    if (tipo !== undefined && !TIPOS.includes(tipo)) return res.status(400).json({ erro: `tipo inválido. Use um de: ${TIPOS.join(', ')}` })
    await reconciliarContasZernio(req.user.id)
    const data = await accounts.listarContas({ platform: platform || null, tipo: tipo || null, ativo: ativo !== undefined ? ativo === 'true' : undefined, userId: req.user.id, isAdmin: false })
    res.json({ total: data.length, data })
  } catch (error) { serverError(res, error) }
}

async function getById(req, res) {
  try {
    const id = parseId(req.params.id)
    if (id === null) return res.status(400).json({ erro: 'id inválido' })
    const account = await accounts.buscarContaPorId(id, req.user.id, false)
    if (!account) return res.status(404).json({ erro: 'Conta não encontrada' })
    const { zernio_account_id: _remoteAccountId, zernio_profile_id: _remoteProfileId, ...publicAccount } = account
    res.json(publicAccount)
  } catch (error) { serverError(res, error) }
}

async function create(req, res) {
  try {
    const { name, platform, tipo } = req.body
    if (name !== undefined && (typeof name !== 'string' || name.length > 200)) return res.status(400).json({ erro: 'Nome da conta inválido.' })
    if (!PLATFORMS.includes(platform)) return res.status(400).json({ erro: `platform inválida. Use um de: ${PLATFORMS.join(', ')}` })
    if (!name && tipo !== undefined && !TIPOS.includes(tipo)) return res.status(400).json({ erro: `tipo inválido. Use um de: ${TIPOS.join(', ')}` })
    const account = name
      ? await accounts.criarContaRapida({ name, platform, userId: req.user.id })
      : await accounts.criarConta({ platform, handle: req.body.handle, tipo, userId: req.user.id })
    res.status(201).json({ account })
  } catch (error) { serverError(res, error, 'Não foi possível criar a conta') }
}

function contaZernioJaDesconectada(error) {
  return error?.name === 'ZernioError' && [404, 410].includes(Number(error.status))
}

async function remove(req, res) {
  try {
    const id = parseId(req.params.id)
    if (id === null) return res.status(400).json({ erro: 'id inválido' })
    const account = await accounts.buscarContaPorId(id, req.user.id, false)
    if (!account) return res.status(404).json({ erro: 'Conta não encontrada' })

    // A conta local e a conexão no Zernio precisam ter o mesmo ciclo de vida.
    // Se o Zernio já não encontrar a conexão, a operação é idempotente:
    // removemos também o registro local em vez de devolver um falso erro 500.
    if (account.zernio_account_id) {
      try {
        await zernioClient.disconnectAccount(account.zernio_account_id)
      } catch (error) {
        if (!contaZernioJaDesconectada(error)) throw error
      }
    }

    const removed = await accounts.deletarConta(id, req.user.id, false)
    if (!removed) return res.status(404).json({ erro: 'Conta não encontrada' })
    addLog('info', `Conta ID ${id} deletada`)
    res.json({ deleted: true })
  } catch (error) {
    serverError(res, error, 'Não foi possível desconectar esta conta agora. Tente novamente em instantes.')
  }
}

module.exports = { getStats, list, getById, create, remove, reconciliarContasZernio }
