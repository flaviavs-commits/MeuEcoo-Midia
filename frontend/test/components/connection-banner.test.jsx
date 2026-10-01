import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConnectionBanner, useSession } from '../../src/components/layout/connection-banner.jsx'
import * as api from '../../src/lib/api.js'

function Harness() {
  const { user, status, generation, retry } = useSession()
  return <>
    <ConnectionBanner status={status} onRetry={retry} />
    <p>usuário: {user?.email || 'nenhum'}</p>
    <p>geração: {generation}</p>
  </>
}

describe('useSession + ConnectionBanner', () => {
  afterEach(() => vi.restoreAllMocks())

  it('says once that the server did not answer, and reloads the page when it is back', async () => {
    let up = false
    const apiFetch = vi.spyOn(api, 'apiFetch').mockImplementation(() => (up
      ? Promise.resolve({ email: 'ana@allowed.test' })
      : Promise.reject(new api.ApiError('Não foi possível concluir a operação', 500))))

    render(<Harness />)

    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent('O servidor não respondeu')
    expect(screen.getByText('geração: 0')).toBeInTheDocument()

    up = true
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getByText('usuário: ana@allowed.test')).toBeInTheDocument()
    expect(screen.getByText('geração: 1')).toBeInTheDocument()
    expect(apiFetch).toHaveBeenCalledTimes(2)
  })

  it('retries by itself when the browser is back online', async () => {
    let up = false
    vi.spyOn(api, 'apiFetch').mockImplementation(() => (up
      ? Promise.resolve({ email: 'bia@allowed.test' })
      : Promise.reject(new api.ApiError('Não foi possível conectar ao servidor.', 0))))

    render(<Harness />)
    await screen.findByRole('alert')

    up = true
    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getByText('usuário: bia@allowed.test')).toBeInTheDocument()
  })

  it('stays quiet when the session simply ended (401 goes to the login)', async () => {
    vi.spyOn(api, 'apiFetch').mockRejectedValue(new api.ApiError('Sessão expirada', 401))

    render(<Harness />)

    await waitFor(() => expect(api.apiFetch).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
