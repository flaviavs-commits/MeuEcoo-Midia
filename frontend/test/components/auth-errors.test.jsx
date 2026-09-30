import { describeAuthError, isHumanMessage } from '../../src/lib/auth-errors.js'
import { ApiError } from '../../src/lib/api.js'

describe('mensagens de erro da autenticação', () => {
  it('reconhece texto técnico', () => {
    expect(isHumanMessage('E-mail ou senha incorretos.')).toBe(true)
    expect(isHumanMessage('Request failed with status code 422')).toBe(false)
    expect(isHumanMessage('Invalid credentials')).toBe(false)
    expect(isHumanMessage('<html><body>502 Bad Gateway</body></html>')).toBe(false)
    expect(isHumanMessage('Não foi possível concluir a operação')).toBe(false)
    expect(isHumanMessage('Too Many Requests')).toBe(false)
    expect(isHumanMessage('Service Unavailable')).toBe(false)
    expect(isHumanMessage('Please try again later')).toBe(false)
    expect(isHumanMessage('')).toBe(false)
    // mensagens reais do backend continuam passando
    expect(isHumanMessage('Preencha o e-mail e a senha.')).toBe(true)
    expect(isHumanMessage('Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.')).toBe(true)
    expect(isHumanMessage('Esta conta foi criada com login do Google. Use o botão "Continuar com o Google" para entrar.')).toBe(true)
    expect(isHumanMessage('A senha precisa ter entre 8 e 72 caracteres.')).toBe(true)
  })

  it('sem conexão e tempo esgotado', () => {
    expect(describeAuthError(new ApiError('Não foi possível conectar ao servidor.', 0)).text).toBe('Sem conexão com o servidor. Verifique sua internet e tente novamente.')
    expect(describeAuthError(new ApiError('Tempo esgotado.', 408)).text).toBe('O servidor demorou para responder. Tente novamente.')
  })

  it('erro de servidor nunca mostra o corpo da resposta', () => {
    expect(describeAuthError(new ApiError('<html>502</html>', 502), 'login')).toEqual({ text: 'Não foi possível entrar agora. Tente novamente em instantes.' })
    expect(describeAuthError(new ApiError('Erro qualquer do banco', 500), 'signup').text).toBe('Não foi possível criar sua conta agora. Tente novamente em instantes.')
  })

  it('credenciais, domínio e limite de tentativas no login', () => {
    expect(describeAuthError(new ApiError('Invalid credentials', 401), 'login')).toEqual({ text: 'E-mail ou senha incorretos.' })
    expect(describeAuthError(new ApiError('Use um e-mail @empresa.com para acessar a aplicação.', 403), 'login'))
      .toEqual({ field: 'email', text: 'Use um e-mail @empresa.com para acessar a aplicação.' })
    expect(describeAuthError(new ApiError('Too Many Requests', 429), 'login').text).toBe('Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.')
  })

  it('cadastro: e-mail já usado e senha recusada pelo servidor', () => {
    expect(describeAuthError(new ApiError('Já existe uma conta com esse e-mail.', 409), 'signup'))
      .toEqual({ field: 'email', text: 'Já existe uma conta com este e-mail.', code: 'exists' })
    expect(describeAuthError(new ApiError('A senha precisa ter ao menos 1 número.', 400), 'signup'))
      .toEqual({ field: 'password', text: 'A senha precisa ter ao menos 1 número.' })
  })

  it('código 2FA errado ou etapa vencida', () => {
    expect(describeAuthError(new ApiError('Código inválido. Verifique o app autenticador e tente de novo.', 400), 'twoFactor').field).toBe('code')
    expect(describeAuthError(new ApiError('Nenhum login pendente de confirmação. Faça login novamente.', 400), 'twoFactor').code).toBe('expired')
  })

  it('redefinição com link vencido', () => {
    expect(describeAuthError(new ApiError('Esse link não é mais válido. Solicite a redefinição de senha novamente.', 400), 'reset').code).toBe('expired')
  })

  it('erro inesperado do próprio código cai no texto padrão da etapa', () => {
    expect(describeAuthError(new TypeError('x is undefined'), 'forgot')).toEqual({ text: 'Não foi possível enviar o link agora. Tente novamente em instantes.' })
  })
})
