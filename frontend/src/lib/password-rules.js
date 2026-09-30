// Mesmas regras que o servidor aplica ao criar ou trocar a senha
// (src/utils/http.js): 8 a 72 caracteres, maiúscula, número e caractere especial.
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 72

export const PASSWORD_RULE_LABELS = {
  length: '8 a 72 caracteres',
  uppercase: '1 maiúscula',
  number: '1 número',
  special: '1 caractere especial',
}

export function passwordRules(password) {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  }
}
