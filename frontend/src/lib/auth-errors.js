// Traduz falhas das rotas /auth/login/* para mensagens curtas, em português
// e sem detalhe técnico. O backend já responde em português na maior parte
// dos casos; o texto dele só é usado quando parece escrito para pessoas.
// Um 502 de proxy com HTML, um "Request failed" ou um stack nunca chegam à tela.

const FALLBACK = {
  login: 'Não foi possível entrar agora. Tente novamente em instantes.',
  signup: 'Não foi possível criar sua conta agora. Tente novamente em instantes.',
  forgot: 'Não foi possível enviar o link agora. Tente novamente em instantes.',
  twoFactor: 'Não foi possível verificar o código agora. Tente novamente.',
  reset: 'Não foi possível salvar a nova senha agora. Tente novamente.',
}

const OFFLINE = 'Sem conexão com o servidor. Verifique sua internet e tente novamente.'
const TIMEOUT = 'O servidor demorou para responder. Tente novamente.'
const RATE_LIMITED = 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.'

// Respostas genéricas do cliente/servidor que não ajudam ninguém a agir.
const VAGUE = new Set([
  'Não foi possível concluir a operação',
  'Erro interno do servidor',
  'Dados inválidos para esta operação',
  'Endpoint não encontrado',
])

// Termos técnicos e palavras comuns em inglês: mensagens do backend são em
// português, então inglês quase sempre é proxy, gateway ou biblioteca falando.
const TECHNICAL = /\b(errors?|invalid|fail(ed|ure)?|exceptions?|unexpected|requests?|responses?|status|server|gateway|time ?out|timed out|unauthori[sz]ed|forbidden|not found|unavailable|internal|denied|undefined|null|nan|fetch|json|sql|stack|too many|cannot|unable|please|try again|the|your|you)\b/i

export function isHumanMessage(text) {
  if (typeof text !== 'string') return false
  const value = text.trim()
  if (value.length < 4 || value.length > 240) return false
  if (/[<>{}[\]]|https?:|\/\//.test(value)) return false
  if (VAGUE.has(value)) return false
  return !TECHNICAL.test(value)
}

/*
 * Resultado: { text, field?, code? }
 *   field: campo ao qual a mensagem pertence ('email' | 'password' | 'code');
 *          sem field, a mensagem vale para o formulário inteiro.
 *   code:  'exists' (e-mail já cadastrado) | 'expired' (etapa ou link vencido).
 */
export function describeAuthError(error, step = 'login') {
  const status = typeof error?.status === 'number' ? error.status : null
  const server = isHumanMessage(error?.message) ? error.message.trim() : null
  const fallback = FALLBACK[step] || FALLBACK.login

  if (status === null) return { text: fallback }
  if (status === 0) return { text: OFFLINE }
  if (status === 408) return { text: TIMEOUT }
  if (status === 429) return { text: server || RATE_LIMITED }
  if (status >= 500) return { text: fallback }

  const mentions = pattern => Boolean(server && pattern.test(server))

  if (step === 'login') {
    if (status === 401) return { text: server || 'E-mail ou senha incorretos.' }
    if (status === 403) return { field: 'email', text: server || 'Este e-mail não tem acesso ao Meu Ecoo Mídia.' }
    if (status === 400 && mentions(/e-?mail/i)) return { field: 'email', text: server }
  }

  if (step === 'signup') {
    if (status === 409) return { field: 'email', text: 'Já existe uma conta com este e-mail.', code: 'exists' }
    if (status === 403) return { field: 'email', text: server || 'O cadastro não está disponível para este e-mail.' }
    if (status === 400 && mentions(/senha/i)) return { field: 'password', text: server }
    if (status === 400 && mentions(/e-?mail/i)) return { field: 'email', text: server }
  }

  if (step === 'forgot') {
    if (status === 403) return { field: 'email', text: server || 'Este e-mail não tem acesso ao Meu Ecoo Mídia.' }
    if (status === 400 && mentions(/e-?mail/i)) return { field: 'email', text: server }
  }

  if (step === 'twoFactor' && status === 400) {
    if (mentions(/pendente|faça login/i)) return { text: 'A confirmação expirou. Entre com seu e-mail e senha de novo.', code: 'expired' }
    return { field: 'code', text: 'Código incorreto. Confira o app e tente de novo.' }
  }

  if (step === 'reset' && status === 400) {
    if (mentions(/link/i)) return { text: 'Este link não é mais válido. Peça um novo para redefinir sua senha.', code: 'expired' }
    if (mentions(/senha/i)) return { field: 'password', text: server }
  }

  return { text: server || fallback }
}
