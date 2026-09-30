import { render, screen, fireEvent, within } from '@testing-library/react'
import { AppShell, clampSidebarWidth, readSidebarPrefs } from '../../src/components/layout/app-shell.jsx'

const sidebarNav = () => screen.getByRole('navigation', { name: 'Navegação principal' })

// matchMedia simples: largura fixa e ponteiro de toque (sem hover).
function mockViewport(width) {
  window.matchMedia = query => {
    const max = /max-width:\s*(\d+)px/.exec(query)
    const min = /min-width:\s*(\d+)px/.exec(query)
    const sizeOk = (!max || width <= Number(max[1])) && (!min || width >= Number(min[1]))
    const matches = sizeOk && !/hover|pointer|reduced-motion/.test(query)
    return { matches, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }
  }
}

afterEach(() => {
  delete window.matchMedia
  localStorage.removeItem('meu-ecoo:sidebar:v2')
  localStorage.removeItem('meu-ecoo:sidebar-collapsed')
  document.documentElement.dataset.theme = 'light'
})

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

  it('groups the navigation and keeps Início and the assistant on top', () => {
    render(<AppShell page="dashboard" onPageChange={() => {}}>x</AppShell>)
    const nav = sidebarNav()
    const principal = within(nav).getByRole('group', { name: 'Principal' })
    expect(within(principal).getAllByRole('button').map(button => button.textContent)).toEqual(['InícioAtivo', 'Assistente inteligente'])
    expect(within(within(nav).getByRole('group', { name: 'Criar' })).getAllByRole('button')).toHaveLength(2)
    expect(within(nav).getByRole('group', { name: 'Automações' })).toHaveTextContent('Repetidor de posts')
    expect(within(nav).getByRole('group', { name: 'Automações' })).toHaveTextContent('Smartlinks')
    expect(within(nav).getByRole('group', { name: 'Engajamento' })).toHaveTextContent('Inbox')
    expect(within(nav).getByRole('group', { name: 'Conta' })).toHaveTextContent('Atividades')
  })

  it('falls back to Início when a hidden page is requested', () => {
    render(<AppShell page="tokens" onPageChange={() => {}}>conteúdo</AppShell>)
    const currentPage = screen.getByRole('navigation', { name: 'Página atual' })
    expect(currentPage).toHaveTextContent('Início')
    expect(currentPage).not.toHaveTextContent('Meu Ecoo Mídia')
  })

  it('shows the section of the current page in the topbar', () => {
    render(<AppShell page="biblioteca" onPageChange={() => {}}>x</AppShell>)
    expect(screen.getByRole('navigation', { name: 'Página atual' })).toHaveTextContent('ConteúdoBiblioteca')
  })

  it('"Criar post" in the topbar navigates to the scheduler page', () => {
    const onPageChange = vi.fn()
    render(<AppShell page="dashboard" onPageChange={onPageChange}>conteúdo</AppShell>)
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Criar post' }))
    expect(onPageChange).toHaveBeenCalledWith('agendador')
  })

  it('keeps notifications in the topbar and leaves Inbox to the navigation', () => {
    const onPageChange = vi.fn()
    render(<AppShell page="dashboard" onPageChange={onPageChange}>conteúdo</AppShell>)

    expect(screen.queryByRole('button', { name: 'Abrir Inbox' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir notificações' })).toBeInTheDocument()
    fireEvent.click(within(sidebarNav()).getByRole('button', { name: /Inbox/ }))
    expect(onPageChange).toHaveBeenCalledWith('inbox')
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

  it('switches the theme from the account menu', () => {
    document.documentElement.dataset.theme = 'light'
    render(<AppShell page="dashboard" onPageChange={() => {}} user={{ name: 'Tiago' }}>x</AppShell>)
    fireEvent.click(screen.getByRole('button', { name: /Tiago/ }))

    const themeItem = screen.getByRole('menuitemcheckbox', { name: 'Tema escuro' })
    expect(themeItem).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(themeItem)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(screen.getByRole('menuitemcheckbox', { name: 'Tema escuro' })).toHaveAttribute('aria-checked', 'true')
  })

  it('collapses the sidebar to a rail and remembers the choice', () => {
    const { container, unmount } = render(<AppShell page="dashboard" onPageChange={() => {}}>x</AppShell>)
    fireEvent.click(screen.getByRole('button', { name: 'Recolher menu lateral' }))

    expect(container.querySelector('.ds-shell')).toHaveAttribute('data-side', 'rail')
    expect(JSON.parse(localStorage.getItem('meu-ecoo:sidebar:v2'))).toMatchObject({ collapsed: true })
    unmount()

    const again = render(<AppShell page="dashboard" onPageChange={() => {}}>x</AppShell>)
    expect(again.container.querySelector('.ds-shell')).toHaveAttribute('data-side', 'rail')
    expect(screen.getByRole('button', { name: 'Expandir menu lateral' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('resizes the sidebar from the keyboard within 196–272px', () => {
    const { container } = render(<AppShell page="dashboard" onPageChange={() => {}}>x</AppShell>)
    const handle = screen.getByRole('separator', { name: 'Largura do menu lateral' })
    expect(handle).toHaveAttribute('aria-valuenow', '224')

    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(handle).toHaveAttribute('aria-valuenow', '232')
    expect(container.querySelector('.ds-shell').style.getPropertyValue('--ds-side-w')).toBe('232px')

    fireEvent.keyDown(handle, { key: 'End' })
    expect(handle).toHaveAttribute('aria-valuenow', '272')
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(handle).toHaveAttribute('aria-valuenow', '272')
    fireEvent.keyDown(handle, { key: 'Home' })
    expect(handle).toHaveAttribute('aria-valuenow', '196')
    expect(JSON.parse(localStorage.getItem('meu-ecoo:sidebar:v2'))).toMatchObject({ width: 196 })

    fireEvent.doubleClick(handle)
    expect(handle).toHaveAttribute('aria-valuenow', '224')
  })

  it('reads saved sidebar preferences defensively', () => {
    localStorage.setItem('meu-ecoo:sidebar:v2', JSON.stringify({ width: 9999, collapsed: 'yes' }))
    expect(readSidebarPrefs()).toEqual({ width: 272, collapsed: false })
    localStorage.setItem('meu-ecoo:sidebar:v2', '{broken')
    expect(readSidebarPrefs()).toEqual({ width: null, collapsed: false })
    localStorage.removeItem('meu-ecoo:sidebar:v2')
    localStorage.setItem('meu-ecoo:sidebar-collapsed', '1')
    expect(readSidebarPrefs()).toEqual({ width: null, collapsed: true })
    expect(clampSidebarWidth('abc')).toBeNull()
    expect(clampSidebarWidth(100)).toBe(196)
  })

  it('keeps the rest of the app usable when a page crashes', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    function Broken() { throw new Error('boom') }
    const { rerender } = render(<AppShell page="calendario" onPageChange={() => {}}><Broken /></AppShell>)

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível abrir esta página')
    expect(sidebarNav()).toBeInTheDocument()

    rerender(<AppShell page="dashboard" onPageChange={() => {}}><p>Início carregado</p></AppShell>)
    expect(screen.getByText('Início carregado')).toBeInTheDocument()
    error.mockRestore()
  })
})

describe('AppShell on phones', () => {
  beforeEach(() => mockViewport(390))

  it('replaces the sidebar with a bottom navigation', () => {
    render(<AppShell page="dashboard" onPageChange={() => {}}>x</AppShell>)

    expect(screen.queryByRole('complementary', { name: 'Menu lateral' })).not.toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(nav).getAllByRole('button').map(button => button.textContent)).toEqual(['Início', 'Criar', 'Calendário', 'Inbox', 'Mais'])
    expect(within(screen.getByRole('banner')).queryByRole('button', { name: 'Criar post' })).not.toBeInTheDocument()
  })

  it('"Mais" opens a sheet with the other sections, grouped', () => {
    const onPageChange = vi.fn()
    render(<AppShell page="dashboard" onPageChange={onPageChange}>x</AppShell>)
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }))

    const sheet = screen.getByRole('dialog', { name: 'Mais' })
    for (const label of ['Assistente inteligente', 'Baú de Ideias', 'Biblioteca', 'Repetidor de posts', 'Smartlinks', 'Relatórios', 'Contas', 'Segurança', 'Atividades']) {
      expect(within(sheet).getByRole('button', { name: new RegExp(label) })).toBeInTheDocument()
    }
    expect(within(sheet).queryByRole('button', { name: /Calendário/ })).not.toBeInTheDocument()

    fireEvent.click(within(sheet).getByRole('button', { name: /Biblioteca/ }))
    expect(onPageChange).toHaveBeenCalledWith('biblioteca')
    expect(screen.queryByRole('dialog', { name: 'Mais' })).not.toBeInTheDocument()
  })

  it('the composer swaps the bottom navigation for a way back', () => {
    const onPageChange = vi.fn()
    const { rerender, container } = render(<AppShell page="calendario" onPageChange={onPageChange}>x</AppShell>)
    rerender(<AppShell page="agendador" onPageChange={onPageChange}>x</AppShell>)

    expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).not.toBeInTheDocument()
    expect(container.querySelector('.ds-shell')).toHaveAttribute('data-bottomnav', 'off')
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(onPageChange).toHaveBeenCalledWith('calendario')
  })

  it('never squeezes the phone layout with a saved collapsed sidebar', () => {
    localStorage.setItem('meu-ecoo:sidebar:v2', JSON.stringify({ width: 260, collapsed: true }))
    const { container } = render(<AppShell page="dashboard" onPageChange={() => {}}>x</AppShell>)
    const shell = container.querySelector('.ds-shell')
    expect(shell).not.toHaveAttribute('data-side')
    expect(shell.style.getPropertyValue('--ds-side-w')).toBe('')
  })

  it('opens notifications and the account as sheets', () => {
    render(<AppShell page="dashboard" onPageChange={() => {}} user={{ name: 'Tiago' }}>x</AppShell>)

    fireEvent.click(screen.getByRole('button', { name: 'Abrir notificações' }))
    expect(screen.getByRole('dialog', { name: 'Notificações' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))

    fireEvent.click(screen.getByRole('button', { name: /Tiago/ }))
    const account = screen.getByRole('dialog', { name: 'Sua conta' })
    expect(within(account).getByRole('button', { name: 'Sair' })).toBeInTheDocument()
    expect(within(account).getByRole('group', { name: 'Tema da interface' })).toBeInTheDocument()
  })
})
