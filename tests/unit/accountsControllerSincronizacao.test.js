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

const accounts = require('../../src/repositories/contasRepository')
const zernioClient = require('../../src/infra/social/zernioClient')
const { addLog } = require('../../src/middleware/logger')
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
