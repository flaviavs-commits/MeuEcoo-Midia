import './styles/layers.css'
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { LandingPage } from './pages/landing-page.jsx'
import { useEffect, useState } from 'react'
import { AppShell } from './components/layout/app-shell.jsx'
import { DashboardPage } from './pages/dashboard-page.jsx'
import { ModulePage } from './pages/module-page.jsx'
import { PlanGate } from './components/ui/plan-gate.jsx'
import { hasActivePlanModule } from './lib/plans.js'
import { LoginPage, ResetPasswordPage, VerifyTwoFactorPage } from './pages/auth-page.jsx'
import { apiFetch, rememberSession } from './lib/api.js'
import { applyTheme, getStoredTheme } from './components/ui/theme-selector.jsx'
import { TEAM_APPROVAL_UI_ENABLED } from './lib/feature-flags.js'
import { APP_PAGES } from './lib/app-pages.js'
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

function pageFromLocation(pathname = window.location.pathname) {
  const segment = pathname.startsWith('/app/') ? pathname.slice('/app/'.length).split('/')[0] : ''
  if (segment === 'equipe' && !TEAM_APPROVAL_UI_ENABLED) return 'dashboard'
  return APP_PAGES.has(segment) ? segment : 'dashboard'
}

function App() {
  const [page, setPage] = useState(() => pageFromLocation())
  const [user, setUser] = useState(null)
  const updateUser = patch => setUser(current => ({ ...(current || {}), ...patch }))
  useEffect(() => {
    if (window.location.pathname === '/app/automacoes') window.history.replaceState({}, '', '/app/dashboard')
    if (window.location.pathname === '/app/equipe' && !TEAM_APPROVAL_UI_ENABLED) window.history.replaceState({}, '', '/app/dashboard')
  }, [])
  useEffect(() => {
    let active = true
    apiFetch('/api/me').then(currentUser => {
      rememberSession()
      if (active) setUser(currentUser)
    }).catch(() => {})
    return () => { active = false }
  }, [])
  useEffect(() => {
    const onPopState = () => setPage(pageFromLocation())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  const navigate = nextPage => {
    if (nextPage === 'equipe' && !TEAM_APPROVAL_UI_ENABLED) return
    if (!APP_PAGES.has(nextPage) || nextPage === page) return
    window.history.pushState({}, '', `/app/${nextPage}`)
    setPage(nextPage)
  }
  return <AppShell page={page} onPageChange={navigate} user={user}>
    {page === 'dashboard'
      ? user && !hasActivePlanModule(user.plan, 'dashboard', user.planActive, user.planUnrestricted)
        ? <PlanGate currentPlan={user.plan} moduleName="dashboard" planActive={user.planActive} />
        : <DashboardPage onNavigate={navigate} />
      : <ModulePage type={page} onNavigate={navigate} user={user} onUserChange={updateUser} />}
  </AppShell>
}

const pathname = window.location.pathname
const page = pathname === '/login.html' ? <LoginPage />
  : pathname === '/reset-password.html' ? <ResetPasswordPage />
    : pathname === '/verify-2fa.html' ? <VerifyTwoFactorPage />
    : pathname === '/admin.html' ? <Suspense fallback={null}><AdminPage /></Suspense>
    : pathname === '/app.html' || pathname.startsWith('/app/') ? <App /> : <LandingPage />

createRoot(document.getElementById('root')).render(<StrictMode>{page}</StrictMode>)
