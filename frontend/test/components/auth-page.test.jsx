import { parseLoginQuery, readResetToken } from '../../src/pages/auth-page.jsx'
import { getMeuEcooPricing } from '../../src/lib/plans.js'

describe('parâmetros da tela de login', () => {
  it('aceita somente o sinalizador de cadastro e planos conhecidos', () => {
    expect(parseLoginQuery('?register=1&plan=pro')).toEqual({
      register: true,
      selectedPlan: 'pro',
      error: null
    })
  })

  it('descarta parâmetros arbitrários e mensagens não autorizadas', () => {
    expect(parseLoginQuery('?register=true&plan=https%3A%2F%2Fevil.example&error=%3Csvg%20onload%3Dalert(1)%3E&next=https%3A%2F%2Fevil.example')).toEqual({
      register: false,
      selectedPlan: null,
      error: null
    })
  })

  it('aceita somente erro conhecido do fluxo OAuth', () => {
    expect(parseLoginQuery('?error=Login%20com%20Google%20cancelado.').error).toBe('Login com Google cancelado.')
  })

  it('lê o token de redefinição do hash ou da query sem exigir um formato único de link', () => {
    expect(readResetToken({ hash: '#token=do-hash', search: '?token=da-query' })).toBe('do-hash')
    expect(readResetToken({ hash: '', search: '?token=da-query' })).toBe('da-query')
  })

  it('calcula o valor do MeuEcoo Pro com 40% de desconto', () => {
    expect(getMeuEcooPricing({ meuEcooBasePriceCents: 2500, meuEcooDiscountPercent: 40 })).toEqual({
      basePriceCents: 2500,
      discountPercent: 40,
      discountCents: 1000,
      finalPriceCents: 1500,
    })
  })
})
