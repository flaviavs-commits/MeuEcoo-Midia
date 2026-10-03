const { validateOutboundHttpsUrl } = require('../../src/utils/outboundUrl')

describe('validateOutboundHttpsUrl', () => {
  test('permite HTTPS para IP público', async () => {
    await expect(validateOutboundHttpsUrl('https://8.8.8.8/hook')).resolves.toBe('https://8.8.8.8/hook')
  })

  test.each([
    'http://127.0.0.1/hook',
    'https://localhost/hook',
    'https://192.168.1.10/hook',
    'https://[::1]/hook',
    'https://user:pass@example.com/hook',
  ])('bloqueia destino proibido: %s', async url => {
    await expect(validateOutboundHttpsUrl(url)).rejects.toThrow()
  })

  test.each([
    'https://[::ffff:10.0.0.1]/hook',
    'https://[::ffff:172.16.0.1]/hook',
    'https://[::ffff:192.168.1.1]/hook',
  ])('bloqueia IPv4 privado representado como IPv6: %s', async url => {
    await expect(validateOutboundHttpsUrl(url)).rejects.toThrow()
  })
})

// O undici chama o lookup do dispatcher com { all: true }. Devolver um
// endereço solto nesse caso derrubava toda conexão (ERR_INVALID_IP_ADDRESS),
// e por isso webhooks de saída e o download de mídia do kit falhavam.
describe('lookupFixo', () => {
  const { lookupFixo } = require('../../src/utils/outboundUrl')

  test('com { all: true } devolve a lista com o endereço validado', () => {
    const callback = jest.fn()
    lookupFixo('142.250.1.1', 4)('www.exemplo.com', { all: true }, callback)
    expect(callback).toHaveBeenCalledWith(null, [{ address: '142.250.1.1', family: 4 }])
  })

  test('sem all devolve endereço e família, e aceita a forma sem options', () => {
    const callback = jest.fn()
    lookupFixo('142.250.1.1', 4)('www.exemplo.com', {}, callback)
    expect(callback).toHaveBeenCalledWith(null, '142.250.1.1', 4)
    const semOptions = jest.fn()
    lookupFixo('2001:db8::1', 6)('www.exemplo.com', semOptions)
    expect(semOptions).toHaveBeenCalledWith(null, '2001:db8::1', 6)
  })
})
