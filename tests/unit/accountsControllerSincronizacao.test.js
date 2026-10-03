// Testes unitários — accountsController.reconciliarContasZernio
//
// Roda quando o usuário abre a tela de contas. Em 03/10/2026 a Zernio listava
// zero contas em todos os perfis; a política decidida é confiar na lista mesmo
// vazia, porque a sincronização agora só desativa (nunca apaga).
jest.mock('../../src/repositories/contasRepository', () => ({
  listarIdsZernioDoUsuario: jest.fn(),
  sincronizarContasZernio: jest.fn(),
}))
jest.mock('../../src/infra/social/zernioClient', () => ({ listAccounts: jest.fn() }))
jest.mock('../../src/middleware/logger', () => ({ addLog: jest.fn() }))
jest.mock('../../src/repositories/usersRepository', () => ({ listarEmailsAdmins: jest.fn(), buscarPorId: jest.fn() }))
jest.mock('../../src/repositories/logsRepository', () => ({ registrarLog: jest.fn() }))
jest.mock('../../src/services/mailer', () => ({ enviarEmailAlertaAdmin: jest.fn() }))

const accounts = require('../../src/repositories/contasRepository')
const zernioClient = require('../../src/infra/social/zernioClient')
const { addLog } = require('../../src/middleware/logger')
const usersRepo = require('../../src/repositories/usersRepository')
const { registrarLog } = require('../../src/repositories/logsRepository')
const mailer = require('../../src/services/mailer')
const { reconciliarContasZernio } = require('../../src/http/controllers/accountsController')

beforeEach(() => jest.clearAllMocks())

test('lista vazia da Zernio desativa as contas do perfil e avisa para reconectar', async () => {
  accounts.listarIdsZernioDoUsuario.mockResolvedValue([
    { id: 103, zernioAccountId: 'a1', zernioProfileId: 'p1' },
    { id: 104, zernioAccountId: 'a2', zernioProfileId: 'p1' },
  ])
  zernioClient.listAccounts.mockResolvedValue({ accounts: [] })
  accounts.sincronizarContasZernio.mockResolvedValue({ desconectadas: 2, reativadas: 0 })

  await reconciliarContasZernio(17)

  expect(zernioClient.listAccounts).toHaveBeenCalledTimes(1)
  expect(accounts.sincronizarContasZernio).toHaveBeenCalledWith(17, 'p1', [])
  expect(addLog).toHaveBeenCalledWith('warn', expect.stringContaining('é preciso reconectar'), null, null, 17)
})

test('sincroniza cada perfil com os IDs que a Zernio listou e ignora contas legadas sem perfil', async () => {
  accounts.listarIdsZernioDoUsuario.mockResolvedValue([
    { id: 1, zernioAccountId: 'a1', zernioProfileId: 'p1' },
    { id: 2, zernioAccountId: 'a2', zernioProfileId: 'p2' },
    { id: 3, zernioAccountId: 'a3', zernioProfileId: null },
  ])
  zernioClient.listAccounts.mockImplementation(async ({ profileId }) => ({ accounts: profileId === 'p1' ? [{ _id: 'a1' }] : [{ id: 'a2' }] }))
  accounts.sincronizarContasZernio.mockResolvedValue({ desconectadas: 0, reativadas: 1 })

  await reconciliarContasZernio(17)

  expect(accounts.sincronizarContasZernio).toHaveBeenCalledWith(17, 'p1', ['a1'])
  expect(accounts.sincronizarContasZernio).toHaveBeenCalledWith(17, 'p2', ['a2'])
  expect(accounts.sincronizarContasZernio).toHaveBeenCalledTimes(2)
  expect(addLog).toHaveBeenCalledWith('info', expect.stringContaining('voltaram a aparecer'), null, null, 17)
})

test('falha da Zernio não mexe nas contas e só registra aviso', async () => {
  accounts.listarIdsZernioDoUsuario.mockResolvedValue([{ id: 1, zernioAccountId: 'a1', zernioProfileId: 'p1' }])
  zernioClient.listAccounts.mockRejectedValue(new Error('timeout'))

  await reconciliarContasZernio(17)

  expect(accounts.sincronizarContasZernio).not.toHaveBeenCalled()
  expect(addLog).toHaveBeenCalledWith('warn', expect.stringContaining('timeout'), null, null, 17)
})

describe('alerta aos admins quando contas são desconectadas', () => {
  beforeEach(() => {
    accounts.listarIdsZernioDoUsuario.mockResolvedValue([{ id: 103, zernioAccountId: 'a1', zernioProfileId: 'p1' }])
    zernioClient.listAccounts.mockResolvedValue({ accounts: [] })
    accounts.sincronizarContasZernio.mockResolvedValue({ desconectadas: 1, reativadas: 0 })
    usersRepo.listarEmailsAdmins.mockResolvedValue(['admin@empresa.test'])
    usersRepo.buscarPorId.mockResolvedValue({ id: 17, email: 'cliente@allowed.test' })
  })

  test('primeira vez no dia: grava o log com chave do dia e manda o e-mail', async () => {
    registrarLog.mockResolvedValue({ id: 1 })

    await reconciliarContasZernio(17)

    expect(registrarLog).toHaveBeenCalledWith(expect.objectContaining({ type: 'err', user_id: 17, notification_key: expect.stringMatching(/^zernio-contas-desconectadas:17:\d{4}-\d{2}-\d{2}$/) }))
    expect(mailer.enviarEmailAlertaAdmin).toHaveBeenCalledWith(['admin@empresa.test'], expect.objectContaining({
      title: 'Contas desconectadas no Zernio',
      rows: [['Conta no app', '#17 (cliente@allowed.test)'], ['Contas desconectadas', '1']],
    }))
  })

  test('mesma conta no mesmo dia: o log já existe e o e-mail não sai de novo', async () => {
    registrarLog.mockResolvedValue(undefined)

    await reconciliarContasZernio(17)

    expect(mailer.enviarEmailAlertaAdmin).not.toHaveBeenCalled()
  })

  test('falha no envio do e-mail vira log e não derruba a sincronização', async () => {
    registrarLog.mockResolvedValue({ id: 1 })
    mailer.enviarEmailAlertaAdmin.mockRejectedValue(new Error('SMTP fora'))

    await expect(reconciliarContasZernio(17)).resolves.toBeUndefined()
    expect(addLog).toHaveBeenCalledWith('err', expect.stringContaining('SMTP fora'), null, null, 17)
  })

  test('sem conta desconectada não há alerta', async () => {
    accounts.sincronizarContasZernio.mockResolvedValue({ desconectadas: 0, reativadas: 0 })

    await reconciliarContasZernio(17)

    expect(registrarLog).not.toHaveBeenCalled()
    expect(mailer.enviarEmailAlertaAdmin).not.toHaveBeenCalled()
  })
})
