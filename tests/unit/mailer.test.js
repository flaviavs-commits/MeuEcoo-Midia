// Uma única função compartilhada: jest.isolateModules recria o módulo a cada
// teste, mas todas as instâncias apontam para estes mesmos mocks.
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'id' })
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail }))
jest.mock('nodemailer', () => ({ createTransport: mockCreateTransport }))

const MAIL_VARS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASS', 'SMTP_EHLO_NAME', 'GMAIL_USER', 'GMAIL_APP_PASSWORD']
const originalEnv = { ...process.env }

function loadMailer(env) {
  for (const key of MAIL_VARS) delete process.env[key]
  Object.assign(process.env, env)
  let mailer
  jest.isolateModules(() => { mailer = require('../../src/services/mailer') })
  return mailer
}

beforeEach(() => {
  jest.clearAllMocks()
})

afterAll(() => {
  process.env = originalEnv
})

describe('mailer — escolha do transporte', () => {
  // Configuração real de produção em 02/10/2026: relay do Google Workspace,
  // sem login (autorização por IP), remetente institucional.
  test('usa o SMTP genérico sem login quando só há host/porta/remetente', async () => {
    const mailer = loadMailer({ SMTP_HOST: 'smtp-relay.gmail.com', SMTP_PORT: '587', SMTP_SECURE: 'false', SMTP_FROM: 'contato@empresa.test' })

    await mailer.enviarEmailRedefinicaoSenha('cliente@allowed.test', 'https://app.test/reset')

    expect(mockCreateTransport).toHaveBeenCalledWith({ host: 'smtp-relay.gmail.com', port: 587, secure: false, name: 'empresa.test' })
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ from: '"Meu Ecoo Mídia" <contato@empresa.test>', to: 'cliente@allowed.test' }))
  })

  test('autentica no SMTP quando SMTP_USER e SMTP_PASS existem', async () => {
    const mailer = loadMailer({ SMTP_HOST: 'smtp.empresa.test', SMTP_PORT: '465', SMTP_FROM: 'contato@empresa.test', SMTP_USER: 'contato@empresa.test', SMTP_PASS: 'segredo' })

    await mailer.enviarEmailFalhaCobrancaAssinatura('cliente@allowed.test', { fullName: 'Cliente', planName: 'Pro' })

    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.empresa.test', port: 465, secure: true, auth: { user: 'contato@empresa.test', pass: 'segredo' },
    }))
  })

  test('SMTP tem prioridade sobre o GMAIL_* legado', async () => {
    const mailer = loadMailer({ SMTP_HOST: 'smtp-relay.gmail.com', SMTP_FROM: 'contato@empresa.test', GMAIL_USER: 'antigo@gmail.test', GMAIL_APP_PASSWORD: 'x' })

    await mailer.enviarRelatorioAgendado(['admin@allowed.test'], 'Relatório', 7, '<li>ok</li>')

    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp-relay.gmail.com' }))
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ from: '"Meu Ecoo Mídia" <contato@empresa.test>' }))
  })

  test('cai no GMAIL_* quando não há SMTP configurado', async () => {
    const mailer = loadMailer({ GMAIL_USER: 'conta@gmail.test', GMAIL_APP_PASSWORD: 'senha' })

    await mailer.enviarEmailAlertaEventoStripe(['admin@allowed.test'], { title: 'Disputa', description: 'd', adminUrl: 'https://app.test/admin' })

    expect(mockCreateTransport).toHaveBeenCalledWith({ service: 'gmail', auth: { user: 'conta@gmail.test', pass: 'senha' } })
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ from: '"Meu Ecoo Mídia" <conta@gmail.test>' }))
  })

  test('sem nenhuma configuração, falha com mensagem clara e não tenta enviar', async () => {
    const mailer = loadMailer({})

    await expect(mailer.enviarEmailAlertaPagamentoNaoVinculado(['admin@allowed.test'], { adminUrl: 'https://app.test/admin' }))
      .rejects.toThrow('E-mail não configurado para o alerta de cobrança')
    await expect(mailer.enviarEmailRedefinicaoSenha('cliente@allowed.test', 'https://app.test/reset'))
      .rejects.toThrow('E-mail não configurado para redefinição de senha')
    expect(mockSendMail).not.toHaveBeenCalled()
  })

  test('SMTP_HOST sem remetente não é configuração válida', async () => {
    const mailer = loadMailer({ SMTP_HOST: 'smtp-relay.gmail.com' })

    await expect(mailer.enviarEmailAcessoMeuEcoo('cliente@allowed.test', { accessUrl: 'https://meuecoo.test' }))
      .rejects.toThrow('E-mail não configurado para liberação do MeuEcoo')
  })

  test('reaproveita o transporte entre envios com a mesma configuração', async () => {
    const mailer = loadMailer({ SMTP_HOST: 'smtp-relay.gmail.com', SMTP_FROM: 'contato@empresa.test' })

    await mailer.enviarEmailRedefinicaoSenha('a@allowed.test', 'https://app.test/r1')
    await mailer.enviarEmailRedefinicaoSenha('b@allowed.test', 'https://app.test/r2')

    expect(mockCreateTransport).toHaveBeenCalledTimes(1)
    expect(mockSendMail).toHaveBeenCalledTimes(2)
  })
})
