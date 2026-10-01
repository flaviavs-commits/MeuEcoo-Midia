import { useEffect, useRef, useState } from 'react'
import { AiAssistantWidget } from '../ai/ai-assistant-widget.jsx'
import { apiFetch, logout } from '../../lib/api.js'
import { ToastProvider, useToast } from '../ui/toast.jsx'
import { ThemeSelector, setAppTheme, useTheme } from '../ui/theme-selector.jsx'
import { AppTutorial } from '../ui/app-tutorial.jsx'
import { markTutorialCompleted, markTutorialSeen, TUTORIAL_OPEN_EVENT } from '../../lib/tutorial.js'
import { getPlan, hasActivePlanModule } from '../../lib/plans.js'
import { CopyrightNotice } from '../ui/copyright-notice.jsx'
import { TEAM_APPROVAL_UI_ENABLED } from '../../lib/feature-flags.js'
import { Icon } from '../ui/icon.jsx'
import { Popover, Sheet, Tooltip, moveMenuFocus } from '../ui/floating.jsx'
import { PageErrorBoundary } from '../ui/page-error-boundary.jsx'
import { MEDIA, useMediaQuery } from '../../lib/breakpoints.js'

// Início e o Assistente no topo; depois cinco grupos curtos. O título do
// grupo é só uma etiqueta discreta (no modo recolhido, vira uma divisória).
const NAV_SECTIONS = [
  { id: 'principal', label: null, items: [['dashboard', 'Início', 'home'], ['ai', 'Assistente inteligente', 'sparkle']] },
  { id: 'criar', label: 'Criar', items: [['agendador', 'Meu Post', 'compose'], ['calendario', 'Calendário', 'calendar']] },
  { id: 'conteudo', label: 'Conteúdo', items: [['rascunhos', 'Baú de Ideias', 'chest'], ['biblioteca', 'Biblioteca', 'image']] },
  { id: 'automacoes', label: 'Automações', items: [['filas', 'Repetidor de posts', 'repeat'], ['smartlinks', 'Smartlinks', 'link']] },
  { id: 'engajamento', label: 'Engajamento', items: [['inbox', 'Inbox', 'inbox'], ['analytics', 'Relatórios', 'chart']] },
  { id: 'conta', label: 'Conta', items: [['integracoes', 'Contas', 'plug'], ['seguranca', 'Segurança', 'shield'], ['atividade', 'Atividades', 'activity'], ['equipe', 'Equipe', 'users']] },
].map(section => ({
  ...section,
  items: section.items
    .filter(([key]) => key !== 'equipe' || TEAM_APPROVAL_UI_ENABLED)
    .map(([key, label, icon]) => ({ key, label, icon, group: section.label })),
}))

const ITEM_BY_KEY = new Map(NAV_SECTIONS.flatMap(section => section.items).map(item => [item.key, item]))

// Celular: quatro destinos fixos mais "Mais", que reúne o restante agrupado.
const BOTTOM_NAV = [
  { key: 'dashboard', label: 'Início', icon: 'home' },
  { key: 'agendador', label: 'Criar', icon: 'plus', create: true },
  { key: 'calendario', label: 'Calendário', icon: 'calendar' },
  { key: 'inbox', label: 'Inbox', icon: 'inbox' },
]
const BOTTOM_KEYS = new Set(BOTTOM_NAV.map(item => item.key))
const MORE_SECTIONS = NAV_SECTIONS
  .map(section => ({ ...section, items: section.items.filter(item => !BOTTOM_KEYS.has(item.key)) }))
  .filter(section => section.items.length)
const MORE_KEYS = new Set(MORE_SECTIONS.flatMap(section => section.items.map(item => item.key)))

// Largura da barra lateral: escolhida arrastando a borda (ou pelas setas) e
// guardada neste navegador. Versão no nome da chave para poder mudar o
// formato sem herdar valores antigos quebrados.
export const SIDEBAR_WIDTH = { min: 196, max: 272, step: 8 }
const SIDEBAR_KEY = 'meu-ecoo:sidebar:v2'
const LEGACY_COLLAPSED_KEY = 'meu-ecoo:sidebar-collapsed'

