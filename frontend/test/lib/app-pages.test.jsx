import { fireEvent, render, screen } from '@testing-library/react'
import { NOT_FOUND_PAGE, pageFromPath } from '../../src/lib/app-pages.js'
import { NotFoundPage } from '../../src/pages/not-found-page.jsx'
import { PlanGate } from '../../src/components/ui/plan-gate.jsx'

describe('rotas do app', () => {
  it('abre a página do endereço e o Início para /app.html e /app/', () => {
    expect(pageFromPath('/app/calendario')).toBe('calendario')
    expect(pageFromPath('/app/perfil/qualquer-coisa')).toBe('perfil')
    expect(pageFromPath('/app.html')).toBe('dashboard')
    expect(pageFromPath('/app/')).toBe('dashboard')
  })

  it('um endereço fora da lista abre a página "não encontrada", não o Início calado', () => {
    expect(pageFromPath('/app/inexistente')).toBe(NOT_FOUND_PAGE)
    expect(pageFromPath('/app/tokens')).toBe(NOT_FOUND_PAGE)
  })

  it('Equipe só abre com a feature ligada', () => {
    expect(pageFromPath('/app/equipe')).toBe(NOT_FOUND_PAGE)
    expect(pageFromPath('/app/equipe', { teamEnabled: true })).toBe('equipe')
  })

  it('a página "não encontrada" oferece o caminho de volta', () => {
    const onNavigate = vi.fn()
    render(<NotFoundPage onNavigate={onNavigate} />)

    expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ir para o Início' }))
    expect(onNavigate).toHaveBeenCalledWith('dashboard')
  })

  it('o bloqueio de plano leva à aba de planos do Perfil sem recarregar a página', () => {
    const onNavigate = vi.fn()
    window.history.replaceState(null, '', '/app/biblioteca')
    render(<PlanGate currentPlan="basico" moduleName="biblioteca" onNavigate={onNavigate} />)

    const link = screen.getByRole('link', { name: /Conhecer os planos/ })
    expect(link).toHaveAttribute('href', '/app/perfil#plano')
    fireEvent.click(link)
    expect(onNavigate).toHaveBeenCalledWith('perfil')
    expect(window.location.pathname + window.location.hash).toBe('/app/perfil#plano')
    window.history.replaceState(null, '', '/')
  })
})
