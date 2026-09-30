import { useEffect, useRef, useState } from 'react'
import { AiAssistantWidget } from '../ai/ai-assistant-widget.jsx'
import { apiFetch, logout } from '../../lib/api.js'
import { ToastProvider, useToast } from '../ui/toast.jsx'
import { ThemeSelector } from '../ui/theme-selector.jsx'
import { AppTutorial } from '../ui/app-tutorial.jsx'
import { markTutorialCompleted, markTutorialSeen, TUTORIAL_OPEN_EVENT } from '../../lib/tutorial.js'
import { getPlan, hasActivePlanModule } from '../../lib/plans.js'
import { CopyrightNotice } from '../ui/copyright-notice.jsx'
import { TEAM_APPROVAL_UI_ENABLED } from '../../lib/feature-flags.js'
import { Icon } from '../ui/icon.jsx'

const NAV_GROUPS = [
  ['Principal', [['dashboard', 'Início', 'home'], ['agendador', 'Meu Post', 'compose'], ['calendario', 'Calendário', 'calendar']]],
  ['Conteúdo', [['rascunhos', 'Baú de Ideias', 'chest'], ['biblioteca', 'Biblioteca', 'image'], ['filas', 'Repetidor de posts', 'repeat'], ['smartlinks', 'Smartlinks', 'link'], ['ai', 'Assistente inteligente', 'sparkle']]],
  ['Acompanhamento', [['inbox', 'Inbox', 'inbox'], ['analytics', 'Relatórios', 'chart']]],
  ['Conta', [['integracoes', 'Contas', 'plug'], ['seguranca', 'Segurança', 'shield'], ['atividade', 'Atividades', 'activity'], ['equipe', 'Equipe', 'users']]],
].map(([label, items]) => [label, items.filter(([key]) => key !== 'equipe' || TEAM_APPROVAL_UI_ENABLED)])

const navigation = NAV_GROUPS.flatMap(([, items]) => items)

const BOTTOM_NAV = [
  ['dashboard', 'Início', 'home'],
  ['calendario', 'Calendário', 'calendar'],
  ['agendador', 'Criar post', 'plus'],
  ['inbox', 'Inbox', 'inbox'],
]

const SIDEBAR_COLLAPSED_KEY = 'meu-ecoo:sidebar-collapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function userIsAdmin(user) {
  return user?.role === 'admin'
}

function userInitials(user) {
  const label = user?.fullName || user?.name || user?.email || 'C'
  return label.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase()
}

function notificationKind(item) {
  const message = String(item?.message || '').toLowerCase()
  if (item?.type === 'err') return 'error'
  if (item?.type === 'warn') return 'warning'
  if (/falhou|falha|não foi possível|não conseguiu|erro/.test(message)) return 'error'
  if (/aguardando|processando|pendente|enviado para/.test(message)) return 'pending'
  if (/parcial|atenção/.test(message)) return 'warning'
  return item?.type === 'ok' ? 'success' : 'info'
}

const NOTIFICATION_KIND_LABELS = { success: 'Sucesso', error: 'Erro', pending: 'Em processamento', warning: 'Atenção', info: 'Atualização' }
const NOTIFICATION_KIND_ICONS = { success: 'checkCircle', error: 'alertCircle', pending: 'processing', warning: 'halfCircle', info: 'info', comment: 'comment' }
const NOTIFICATION_POLL_INTERVAL_MS = 60 * 1000

function isPublicationNotification(item) {
  return /^post #\d+\s+(?:publicado com sucesso|publicado parcialmente|falhou ao publicar)/.test(String(item?.message || '').toLowerCase())
}

function isCommentNotification(item) {
  return /^novo comentário de @/i.test(String(item?.message || ''))
}

function isBellNotification(item) {
  return isPublicationNotification(item) || isCommentNotification(item)
}

function mergeNotifications(current, incoming) {
  const byId = new Map()
  ;[...incoming, ...current].forEach(item => byId.set(item.id, item))
  return [...byId.values()]
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
    .slice(0, 5)
}

function notificationPreferenceEnabled(item, user) {
  const preferences = user?.notificationPreferences || {}
  if (isCommentNotification(item)) return preferences.comments !== false
  const kind = notificationKind(item)
  if (kind === 'success') return preferences.published !== false
  if (kind === 'warning' || kind === 'error') return preferences.failures !== false
  return true
}

