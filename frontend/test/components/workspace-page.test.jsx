import { render, screen, within } from '@testing-library/react'
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

    const picker = await screen.findByLabelText('Publicação para revisão')
    const options = within(picker).getAllByRole('option').map(option => option.textContent)
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
})
