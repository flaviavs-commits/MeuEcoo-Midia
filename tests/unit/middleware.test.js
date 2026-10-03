// Testes unitários — requireAdmin (sem I/O)
const requireAdmin = require('../../src/middleware/requireAdmin')

function mockRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.redirect = jest.fn().mockReturnValue(res)
  return res
}

describe('requireAdmin', () => {
  test('deixa passar se role = admin', () => {
    const req = { user: { role: 'admin' }, originalUrl: '/api/admin/users' }
    const res = mockRes()
    const next = jest.fn()
    requireAdmin(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  test('bloqueia role legado super_admin', () => {
    const req = { user: { role: 'super_admin' }, originalUrl: '/api/admin/users' }
    const res = mockRes()
    const next = jest.fn()
    requireAdmin(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  test('retorna 403 para role = user em rota /api/', () => {
    const req = { user: { role: 'user' }, originalUrl: '/api/admin/users' }
    const res = mockRes()
    const next = jest.fn()
    requireAdmin(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ erro: expect.any(String) }))
  })

  test('redireciona para rota não-api', () => {
    const req = { user: { role: 'user' }, originalUrl: '/painel/admin' }
    const res = mockRes()
    const next = jest.fn()
    requireAdmin(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.redirect).toHaveBeenCalled()
  })

  test('sem req.user retorna 403 em rota /api/', () => {
    const req = { originalUrl: '/api/admin/users' }
    const res = mockRes()
    const next = jest.fn()
    requireAdmin(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })
})