export function clampSidebarWidth(value) {
  const width = Number(value)
  if (!Number.isFinite(width)) return null
  return Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, Math.round(width)))
}

export function readSidebarPrefs() {
  try {
    const raw = localStorage.getItem(SIDEBAR_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      return { width: saved?.width == null ? null : clampSidebarWidth(saved.width), collapsed: saved?.collapsed === true }
    }
    return { width: null, collapsed: localStorage.getItem(LEGACY_COLLAPSED_KEY) === '1' }
  } catch {
    return { width: null, collapsed: false }
  }
}

function writeSidebarPrefs(prefs) {
  try {
    localStorage.setItem(SIDEBAR_KEY, JSON.stringify({ width: prefs.width, collapsed: prefs.collapsed }))
    localStorage.removeItem(LEGACY_COLLAPSED_KEY)
  } catch {
    // A preferência continua valendo nesta sessão mesmo sem storage.
  }
}

function userIsAdmin(user) {
  return user?.role === 'admin'
}

function userInitials(user) {
  const label = user?.fullName || user?.name || user?.email || 'C'
  return label.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase()
}

function isLocked(user, key) {
  return Boolean(user) && !hasActivePlanModule(user.plan, key, user.planActive, user.planUnrestricted)
}

function pageContext(page) {
  if (page === 'perfil') return { label: 'Perfil', group: 'Conta' }
  if (page === 'notfound') return { label: 'Página não encontrada', group: null }
  const item = ITEM_BY_KEY.get(page)
  return item ? { label: item.label, group: item.group } : { label: 'Início', group: null }
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
const NOTIFICATION_KIND_ICONS = { success: 'checkCircle', error: 'alertCircle', pending: 'processing', warning: 'halfCircle', info: 'info' }
const NOTIFICATION_POLL_INTERVAL_MS = 60 * 1000

// O sino só avisa o que pede uma ação: publicação que falhou ou saiu só em parte das redes.
// Publicações concluídas ficam no Calendário e em Atividades; comentários, no Inbox.
function isBellNotification(item) {
  return /^post #\d+\s+(?:publicado parcialmente|falhou ao publicar)/.test(String(item?.message || '').toLowerCase())
}

function mergeNotifications(current, incoming) {
  const byId = new Map()
  ;[...incoming, ...current].forEach(item => byId.set(item.id, item))
  return [...byId.values()]
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
    .slice(0, 5)
}

function notificationPreferenceEnabled(item, user) {
  return user?.notificationPreferences?.failures !== false
}

function NavItem({ item, page, user, rail, onNavigate }) {
  const active = page === item.key
  const locked = isLocked(user, item.key)
  return <Tooltip label={item.label} placement="right" disabled={!rail}>
    <button
      type="button"
      className={`ds-nav__item${item.key === 'ai' ? ' ds-nav__item--special' : ''}`}
      data-tutorial-target={item.key}
      data-locked={locked ? 'true' : undefined}
      aria-current={active ? 'page' : undefined}
      onClick={() => onNavigate(item.key)}
    >
      <Icon name={item.icon} />
      <span className="ds-nav__text">{item.label}</span>
      {active && !locked && <span className="ds-sr-only">Ativo</span>}
      {locked && <span className="ds-nav__lock"><Icon name="lock" size={14} /><span className="ds-nav__lock-text">Plano</span></span>}
    </button>
  </Tooltip>
}

// Borda arrastável da barra lateral (padrão "window splitter"): mouse, toque
// e teclado. Duplo clique volta à largura padrão.
function SidebarResizer({ width, fallbackWidth, shellRef, onCommit }) {
  const [dragging, setDragging] = useState(false)
  const drag = useRef(null)
  const current = width ?? fallbackWidth

  function preview(next) {
    shellRef.current?.style.setProperty('--ds-side-w', `${next}px`)
  }

  function onPointerDown(event) {
    if (event.button !== 0) return
    event.preventDefault()
    const sidebar = event.currentTarget.closest('.ds-side')
    drag.current = { startX: event.clientX, startWidth: sidebar ? sidebar.getBoundingClientRect().width : current, last: current }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    shellRef.current?.setAttribute('data-resizing', '')
    setDragging(true)
  }

  function onPointerMove(event) {
    if (!drag.current) return
    const next = clampSidebarWidth(drag.current.startWidth + (event.clientX - drag.current.startX))
    drag.current.last = next
    preview(next)
  }

  function finish() {
    if (!drag.current) return
    const next = drag.current.last
    drag.current = null
    shellRef.current?.removeAttribute('data-resizing')
    setDragging(false)
    onCommit(next)
  }

  function onKeyDown(event) {
    const step = event.shiftKey ? SIDEBAR_WIDTH.step * 3 : SIDEBAR_WIDTH.step
    let next = null
    if (event.key === 'ArrowRight') next = current + step
    if (event.key === 'ArrowLeft') next = current - step
    if (event.key === 'Home') next = SIDEBAR_WIDTH.min
    if (event.key === 'End') next = SIDEBAR_WIDTH.max
    if (next === null) return
    event.preventDefault()
    onCommit(clampSidebarWidth(next))
  }

  return <div
    className="ds-side__resize"
    role="separator"
    aria-orientation="vertical"
    aria-label="Largura do menu lateral"
    aria-valuemin={SIDEBAR_WIDTH.min}
    aria-valuemax={SIDEBAR_WIDTH.max}
    aria-valuenow={current}
    aria-controls="app-sidebar"
    tabIndex={0}
    data-dragging={dragging ? '' : undefined}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={finish}
    onPointerCancel={finish}
    onKeyDown={onKeyDown}
    onDoubleClick={() => onCommit(null)}
  />
}

function AppSidebar({ page, onNavigate, user, rail, width, fallbackWidth, shellRef, onResize }) {
  return <aside className="ds-side" id="app-sidebar" data-ds-root aria-label="Menu lateral">
    <div className="ds-side__inner">
      <a className="ds-side__brand" href="/app/dashboard" aria-label="Meu Ecoo Mídia, ir para o Início" onClick={event => { event.preventDefault(); onNavigate('dashboard') }}>
        <img className="ds-side__logo" src="/logo.png" alt="" width="108" height="45" />
        <img className="ds-side__mark" src="/logo-icon.png" alt="" width="30" height="30" />
      </a>

      <nav className="ds-nav" aria-label="Navegação principal">
        {NAV_SECTIONS.map(section => (
          <div className="ds-nav__group" role="group" aria-label={section.label || 'Principal'} key={section.id}>
            {section.label && <p className="ds-nav__label" aria-hidden="true">{section.label}</p>}
            <ul>
              {section.items.map(item => <li key={item.key}>
                <NavItem item={item} page={page} user={user} rail={rail} onNavigate={onNavigate} />
              </li>)}
            </ul>
          </div>
        ))}
      </nav>

      {userIsAdmin(user) && <div className="ds-side__foot">
        <Tooltip label="Administração" placement="right" disabled={!rail}>
          <a className="ds-nav__item" href="/admin.html" data-tutorial-target="administracao">
            <Icon name="settings" /><span className="ds-nav__text">Administração</span>
          </a>
        </Tooltip>
      </div>}
    </div>
    {!rail && <SidebarResizer width={width} fallbackWidth={fallbackWidth} shellRef={shellRef} onCommit={onResize} />}
  </aside>
}

function MobileBottomNav({ page, onNavigate, onOpenMore, moreOpen }) {
  const moreActive = MORE_KEYS.has(page) || page === 'perfil'
  return <nav className="ds-bottomnav" data-ds-root aria-label="Navegação principal">
    {BOTTOM_NAV.map(item => <button
      key={item.key}
      type="button"
      className={`ds-bottomnav__item${item.create ? ' ds-bottomnav__item--create' : ''}`}
      data-tutorial-target={item.key}
      aria-current={page === item.key ? 'page' : undefined}
      onClick={() => onNavigate(item.key)}
    >
      {item.create
        ? <span className="ds-bottomnav__plus" data-tutorial-target="criar-post"><Icon name="plus" /></span>
        : <Icon name={item.icon} />}
      <span>{item.label}</span>
    </button>)}
    <button
      type="button"
      className="ds-bottomnav__item"
      data-tutorial-target="mais"
      data-active={moreActive ? '' : undefined}
      aria-haspopup="dialog"
      aria-expanded={moreOpen}
      onClick={onOpenMore}
    >
      <Icon name="menu" /><span>Mais</span>
    </button>
  </nav>
}

function MoreSheet({ open, onClose, page, user, onNavigate }) {
  return <Sheet open={open} onClose={onClose} title="Mais" className="ds-moresheet">
    <nav className="ds-more" aria-label="Mais seções">
      {MORE_SECTIONS.map(section => <div className="ds-more__group" key={section.id}>
        {section.label && <p className="ds-more__label" aria-hidden="true">{section.label}</p>}
        <ul role="list" aria-label={section.label || 'Destaques'}>
          {section.items.map(item => {
            const locked = isLocked(user, item.key)
            return <li key={item.key}>
              <button
                type="button"
                className={`ds-more__item${item.key === 'ai' ? ' ds-more__item--special' : ''}`}
                data-tutorial-target={item.key}
                aria-current={page === item.key ? 'page' : undefined}
                onClick={() => onNavigate(item.key)}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {locked
                  ? <span className="ds-more__lock"><Icon name="lock" size={14} />Plano</span>
                  : <Icon name="chevronRight" className="ds-more__chev" />}
              </button>
            </li>
          })}
          {section.id === 'conta' && userIsAdmin(user) && <li>
            <a className="ds-more__item" href="/admin.html" data-tutorial-target="administracao">
              <Icon name="settings" /><span>Administração</span><Icon name="chevronRight" className="ds-more__chev" />
            </a>
          </li>}
        </ul>
      </div>)}
    </nav>
  </Sheet>
}

function NotificationsBody({ loading, error, notifications }) {
  if (loading) return <div className="ds-notif__state" aria-live="polite"><span className="ds-spinner" aria-hidden="true" />Carregando atualizações...</div>
  if (error) return <div className="ds-notif__state ds-notif__state--error" role="alert"><Icon name="alertCircle" />Não foi possível carregar as notificações agora.</div>
  if (!notifications.length) return <div className="ds-notif__state"><Icon name="checkCircle" />Nada precisa da sua atenção agora. Avisamos aqui quando uma publicação falhar.</div>
  return <ul className="ds-notif__list">
    {notifications.map(item => {
      const kind = notificationKind(item)
      return <li className="ds-notif__item" data-kind={kind} key={item.id}>
        <span className="ds-notif__mark" aria-hidden="true"><Icon name={NOTIFICATION_KIND_ICONS[kind] || 'info'} /></span>
        <div className="ds-notif__body">
          <p className="ds-notif__kind">{NOTIFICATION_KIND_LABELS[kind]}</p>
          <p className="ds-notif__msg">{item.message}</p>
          <p className="ds-notif__time">{item.timestamp ? new Date(item.timestamp).toLocaleString('pt-BR') : 'Agora'}</p>
        </div>
      </li>
    })}
  </ul>
}

function PlanBadge({ user }) {
  if (!user?.plan) return null
  return user.planActive === false
    ? <span className="ds-badge" data-tone="warning">Pagamento pendente</span>
    : <span className="ds-badge" data-tone="gold">Plano {getPlan(user.plan).name}</span>
}

function AccountIdentity({ user }) {
  return <div className="ds-profilemenu__id">
    <span className="ds-avatar ds-avatar--40" aria-hidden="true">{user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : userInitials(user)}</span>
    <div>
      <p className="ds-profilemenu__name">{user?.fullName || user?.name || 'Minha conta'}</p>
      {user?.email && <p className="ds-profilemenu__mail">{user.email}</p>}
    </div>
    <PlanBadge user={user} />
  </div>
}

// Desktop: menu ancorado. Identidade no topo, fora do menu; ações dentro.
function AccountMenu({ open, anchorRef, onClose, user, onNavigate, onOpenShortcutHelp }) {
  const theme = useTheme()
  const choose = action => () => {
    onClose()
    anchorRef.current?.focus()
    action()
  }
  return <Popover open={open} anchorRef={anchorRef} onClose={onClose} role="dialog" ariaLabel="Sua conta" className="ds-profilemenu" placement="bottom-end">
    <AccountIdentity user={user} />
    <div className="ds-menu__sep" role="presentation" />
    <div role="menu" aria-label="Conta" className="ds-menu__list" onKeyDown={event => moveMenuFocus(event, event.currentTarget)}>
      <button type="button" role="menuitem" className="ds-menu__item" onClick={choose(() => onNavigate('perfil'))}><Icon name="user" />Perfil</button>
      <button type="button" role="menuitem" className="ds-menu__item" onClick={choose(() => onNavigate('seguranca'))}><Icon name="shield" />Segurança</button>
      <button type="button" role="menuitem" className="ds-menu__item" onClick={choose(() => onNavigate('atividade'))}><Icon name="activity" />Atividades</button>
      <div className="ds-menu__sep" role="separator" />
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={theme === 'dark'}
        className="ds-menu__item"
        data-tutorial-target="tema"
        onClick={() => setAppTheme(theme === 'dark' ? 'light' : 'dark')}
      >
        <Icon name="moon" />Tema escuro<span className="ds-menu__trail"><span className="ds-switch" data-on={theme === 'dark' ? '' : undefined} aria-hidden="true" /></span>
      </button>
      <button type="button" role="menuitem" className="ds-menu__item" onClick={choose(onOpenShortcutHelp)}>
        <Icon name="keyboard" />Atalhos de teclado<span className="ds-menu__trail"><kbd className="ds-kbd">?</kbd></span>
      </button>
      <div className="ds-menu__sep" role="separator" />
      <button type="button" role="menuitem" className="ds-menu__item ds-menu__item--danger" onClick={logout}><Icon name="logout" />Sair</button>
    </div>
  </Popover>
}

// Celular: a mesma conta numa folha que sobe de baixo.
function AccountSheet({ open, onClose, user, onNavigate, page }) {
  return <Sheet open={open} onClose={onClose} title="Sua conta" className="ds-accountsheet">
    <AccountIdentity user={user} />
    <ul className="ds-more__group" role="list">
      <li>
        <button type="button" className="ds-more__item" aria-current={page === 'perfil' ? 'page' : undefined} onClick={() => onNavigate('perfil')}>
          <Icon name="user" /><span>Perfil e plano</span><Icon name="chevronRight" className="ds-more__chev" />
        </button>
      </li>
    </ul>
    <div className="ds-more__theme" data-tutorial-target="tema">
      <span>Tema</span>
      <ThemeSelector variant="segmented" />
    </div>
    <button type="button" className="ds-more__item ds-more__item--danger" onClick={logout}><Icon name="logout" /><span>Sair</span></button>
    <p className="ds-accountsheet__legal"><a href="/privacy-policy">Política de Privacidade</a><a href="/terms-of-service">Termos de Serviço</a></p>
  </Sheet>
}

function useNotifications(user) {
  // As preferências são lidas na hora do aviso: trocar o objeto do usuário (perfil, 2FA, foto) não
  // reinicia o acompanhamento nem pula avisos que chegaram nesse meio-tempo.
  const userRef = useRef(user)
  useEffect(() => { userRef.current = user }, [user])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [unread, setUnread] = useState(0)
  const cursor = useRef(0)
  const polling = useRef(false)
  const initialized = useRef(false)
  const notify = useToast()

  useEffect(() => {
    let active = true
    initialized.current = false

    async function prime() {
      if (!active || polling.current) return
      polling.current = true
      let primed = false
      try {
        const result = await apiFetch('/api/logs?limit=30')
        const logs = result.logs || []
        if (!active) return
        cursor.current = Math.max(0, ...logs.map(item => Number(item.id) || 0))
        setNotifications(logs.filter(isBellNotification).slice(0, 5))
        primed = true
      } catch {
        // A falha no polling não deve bloquear a navegação do painel.
      } finally {
        if (active) initialized.current = primed
        polling.current = false
      }
    }

    async function poll() {
      if (!active || !initialized.current || polling.current) return
      polling.current = true
      try {
        // A consulta também funciona fora do Inbox e faz o backend descobrir
        // comentários novos (que aparecem no Inbox).
        await apiFetch('/api/posts/inbox/unread').catch(() => {})
        const result = await apiFetch(`/api/logs/since/${cursor.current}`)
        const logs = result.logs || []
        if (logs.length) cursor.current = Math.max(cursor.current, ...logs.map(item => Number(item.id) || 0))
        const bellLogs = logs.filter(isBellNotification)
        if (!active || !bellLogs.length) return

        setNotifications(current => mergeNotifications(current, bellLogs))
        const visible = bellLogs.filter(item => notificationPreferenceEnabled(item, userRef.current))
        if (!visible.length) return
        setUnread(current => current + visible.length)
        visible.forEach(item => {
          const kind = notificationKind(item)
          notify(item.message, kind === 'error' ? 'error' : kind === 'warning' ? 'warning' : 'success')
        })
      } catch {
        // Mantém o cursor para tentar novamente no próximo intervalo.
      } finally {
        polling.current = false
      }
    }

    prime()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      if (initialized.current) poll()
      else prime()
    }, NOTIFICATION_POLL_INTERVAL_MS)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [notify])

  async function refresh() {
    setUnread(0)
    setLoading(true)
    setError(false)
    try {
      const result = await apiFetch('/api/logs?limit=30')
      setNotifications((result.logs || []).filter(isBellNotification).slice(0, 5))
    } catch {
      setNotifications([])
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return { notifications, loading, error, unread, refresh }
}

function AppTopbar({ context, user, phone, rail, showSidebarToggle, onToggleSidebar, onBack, onCreatePost, onNavigate, onOpenShortcutHelp }) {
  const [open, setOpen] = useState(null)
  const bellRef = useRef(null)
  const accountRef = useRef(null)
  const { notifications, loading, error, unread, refresh } = useNotifications(user)
  const close = () => setOpen(null)
  const displayName = user?.fullName || user?.name || user?.email || 'Conta'

  function toggleNotifications() {
    if (open === 'notifications') return close()
    setOpen('notifications')
    refresh()
  }

  function seeAllNotifications() {
    close()
    onNavigate('atividade')
  }

  const notificationsBody = <NotificationsBody loading={loading} error={error} notifications={notifications} />

  return <header className="ds-top" data-ds-root>
    {showSidebarToggle && <Tooltip label={rail ? 'Expandir menu' : 'Recolher menu'} placement="bottom">
      <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-top__collapse" aria-label={rail ? 'Expandir menu lateral' : 'Recolher menu lateral'} aria-expanded={!rail} aria-controls="app-sidebar" onClick={onToggleSidebar}>
        <Icon name="sidebar" />
      </button>
    </Tooltip>}
    {onBack && <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-top__back" aria-label="Voltar" onClick={onBack}>
      <Icon name="chevronLeft" />
    </button>}
    {/* Celular: com o título da tela logo abaixo, a barra mostra a marca e só troca
        para o nome da tela quando esse título sobe por trás dela (data-scrolled). */}
    {phone && !onBack && <a className="ds-top__brand" href="/app/dashboard" aria-label="Meu Ecoo Mídia, ir para o Início" onClick={event => { event.preventDefault(); onNavigate('dashboard') }}>
      <img src="/logo.png" alt="" width="108" height="45" />
    </a>}
    <nav className="ds-top__crumb" aria-label="Página atual">
      <p className="ds-top__page">{context.group && !phone && <span className="ds-top__group">{context.group}</span>}<span aria-current="page">{context.label}</span></p>
    </nav>

    <div className="ds-top__actions">
      {!phone && <button type="button" className="ds-btn ds-btn--primary ds-top__create" data-tutorial-target="criar-post" onClick={onCreatePost}>
        <Icon name="plus" />Criar post
      </button>}
      <Tooltip label="Notificações" placement="bottom" disabled={phone || open === 'notifications'}>
        <button
          type="button"
          ref={bellRef}
          className="ds-btn ds-btn--quiet ds-btn--icon ds-top__btn"
          data-tutorial-target="notificacoes"
          aria-label={unread > 0 ? `Abrir notificações, ${unread} novas` : 'Abrir notificações'}
          aria-haspopup="dialog"
          aria-expanded={open === 'notifications'}
          onClick={toggleNotifications}
        >
          <Icon name="bell" />
          {unread > 0 && <span className="ds-dot" aria-hidden="true" />}
        </button>
      </Tooltip>
      <button
        type="button"
        ref={accountRef}
        className="ds-profile"
        data-tutorial-target="perfil"
        aria-label={`Menu da conta: ${displayName}`}
        aria-haspopup="dialog"
        aria-expanded={open === 'account'}
        onClick={() => setOpen(open === 'account' ? null : 'account')}
      >
        <span className="ds-avatar" aria-hidden="true">{user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : userInitials(user)}</span>
        <span className="ds-profile__name">{displayName}</span>
        <Icon name="chevronDown" />
      </button>
    </div>

    {phone
      ? <Sheet
          open={open === 'notifications'}
          onClose={close}
          title="Notificações"
          className="ds-notifsheet"
          footer={<button type="button" className="ds-btn ds-btn--secondary ds-btn--block" onClick={seeAllNotifications}>Ver histórico completo</button>}
        >{notificationsBody}</Sheet>
      : <Popover open={open === 'notifications'} anchorRef={bellRef} onClose={close} role="dialog" ariaLabel="Notificações recentes" className="ds-notif" placement="bottom-end">
          <div className="ds-popover__head"><p className="ds-popover__title">Notificações</p><span className="ds-meta">Só o que precisa de ação</span></div>
          {notificationsBody}
          <div className="ds-popover__foot">
            <button type="button" className="ds-menu__item ds-notif__all" onClick={seeAllNotifications}>Ver histórico completo<Icon name="arrow" /></button>
          </div>
        </Popover>}

    {phone
      ? <AccountSheet open={open === 'account'} onClose={close} user={user} page={context.page} onNavigate={key => { close(); onNavigate(key) }} />
      : <AccountMenu open={open === 'account'} anchorRef={accountRef} onClose={close} user={user} onNavigate={onNavigate} onOpenShortcutHelp={onOpenShortcutHelp} />}
  </header>
}

function ShortcutHelp({ open, onClose }) {
  return <Sheet open={open} onClose={onClose} title="Atalhos de teclado" size="sm" closeLabel="Fechar atalhos">
    <dl className="ds-shortcuts">
      <div><dt><kbd className="ds-kbd">C</kbd></dt><dd>Criar um post</dd></div>
      <div><dt><kbd className="ds-kbd">D</kbd></dt><dd>Ir para o Início</dd></div>
      <div><dt><kbd className="ds-kbd">?</kbd></dt><dd>Mostrar estes atalhos</dd></div>
      <div><dt><kbd className="ds-kbd">Esc</kbd></dt><dd>Fechar janela aberta</dd></div>
    </dl>
    <p className="ds-shortcuts__note">Os atalhos de uma tecla ficam pausados enquanto você digita em um campo.</p>
  </Sheet>
}

export function AppShell({ page, onPageChange, children, user, contentKey = 0 }) {
  return (
    <ToastProvider>
      <AppShellBody page={page} onPageChange={onPageChange} user={user} contentKey={contentKey}>{children}</AppShellBody>
    </ToastProvider>
  )
}

function AppShellBody({ page, onPageChange, children, user, contentKey }) {
  const phone = useMediaQuery(MEDIA.phone)
  const tablet = useMediaQuery(MEDIA.tablet)
  const laptop = useMediaQuery('(max-width: 1279px)')
  const [prefs, setPrefs] = useState(readSidebarPrefs)
  const [tabletExpanded, setTabletExpanded] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const shellRef = useRef(null)
  const lastPage = useRef(page)
  const composerReturn = useRef(page === 'agendador' ? 'dashboard' : page)
  const notify = useToast()
  const context = { ...pageContext(page), page }
  const rail = !phone && (tablet ? !tabletExpanded : prefs.collapsed)
  const composer = phone && page === 'agendador'

  function updatePrefs(patch) {
    setPrefs(current => {
      const next = { ...current, ...patch }
      writeSidebarPrefs(next)
      return next
    })
  }

  function toggleSidebar() {
    if (tablet) setTabletExpanded(current => !current)
    else updatePrefs({ collapsed: !prefs.collapsed })
  }

  function navigate(key) {
    setMoreOpen(false)
    onPageChange(key)
  }

  useEffect(() => {
    document.title = `${context.label} · Meu Ecoo Mídia`
  }, [context.label])

  useEffect(() => {
    if (lastPage.current === page) return
    lastPage.current = page
    if (page !== 'agendador') composerReturn.current = page
    window.scrollTo(0, 0)
    // O foco vai para o conteúdo novo, a menos que a pessoa esteja num
    // diálogo (tutorial, assistente, folha) — tirar o foco dali a desorienta.
    if (tutorialOpen) return
    const active = document.activeElement
    if (active && active !== document.body && active.closest?.('[role="dialog"], .aiw')) return
    document.getElementById('main-content')?.focus({ preventScroll: true })
  }, [page, tutorialOpen])

  // Celular: marca na barra do topo enquanto o título da página está à vista;
  // depois de rolar, o nome da tela. Só um atributo muda (sem nova renderização).
  useEffect(() => {
    const shell = shellRef.current
    if (!phone || !shell) return undefined
    let frame = 0
    const update = () => {
      frame = 0
      shell.toggleAttribute('data-scrolled', window.scrollY > 48)
    }
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
      shell.removeAttribute('data-scrolled')
    }
  }, [phone])

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
      if (shortcutHelpOpen || tutorialOpen || moreOpen) return
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

  const fallbackWidth = laptop ? 216 : 224
  const style = !phone && !rail && prefs.width ? { '--ds-side-w': `${prefs.width}px` } : undefined

  return (
    <div
      ref={shellRef}
      className="app-shell-modern ds-shell"
      data-side={phone ? undefined : rail ? 'rail' : tablet ? 'expanded' : undefined}
      data-bottomnav={phone ? (composer ? 'off' : 'on') : undefined}
      style={style}
    >
      <a className="ds-skip" data-ds-root href="#main-content">Pular para o conteúdo</a>
      {!phone && <AppSidebar
        page={page}
        onNavigate={navigate}
        user={user}
        rail={rail}
        width={prefs.width}
        fallbackWidth={fallbackWidth}
        shellRef={shellRef}
        onResize={width => updatePrefs({ width })}
      />}

      <div className="ds-shell__main">
        <AppTopbar
          context={context}
          user={user}
          phone={phone}
          rail={rail}
          showSidebarToggle={!phone}
          onToggleSidebar={toggleSidebar}
          onBack={composer ? () => navigate(composerReturn.current || 'dashboard') : null}
          onCreatePost={() => navigate('agendador')}
          onNavigate={navigate}
          onOpenShortcutHelp={() => setShortcutHelpOpen(true)}
        />
        <main id="main-content" tabIndex="-1" className="ds-shell__content">
          <PageErrorBoundary resetKey={`${page}:${contentKey}`}>{children}</PageErrorBoundary>
        </main>
        <footer className="ds-foot" data-ds-root>
          <CopyrightNotice />
          <p className="ds-foot__links"><a href="/privacy-policy">Política de Privacidade</a><a href="/terms-of-service">Termos de Serviço</a></p>
        </footer>
      </div>

      {phone && !composer && <MobileBottomNav page={page} onNavigate={navigate} moreOpen={moreOpen} onOpenMore={() => setMoreOpen(true)} />}
      {phone && <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} page={page} user={user} onNavigate={navigate} />}
      <AiAssistantWidget currentPage={page} onNavigate={onPageChange} />
      <ShortcutHelp open={shortcutHelpOpen} onClose={() => setShortcutHelpOpen(false)} />
      <AppTutorial open={tutorialOpen} onNavigate={onPageChange} onClose={closeTutorial} onComplete={completeTutorial} />
    </div>
  )
}
