import { render, screen, fireEvent, within } from '@testing-library/react'
import { AppShell } from '../../src/components/layout/app-shell.jsx'

const sidebarNav = () => screen.getByRole('navigation', { name: 'Navegação principal' })

describe('AppShell', () => {
  it('marks the active page for assistive tech and highlights it', () => {
    render(<AppShell page="calendario" onPageChange={() => {}}>conteúdo</AppShell>)
    const activeButton = within(sidebarNav()).getByRole('button', { name: /Calendário/ })
    expect(activeButton).toHaveAttribute('aria-current', 'page')
    expect(activeButton).toHaveTextContent('Ativo')
  })

  it('calls onPageChange with the clicked nav key', () => {
    const onPageChange = vi.fn()
    render(<AppShell page="dashboard" onPageChange={onPageChange}>conteúdo</AppShell>)
    fireEvent.click(within(sidebarNav()).getByRole('button', { name: /Baú de Ideias/ }))
    expect(onPageChange).toHaveBeenCalledWith('rascunhos')
  })

  it('falls back to Início when a hidden page is requested', () => {
    render(<AppShell page="tokens" onPageChange={() => {}}>conteúdo</AppShell>)
    const currentPage = screen.getByRole('navigation', { name: 'Página atual' })
    expect(currentPage).toHaveTextContent('Início')
    expect(currentPage).not.toHaveTextContent('Meu Ecoo Mídia')
  })

  it('"Criar post" in the topbar navigates to the scheduler page', () => {
    const onPageChange = vi.fn()
    render(<AppShell page="dashboard" onPageChange={onPageChange}>conteúdo</AppShell>)
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Criar post' }))
    expect(onPageChange).toHaveBeenCalledWith('agendador')
  })

  it('keeps the Inbox shortcut and notifications in the topbar', () => {
    const onPageChange = vi.fn()
    render(<AppShell page="dashboard" onPageChange={onPageChange}>conteúdo</AppShell>)

    fireEvent.click(screen.getByRole('button', { name: 'Abrir Inbox' }))
    expect(onPageChange).toHaveBeenCalledWith('inbox')
    expect(screen.getByRole('button', { name: 'Abrir notificações' })).toBeInTheDocument()
  })

  it('renders the user name when provided, falling back to a default label', () => {
    const { rerender } = render(<AppShell page="dashboard" onPageChange={() => {}} user={{ name: 'Tiago' }}>x</AppShell>)
    expect(screen.getByText('Tiago')).toBeInTheDocument()
    rerender(<AppShell page="dashboard" onPageChange={() => {}}>x</AppShell>)
    expect(within(screen.getByRole('banner')).getByText('Conta')).toBeInTheDocument()
  })

  it('locks all product navigation before payment confirmation', () => {
    render(<AppShell page="dashboard" onPageChange={() => {}} user={{ plan: 'basico', planActive: false }}>x</AppShell>)

    expect(screen.getAllByText('Plano')).toHaveLength(13)
    expect(screen.queryByRole('button', { name: 'Tokens' })).not.toBeInTheDocument()
    expect(screen.queryByText('Ativo')).not.toBeInTheDocument()
  })

  it('keeps the team feature hidden from the application navigation', () => {
    render(<AppShell page="dashboard" onPageChange={() => {}}>x</AppShell>)

    expect(screen.queryByRole('button', { name: 'Equipe' })).not.toBeInTheDocument()
  })

  it('supports desktop shortcuts for creating a post and opening help', () => {
    const onPageChange = vi.fn()
    render(<AppShell page="dashboard" onPageChange={onPageChange}>x</AppShell>)

    fireEvent.keyDown(window, { key: 'c' })
    expect(onPageChange).toHaveBeenCalledWith('agendador')

    fireEvent.keyDown(window, { key: '?' })
    expect(screen.getByRole('dialog', { name: 'Atalhos de teclado' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Atalhos de teclado' })).not.toBeInTheDocument()
  })

  it('ignores the single-key shortcuts when a modifier is held', () => {
    const onPageChange = vi.fn()
    render(<AppShell page="dashboard" onPageChange={onPageChange}>x</AppShell>)

    fireEvent.keyDown(window, { key: 'c', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'd', metaKey: true })
    expect(onPageChange).not.toHaveBeenCalled()
  })

  it('closes the profile menu with Escape and returns focus to its trigger', () => {
    render(<AppShell page="dashboard" onPageChange={() => {}} user={{ name: 'Tiago' }}>x</AppShell>)
    const trigger = screen.getByRole('button', { name: /Tiago/ })

    fireEvent.click(trigger)
    expect(screen.getByRole('menu', { name: 'Conta' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'Conta' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
