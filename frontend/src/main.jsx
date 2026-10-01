import './styles/layers.css'
import { lazy, StrictMode, Suspense, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LandingPage } from './pages/landing-page.jsx'
import { ConnectionBanner, ServerStatusContext, useSession } from './components/layout/connection-banner.jsx'
import { AppShell } from './components/layout/app-shell.jsx'
import { DashboardPage } from './pages/dashboard-page.jsx'
import { ModulePage } from './pages/module-page.jsx'
import { PlanGate } from './components/ui/plan-gate.jsx'
import { hasActivePlanModule } from './lib/plans.js'
import { LoginPage, ResetPasswordPage, VerifyTwoFactorPage } from './pages/auth-page.jsx'
import { applyTheme, getStoredTheme } from './components/ui/theme-selector.jsx'
import { TEAM_APPROVAL_UI_ENABLED } from './lib/feature-flags.js'
import { APP_PAGES, NOT_FOUND_PAGE, pageFromPath } from './lib/app-pages.js'
import { NotFoundPage } from './pages/not-found-page.jsx'
import { PageErrorBoundary } from './components/ui/page-error-boundary.jsx'
import { PageSkeleton } from './components/ui/loading-state.jsx'
import './styles/tokens.css'
import './styles/app.css'
import './styles/modules.css'
import './styles/dashboard-theme.css'
import './styles/global-ui.css'
import './styles/tokens-page.css'
import './styles/tailwind.css'
import './styles/landing.css'
import './styles/scheduler-theme.css'
import './styles/scheduler-composer.css'
import './styles/theme.css'
import './styles/light-theme.css'
import './styles/semantic-theme.css'
import './styles/responsive.css'
import './styles/mobile-first.css'
import './styles/layout-spacing.css'
import './styles/soft-shadow.css'
import './styles/ui-system.css'
import './styles/readability.css'
import './styles/ds/tokens.css'
import './styles/ds/components.css'
import './styles/ds/pages/inicio.css'
import './styles/ds/pages/bau.css'
import './styles/ds/pages/calendario.css'
import './styles/ds/pages/meu-post.css'
import './styles/ds/pages/relatorios.css'
import './styles/ds/pages/inbox.css'
import './styles/ds/pages/contas.css'
import './styles/ds/pages/biblioteca.css'
import './styles/ds/pages/repetidor.css'
import './styles/ds/pages/smartlinks.css'
import './styles/ds/pages/assistente.css'
import './styles/ds/pages/perfil.css'
import './styles/ds/pages/seguranca-atividades.css'
import './styles/ds/pages/equipe.css'
import './styles/ds/pages/admin.css'
import './styles/ds/pages/auth.css'
import './styles/ds/pages/compartilhado.css'

// Só administradores abrem /admin.html: a tela sai da entrada e vem sob demanda.
const AdminPage = lazy(() => import('./pages/admin-page.jsx').then(module => ({ default: module.AdminPage })))

applyTheme(getStoredTheme())

const pageFromLocation = () => pageFromPath(window.location.pathname, { teamEnabled: TEAM_APPROVAL_UI_ENABLED })

function App() {
  const [page, setPage] = useState(() => pageFromLocation())
  const { user, updateUser, status: serverStatus, generation, retry } = useSession()
  useEffect(() => {
    const onPopState = () => setPage(pageFromLocation())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  // { replace: true } troca o endereço sem empilhar histórico (ex.: o tutorial andando pelas páginas).
  const navigate = (nextPage, { replace = false } = {}) => {
    if (nextPage === 'equipe' && !TEAM_APPROVAL_UI_ENABLED) return
    if (!APP_PAGES.has(nextPage) || nextPage === page) return
    window.history[replace ? 'replaceState' : 'pushState']({}, '', `/app/${nextPage}`)
    setPage(nextPage)
  }
  // When the server comes back, the page remounts (key) and loads its data again.
  return <ServerStatusContext.Provider value={serverStatus}><AppShell page={page} onPageChange={navigate} user={user} contentKey={generation}>
    <ConnectionBanner status={serverStatus} onRetry={retry} />
    {page === NOT_FOUND_PAGE
      ? <NotFoundPage onNavigate={navigate} />
      : page === 'dashboard'
        ? user && !hasActivePlanModule(user.plan, 'dashboard', user.planActive, user.planUnrestricted)
          ? <PlanGate currentPlan={user.plan} moduleName="dashboard" planActive={user.planActive} onNavigate={navigate} />
          : <DashboardPage onNavigate={navigate} key={generation} />
        : <ModulePage type={page} onNavigate={navigate} user={user} onUserChange={updateUser} key={generation} />}
  </AppShell></ServerStatusContext.Provider>
}

const pathname = window.location.pathname
const page = pathname === '/login.html' ? <LoginPage />
  : pathname === '/reset-password.html' ? <ResetPasswordPage />
    : pathname === '/verify-2fa.html' ? <VerifyTwoFactorPage />
    : pathname === '/admin.html' ? <Suspense fallback={<PageSkeleton label="Carregando a administração..." />}><AdminPage /></Suspense>
    : pathname === '/app.html' || pathname.startsWith('/app/') ? <App /> : <LandingPage />

// Nenhuma tela fica em branco por um erro de renderização: o app inteiro tem um limite de erro
// (a área de conteúdo do app tem outro, que mantém o menu de pé).
createRoot(document.getElementById('root')).render(<StrictMode><PageErrorBoundary>{page}</PageErrorBoundary></StrictMode>)
