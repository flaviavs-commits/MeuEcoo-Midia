import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkspacePage } from '../../src/pages/workspace-page.jsx'
import { ToastProvider } from '../../src/components/ui/toast.jsx'
import * as api from '../../src/lib/api.js'

function mockApi(role) {
  return vi.spyOn(api, 'apiFetch').mockImplementation(path => {
    if (path === '/api/workspaces') return Promise.resolve({ workspaces: [{ id: 3, name: 'Loja Aurora', role, branding: {} }] })
    if (path === '/api/posts') return Promise.resolve({ posts: [
      { id: 10, text: 'Post agendado', status: 'scheduled' },
      { id: 11, text: 'Post publicado', status: 'published' },
    ] })
    if (path === '/api/workspaces/3/members') return Promise.resolve({ members: [{ id: 1, email: 'dona@allowed.test', fullName: 'Dona', role: 'owner' }] })
    if (path === '/api/workspaces/3/approvals') return Promise.resolve({ approvals: [{ id: 7, postId: 10, status: 'pending', createdAt: '2026-09-20T10:00:00Z', text: 'Post agendado' }] })
    return Promise.reject(new Error(`rota não mockada: ${path}`))
  })
}

describe('WorkspacePage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('só lista posts que o servidor aceita em revisão', async () => {
    mockApi('owner')
    render(<ToastProvider><WorkspacePage /></ToastProvider>)

    const picker = await screen.findByRole('combobox', { name: 'Publicação para revisão' })
    await waitFor(() => expect(picker).toBeEnabled())
    fireEvent.click(picker)
    const options = within(screen.getByRole('listbox')).getAllByRole('option').map(option => option.textContent)
    expect(options).toContain('#10 · Post agendado')
    expect(options).not.toContain('#11 · Post publicado')
    expect(await screen.findByRole('button', { name: 'Aprovar' })).toBeInTheDocument()
  })

  it('não mostra aprovar e rejeitar para quem só edita', async () => {
    mockApi('editor')
    render(<ToastProvider><WorkspacePage /></ToastProvider>)

    expect(await screen.findByText('Post #10')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument()
    expect(screen.getByText('Só proprietários, administradores e aprovadores podem aprovar ou rejeitar.')).toBeInTheDocument()
  })

  it('confirma o colaborador adicionado mesmo quando só a lista falha ao recarregar', async () => {
    const base = mockApi('owner').getMockImplementation()
    let memberGets = 0
    const apiFetch = vi.spyOn(api, 'apiFetch').mockImplementation((path, options) => {
      if (path === '/api/workspaces/3/members' && options?.method === 'POST') return Promise.resolve({ member: { id: 2 } })
      if (path === '/api/workspaces/3/members' && ++memberGets > 1) return Promise.reject(new api.ApiError('Falha temporária.', 503))
      return base(path, options)
    })
    render(<ToastProvider><WorkspacePage /></ToastProvider>)

    await userEvent.click(await screen.findByRole('tab', { name: 'Pessoas' }))
    const email = await screen.findByLabelText('Adicionar colaborador')
    await userEvent.type(email, 'novo@allowed.test')
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }))

    expect(await screen.findByText('Colaborador adicionado ao espaço.')).toBeInTheDocument()
    expect(await screen.findByText(/O colaborador foi adicionado, mas a lista não atualizou/)).toBeInTheDocument()
    expect(email).toHaveValue('')
    expect(apiFetch).toHaveBeenCalledWith('/api/workspaces/3/members', { method: 'POST', body: JSON.stringify({ email: 'novo@allowed.test', role: 'editor' }) })
  })

  it('não mostra erro técnico quando a lista de espaços vem num formato inesperado', async () => {
    vi.spyOn(api, 'apiFetch').mockImplementation(path => {
      if (path === '/api/workspaces') return Promise.reject(new TypeError("Cannot read properties of null (reading 'workspaces')"))
      if (path === '/api/posts') return Promise.resolve({ posts: [] })
      return Promise.reject(new Error(`rota não mockada: ${path}`))
    })
    render(<ToastProvider><WorkspacePage /></ToastProvider>)

    expect(await screen.findByText('Não foi possível carregar seus espaços.')).toBeInTheDocument()
    expect(screen.queryByText(/Cannot read properties/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })
})
