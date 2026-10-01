import { afterEach, describe, expect, it, vi } from 'vitest'

const apiFetchMock = vi.hoisted(() => vi.fn())
vi.mock('../../src/lib/api.js', () => ({ apiFetch: apiFetchMock }))

import { uploadToStorage } from '../../src/lib/upload.js'

function storageAnswer(body, ok = true) {
  return { ok, status: ok ? 200 : 403, json: vi.fn().mockResolvedValue(body) }
}

describe('uploadToStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    apiFetchMock.mockReset()
  })

  it('assina o envio, manda o arquivo direto ao armazenamento e devolve a URL do backend', async () => {
    apiFetchMock.mockResolvedValue({ uploadUrl: 'https://storage.test/put', mediaUrl: 'https://app.test/media/a.png' })
    const fetchMock = vi.fn().mockResolvedValue(storageAnswer({ url: 'https://blob.test/a.png' }))
    vi.stubGlobal('fetch', fetchMock)
    const file = new File(['x'], 'a.png', { type: 'image/png' })

    await expect(uploadToStorage(file, { filename: 'a.png', mimetype: 'image/png' })).resolves.toBe('https://app.test/media/a.png')
    expect(apiFetchMock).toHaveBeenCalledWith('/api/posts/upload-url', { method: 'POST', body: JSON.stringify({ filename: 'a.png', mimetype: 'image/png' }) })
    expect(fetchMock).toHaveBeenCalledWith('https://storage.test/put', { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: file })
  })

  it('usa a URL que o armazenamento responde quando o backend não manda uma', async () => {
    apiFetchMock.mockResolvedValue({ uploadUrl: 'https://storage.test/put' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(storageAnswer({ url: 'https://blob.test/a.png' })))
    await expect(uploadToStorage('x', { filename: 'a.png', mimetype: 'image/png' })).resolves.toBe('https://blob.test/a.png')
  })

  it('explica em português a queda de conexão, a recusa e a falta de endereço', async () => {
    apiFetchMock.mockResolvedValue({ uploadUrl: 'https://storage.test/put' })

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(uploadToStorage('x', { filename: 'a.png', mimetype: 'image/png', label: 'a logo' }))
      .rejects.toThrow('Não foi possível enviar a logo. Verifique a conexão e tente de novo.')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(storageAnswer(null, false)))
    await expect(uploadToStorage('x', { filename: 'a.png', mimetype: 'image/png' }))
      .rejects.toThrow('O armazenamento recusou a.png. Tente de novo.')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockRejectedValue(new SyntaxError('bad json')) }))
    await expect(uploadToStorage('x', { filename: 'a.png', mimetype: 'image/png' }))
      .rejects.toThrow('O envio de a.png terminou sem o endereço do arquivo. Tente de novo.')
  })

  it('não envia nada quando o backend recusa a assinatura', async () => {
    const refusal = Object.assign(new Error('Plano sem espaço.'), { status: 403 })
    apiFetchMock.mockRejectedValue(refusal)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(uploadToStorage('x', { filename: 'a.png', mimetype: 'image/png' })).rejects.toBe(refusal)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