// Closes a popover on outside pointer down or Escape, returning focus to its trigger.
function useDismiss(open, containerRef, triggerRef, onClose) {
  useEffect(() => {
    if (!open) return undefined
    const handlePointer = event => {
      if (containerRef.current && !containerRef.current.contains(event.target)) onClose()
    }
    const handleKey = event => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, containerRef, triggerRef, onClose])
}

function AppSidebar({ page, onNavigate, user, collapsed, sidebarRef }) {
  return <aside className="ds-side" id="app-sidebar" data-ds-root aria-label="Menu lateral" ref={sidebarRef}>
    <div className="ds-side__inner">
      <a className="ds-side__brand" href="/app/dashboard" aria-label="Meu Ecoo Mídia, ir para o Início" onClick={event => { event.preventDefault(); onNavigate('dashboard') }}>
        <img className="ds-side__logo" src="/logo.png" alt="" width="108" height="45" />
        <img className="ds-side__mark" src="/logo-icon.png" alt="" width="30" height="30" />
      </a>

      <nav className="ds-nav" aria-label="Navegação principal">
        {NAV_GROUPS.map(([groupLabel, items]) => (
          <div className="ds-nav__group" role="group" aria-label={groupLabel} key={groupLabel}>
            <p className="ds-nav__label" aria-hidden="true">{groupLabel}</p>
            <ul>
              {items.map(([key, label, icon]) => {
                const active = page === key
                const locked = Boolean(user) && !hasActivePlanModule(user.plan, key, user.planActive, user.planUnrestricted)
                return <li key={key}>
                  <button
                    type="button"
                    className="ds-nav__item"
                    data-tutorial-target={key}
                    data-locked={locked ? 'true' : undefined}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? label : undefined}
                    onClick={() => onNavigate(key)}
                  >
                    <Icon name={icon} />
                    <span className="ds-nav__text">{label}</span>
                    {active && !locked && <span className="ds-sr-only">Ativo</span>}
                    {locked && <span className="ds-nav__lock"><Icon name="lock" size={14} /><span className="ds-nav__lock-text">Plano</span></span>}
                  </button>
                </li>
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="ds-side__phone">
        <p className="ds-nav__label">Sua conta</p>
        <button type="button" className="ds-nav__item" aria-current={page === 'perfil' ? 'page' : undefined} onClick={() => onNavigate('perfil')}>
          <Icon name="user" /><span className="ds-nav__text">Perfil</span>
        </button>
        <div className="ds-side__theme">
          <span className="ds-nav__label">Tema</span>
          <ThemeSelector variant="segmented" />
        </div>
        <button type="button" className="ds-nav__item" onClick={logout}>
          <Icon name="logout" /><span className="ds-nav__text">Sair</span>
        </button>
        <p className="ds-side__legal"><a href="/privacy-policy">Política de Privacidade</a> · <a href="/terms-of-service">Termos de Serviço</a></p>
      </div>

      <div className="ds-side__foot">
        {userIsAdmin(user) && <a className="ds-nav__item" href="/admin.html" title="Administração" data-tutorial-target="administracao">
          <Icon name="settings" /><span className="ds-nav__text">Administração</span>
        </a>}
      </div>
    </div>
  </aside>
}

function MobileBottomNav({ page, onNavigate, onOpenMenu, menuOpen }) {
  return <nav className="ds-bottomnav" data-ds-root aria-label="Ações principais">
    {BOTTOM_NAV.map(([key, label, icon]) => {
      const create = key === 'agendador'
      return <button
        key={key}
        type="button"
        className={`ds-bottomnav__item${create ? ' ds-bottomnav__item--create' : ''}`}
        data-tutorial-target={key}
        aria-current={page === key ? 'page' : undefined}
        onClick={() => onNavigate(key)}
      >
        {create ? <span className="ds-bottomnav__plus"><Icon name="plus" /></span> : <Icon name={icon} />}
        <span>{label}</span>
      </button>
    })}
    <button type="button" className="ds-bottomnav__item" aria-expanded={menuOpen} aria-controls="app-sidebar" onClick={onOpenMenu}>
      <Icon name="menu" /><span>Mais</span>
    </button>
  </nav>
}

function NotificationsPopover({ loading, error, notifications, onSeeAll }) {
  let body
  if (loading) {
    body = <div className="ds-notif__state" aria-live="polite"><span className="ds-spinner" aria-hidden="true" />Carregando atualizações...</div>
  } else if (error) {
    body = <div className="ds-notif__state ds-notif__state--error" role="alert"><Icon name="alertCircle" />Não foi possível carregar as notificações agora.</div>
  } else if (!notifications.length) {
    body = <div className="ds-notif__state"><Icon name="bell" />Nenhuma atualização recente.</div>
  } else {
    body = <ul className="ds-notif__list">
      {notifications.map(item => {
        const comment = isCommentNotification(item)
        const kind = comment ? 'comment' : notificationKind(item)
        return <li className="ds-notif__item" data-kind={kind} key={item.id}>
          <span className="ds-notif__mark" aria-hidden="true"><Icon name={NOTIFICATION_KIND_ICONS[kind] || 'info'} /></span>
          <div className="ds-notif__body">
            <p className="ds-notif__kind">{comment ? 'Novo comentário' : NOTIFICATION_KIND_LABELS[kind]}</p>
            <p className="ds-notif__msg">{item.message}</p>
            <p className="ds-notif__time">{item.timestamp ? new Date(item.timestamp).toLocaleString('pt-BR') : 'Agora'}</p>
          </div>
        </li>
      })}
    </ul>
  }
  return <div className="ds-popover ds-notif" role="dialog" aria-label="Notificações recentes">
    <div className="ds-popover__head"><p className="ds-popover__title">Notificações</p><span className="ds-meta">Recentes</span></div>
    {body}
    <div className="ds-popover__foot">
      <button type="button" className="ds-menu__item ds-notif__all" onClick={onSeeAll}>Ver histórico completo<Icon name="arrow" /></button>
    </div>
  </div>
}

function ProfileMenu({ user, onNavigate, onOpenShortcutHelp, onClose }) {
  const menuRef = useRef(null)
  const hasPlan = Boolean(user?.plan)

  useEffect(() => {
    menuRef.current?.querySelector('[role="menuitem"]')?.focus()
  }, [])

  function handleKeyDown(event) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const items = [...menuRef.current.querySelectorAll('[role="menuitem"]')]
    const index = items.indexOf(document.activeElement)
    let next = 0
    if (event.key === 'ArrowDown') next = (index + 1) % items.length
    if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length
    if (event.key === 'End') next = items.length - 1
    items[next]?.focus()
  }

  const go = key => () => { onClose(); onNavigate(key) }

  return <div className="ds-popover ds-profilemenu" role="menu" aria-label="Conta" ref={menuRef} onKeyDown={handleKeyDown}>
    <div className="ds-profilemenu__id">
      <span className="ds-avatar ds-avatar--40" aria-hidden="true">{user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : userInitials(user)}</span>
      <div>
        <p className="ds-profilemenu__name">{user?.fullName || user?.name || 'Minha conta'}</p>
        {user?.email && <p className="ds-profilemenu__mail">{user.email}</p>}
      </div>
      {hasPlan && (user.planActive === false
        ? <span className="ds-badge" data-tone="warning">Pagamento pendente</span>
        : <span className="ds-badge" data-tone="gold">Plano {getPlan(user.plan).name}</span>)}
    </div>
    <div className="ds-menu__sep" role="separator" />
    <button type="button" role="menuitem" className="ds-menu__item" onClick={go('perfil')}><Icon name="user" />Perfil</button>
    <button type="button" role="menuitem" className="ds-menu__item" onClick={go('seguranca')}><Icon name="shield" />Segurança</button>
    <button type="button" role="menuitem" className="ds-menu__item" onClick={go('atividade')}><Icon name="activity" />Atividades</button>
    <button type="button" role="menuitem" className="ds-menu__item" onClick={() => { onClose(); onOpenShortcutHelp() }}>
      <Icon name="keyboard" />Atalhos de teclado<span className="ds-menu__trail"><kbd className="ds-kbd">?</kbd></span>
    </button>
    <div className="ds-menu__sep" role="separator" />
    <button type="button" role="menuitem" className="ds-menu__item ds-menu__item--danger" onClick={logout}><Icon name="logout" />Sair</button>
  </div>
}

function AppTopbar({ currentLabel, user, drawerOpen, onToggleDrawer, collapsed, onToggleCollapsed, onCreatePost, onNavigate, onOpenShortcutHelp }) {
  const [openPopover, setOpenPopover] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [notificationsError, setNotificationsError] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const notificationCursor = useRef(0)
  const notificationPolling = useRef(false)
  const notificationsInitialized = useRef(false)
  const notificationsAnchor = useRef(null)
  const notificationsTrigger = useRef(null)
  const profileAnchor = useRef(null)
  const profileTrigger = useRef(null)
  const notify = useToast()
  const notificationsOpen = openPopover === 'notifications'
  const profileOpen = openPopover === 'profile'
  const closePopover = useRef(() => setOpenPopover(null)).current

  useDismiss(notificationsOpen, notificationsAnchor, notificationsTrigger, closePopover)
  useDismiss(profileOpen, profileAnchor, profileTrigger, closePopover)

  useEffect(() => {
    let active = true
    notificationsInitialized.current = false

    async function primeNotifications() {
      if (!active || notificationPolling.current) return
      notificationPolling.current = true
      let primed = false
      try {
        const result = await apiFetch('/api/logs?limit=30')
        const logs = result.logs || []
        if (!active) return
        notificationCursor.current = Math.max(0, ...logs.map(item => Number(item.id) || 0))
        setNotifications(logs.filter(isBellNotification).slice(0, 5))
        primed = true
      } catch {
        // A falha no polling não deve bloquear a navegação do painel.
      } finally {
        if (active) notificationsInitialized.current = primed
        notificationPolling.current = false
      }
    }

    async function pollNotifications() {
      if (!active || !notificationsInitialized.current || notificationPolling.current) return
      notificationPolling.current = true
      try {
        // A consulta também funciona fora do Inbox e faz o backend descobrir
        // comentários novos para transformá-los em notificações do sininho.
        await apiFetch('/api/posts/inbox/unread').catch(() => {})
        const result = await apiFetch(`/api/logs/since/${notificationCursor.current}`)
        const logs = result.logs || []
        if (logs.length) notificationCursor.current = Math.max(notificationCursor.current, ...logs.map(item => Number(item.id) || 0))
        const bellLogs = logs.filter(isBellNotification)
        if (!active || !bellLogs.length) return

        setNotifications(current => mergeNotifications(current, bellLogs))
        const visibleNotifications = bellLogs.filter(item => notificationPreferenceEnabled(item, user))
        if (!visibleNotifications.length) return
        setUnreadNotifications(current => current + visibleNotifications.length)
        visibleNotifications.forEach(item => {
          const kind = notificationKind(item)
          notify(item.message, kind === 'error' ? 'error' : kind === 'warning' ? 'warning' : 'success')
        })
      } catch {
        // Mantém o cursor para tentar novamente no próximo intervalo.
      } finally {
        notificationPolling.current = false
      }
    }

    primeNotifications()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      if (notificationsInitialized.current) pollNotifications()
      else primeNotifications()
    }, NOTIFICATION_POLL_INTERVAL_MS)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [notify, user])

  async function toggleNotifications() {
    const nextOpen = !notificationsOpen
    setOpenPopover(nextOpen ? 'notifications' : null)
    if (!nextOpen) return
    setUnreadNotifications(0)
    setNotificationsLoading(true)
    setNotificationsError(false)
    try {
      const result = await apiFetch('/api/logs?limit=30')
      setNotifications((result.logs || []).filter(isBellNotification).slice(0, 5))
    } catch {
      setNotifications([])
      setNotificationsError(true)
    } finally {
      setNotificationsLoading(false)
    }
  }

  const displayName = user?.fullName || user?.name || user?.email || 'Conta'

  return <header className="ds-top" data-ds-root>
    <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-top__drawer" aria-label={drawerOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={drawerOpen} aria-controls="app-sidebar" onClick={onToggleDrawer}>
      <Icon name="menu" />
    </button>
    <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-top__collapse" aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'} aria-expanded={!collapsed} aria-controls="app-sidebar" onClick={onToggleCollapsed}>
      <Icon name="sidebar" />
    </button>
    <nav className="ds-top__crumb" aria-label="Página atual">
      <p className="ds-top__page">{currentLabel}</p>
    </nav>

    <div className="ds-top__actions">
      <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-top__wide" aria-label="Abrir Inbox" title="Inbox" onClick={() => onNavigate('inbox')}>
        <Icon name="inbox" />
      </button>
      <div className="ds-top__anchor" ref={notificationsAnchor}>
        <button
          type="button"
          ref={notificationsTrigger}
          className="ds-btn ds-btn--quiet ds-btn--icon ds-top__btn"
          data-tutorial-target="notificacoes"
          aria-label={unreadNotifications > 0 ? `Abrir notificações, ${unreadNotifications} novas` : 'Abrir notificações'}
          title="Notificações"
          aria-haspopup="dialog"
          aria-expanded={notificationsOpen}
          onClick={toggleNotifications}
        >
          <Icon name="bell" />
          {unreadNotifications > 0 && <span className="ds-dot" aria-hidden="true" />}
        </button>
        {notificationsOpen && <NotificationsPopover
          loading={notificationsLoading}
          error={notificationsError}
          notifications={notifications}
          onSeeAll={() => { setOpenPopover(null); onNavigate('atividade') }}
        />}
      </div>
      <span className="ds-top__wide ds-top__theme"><ThemeSelector variant="toggle" /></span>
      <span className="ds-top__sep ds-top__wide" aria-hidden="true" />
      <button type="button" className="ds-btn ds-btn--primary ds-top__wide ds-top__create" data-tutorial-target="criar-post" onClick={onCreatePost}>
        <Icon name="plus" />Criar post
      </button>
      <div className="ds-top__anchor" ref={profileAnchor}>
        <button
          type="button"
          ref={profileTrigger}
          className="ds-profile"
          data-tutorial-target="perfil"
          aria-haspopup="menu"
          aria-expanded={profileOpen}
          onClick={() => setOpenPopover(profileOpen ? null : 'profile')}
        >
          <span className="ds-avatar" aria-hidden="true">{user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : userInitials(user)}</span>
          <span className="ds-profile__name">{displayName}</span>
          <Icon name="chevronDown" />
        </button>
        {profileOpen && <ProfileMenu user={user} onNavigate={onNavigate} onOpenShortcutHelp={onOpenShortcutHelp} onClose={closePopover} />}
      </div>
    </div>
  </header>
}

function ShortcutHelp({ open, onClose }) {
  const dialogRef = useRef(null)
  useEffect(() => {
    if (open) dialogRef.current?.querySelector('button')?.focus()
  }, [open])
  if (!open) return null
  return <div className="ds-scrim" data-ds-root role="presentation" onMouseDown={onClose}>
    <section ref={dialogRef} className="ds-modal ds-modal--sm" role="dialog" aria-modal="true" aria-labelledby="shortcut-help-title" onMouseDown={event => event.stopPropagation()}>
      <div className="ds-modal__head">
        <div className="ds-modal__heading">
          <p className="ds-eyebrow">Navegação rápida</p>
          <h2 className="ds-modal__title" id="shortcut-help-title">Atalhos de teclado</h2>
        </div>
        <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-modal__close" aria-label="Fechar atalhos" onClick={onClose}><Icon name="close" /></button>
      </div>
      <div className="ds-modal__body">
        <dl className="ds-shortcuts">
          <div><dt><kbd className="ds-kbd">C</kbd></dt><dd>Criar um post</dd></div>
          <div><dt><kbd className="ds-kbd">D</kbd></dt><dd>Ir para o Início</dd></div>
          <div><dt><kbd className="ds-kbd">?</kbd></dt><dd>Mostrar estes atalhos</dd></div>
          <div><dt><kbd className="ds-kbd">Esc</kbd></dt><dd>Fechar janela aberta</dd></div>
        </dl>
        <p className="ds-shortcuts__note">Os atalhos de uma tecla ficam pausados enquanto você digita em um campo.</p>
      </div>
    </section>
  </div>
}

export function AppShell({ page, onPageChange, children, user }) {
  return (
    <ToastProvider>
      <AppShellBody page={page} onPageChange={onPageChange} user={user}>{children}</AppShellBody>
    </ToastProvider>
  )
}

function AppShellBody({ page, onPageChange, children, user }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [tutorialWantsSidebar, setTutorialWantsSidebar] = useState(false)
  const sidebarRef = useRef(null)
  const lastPage = useRef(page)
  const currentLabel = page === 'perfil' ? 'Perfil' : navigation.find(([key]) => key === page)?.[1] || 'Início'
  const notify = useToast()

  function toggleCollapsed() {
    setCollapsed(current => {
      const next = !current
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        // A preferência continua valendo nesta sessão mesmo sem storage.
      }
      return next
    })
  }

  function navigate(key) {
    setDrawerOpen(false)
    onPageChange(key)
  }

  useEffect(() => {
    document.title = `${currentLabel} · Meu Ecoo Mídia`
  }, [currentLabel])

  useEffect(() => {
    if (lastPage.current === page) return
    lastPage.current = page
    window.scrollTo(0, 0)
    document.getElementById('main-content')?.focus({ preventScroll: true })
  }, [page])

  useEffect(() => {
    if (!drawerOpen) return undefined
    sidebarRef.current?.querySelector('.ds-nav__item')?.focus()
    const handleKey = event => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [drawerOpen])

  useEffect(() => {
    const openTutorial = () => setTutorialOpen(true)
    window.addEventListener(TUTORIAL_OPEN_EVENT, openTutorial)
    return () => window.removeEventListener(TUTORIAL_OPEN_EVENT, openTutorial)
  }, [])

  function closeTutorial() {
    markTutorialSeen()
    setTutorialOpen(false)
  }

  function completeTutorial() {
    markTutorialCompleted()
    setTutorialOpen(false)
    notify('Tutorial concluído! Você pode revê-lo quando quiser em Perfil.')
  }

  useEffect(() => {
    const handleShortcut = event => {
      if (event.key === 'Escape') {
        setShortcutHelpOpen(false)
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (shortcutHelpOpen || tutorialOpen) return
      const tagName = event.target?.tagName?.toLowerCase()
      if (['input', 'textarea', 'select'].includes(tagName) || event.target?.isContentEditable) return
      if (event.target?.closest?.('[role="dialog"], [role="menu"]')) return
      if (event.key.toLowerCase() === 'c') { event.preventDefault(); navigate('agendador') }
      if (event.key.toLowerCase() === 'd') { event.preventDefault(); navigate('dashboard') }
      if (event.key === '?' || (event.shiftKey && event.key === '/')) { event.preventDefault(); setShortcutHelpOpen(true) }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  })

  const menuOpen = drawerOpen || tutorialWantsSidebar

  return (
    <div className="app-shell-modern ds-shell" data-side={collapsed ? 'rail' : undefined} data-drawer={menuOpen ? 'open' : undefined}>
      <a className="ds-skip" data-ds-root href="#main-content">Pular para o conteúdo</a>
      <AppSidebar page={page} onNavigate={navigate} user={user} collapsed={collapsed} sidebarRef={sidebarRef} />
      {menuOpen && <button type="button" className="ds-shell__scrim" aria-label="Fechar menu" onClick={() => setDrawerOpen(false)} />}

      <div className="ds-shell__main">
        <AppTopbar
          currentLabel={currentLabel}
          user={user}
          drawerOpen={menuOpen}
          onToggleDrawer={() => setDrawerOpen(current => !current)}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          onCreatePost={() => navigate('agendador')}
          onNavigate={navigate}
          onOpenShortcutHelp={() => setShortcutHelpOpen(true)}
        />
        <main id="main-content" tabIndex="-1" className="ds-shell__content">{children}</main>
        <footer className="ds-foot" data-ds-root>
          <CopyrightNotice />
          <p className="ds-foot__links"><a href="/privacy-policy">Política de Privacidade</a><a href="/terms-of-service">Termos de Serviço</a></p>
        </footer>
      </div>

      <MobileBottomNav page={page} onNavigate={navigate} menuOpen={menuOpen} onOpenMenu={() => setDrawerOpen(true)} />
      <AiAssistantWidget currentPage={page} onNavigate={onPageChange} />
      <ShortcutHelp open={shortcutHelpOpen} onClose={() => setShortcutHelpOpen(false)} />
      <AppTutorial open={tutorialOpen} onNavigate={onPageChange} onClose={closeTutorial} onComplete={completeTutorial} onRequestSidebar={setTutorialWantsSidebar} />
    </div>
  )
}
