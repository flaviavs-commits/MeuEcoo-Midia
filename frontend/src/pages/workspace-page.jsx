import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import { useToast } from '../components/ui/toast.jsx'
import { Icon } from '../components/ui/icon.jsx'

const roleLabels = {
  owner: 'Proprietário',
  admin: 'Administrador',
  editor: 'Editor',
  reviewer: 'Aprovador',
}

const approvalLabels = {
  pending: 'Aguardando aprovação',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
}
const APPROVAL_STATUS = { pending: 'processing', approved: 'ok', rejected: 'failed' }
// Mesma regra do servidor: só posts agendados ou aguardando aprovação entram em revisão.
const REVIEWABLE_POST_STATUS = new Set(['scheduled', 'pending_approval'])
const DETAIL_TABS = [
  { key: 'aprovacoes', label: 'Aprovações', icon: 'checkCircle' },
  { key: 'pessoas', label: 'Pessoas', icon: 'users' },
  { key: 'marca', label: 'Identidade visual', icon: 'sparkle' },
]

function initials(member) {
  const source = member.fullName || member.email || '?'
  return source.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()
}

function formatDate(value) {
  if (!value) return 'agora'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'agora' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export function WorkspacePage({ onNavigate } = {}) {
  const [workspaces, setWorkspaces] = useState([])
  const [posts, setPosts] = useState([])
  const [members, setMembers] = useState([])
  const [form, setForm] = useState({ name: '', email: '', role: 'editor', postId: '', brandName: '', primaryColor: '#d9ad5b' })
  const [selected, setSelected] = useState(null)
  const [approvals, setApprovals] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [tab, setTab] = useState('aprovacoes')
  const [busy, setBusy] = useState('')
  const notify = useToast()

  const load = useCallback(async (preferId = null) => {
    setLoading(true)
    setLoadError('')
    try {
      const [spaces, postData] = await Promise.all([apiFetch('/api/workspaces'), apiFetch('/api/posts')])
      const nextSpaces = spaces.workspaces || []
      setWorkspaces(nextSpaces)
      setPosts(postData.posts || [])
      setSelected(current => nextSpaces.find(space => space.id === (preferId ?? current?.id)) || nextSpaces[0] || null)
      return nextSpaces
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load().catch(error => { setLoadError(error.message); notify(error.message, 'error') })
  }, [load, notify])

  useEffect(() => {
    if (!selected) {
      setMembers([])
      setApprovals([])
      return undefined
    }
    let active = true
    setLoadingDetails(true)
    Promise.all([
      apiFetch(`/api/workspaces/${selected.id}/members`),
      apiFetch(`/api/workspaces/${selected.id}/approvals`),
    ]).then(([memberData, approvalData]) => {
      if (!active) return
      setMembers(memberData.members || [])
      setApprovals(approvalData.approvals || [])
      setForm(current => ({
        ...current,
        brandName: selected.branding?.name || '',
        primaryColor: selected.branding?.primaryColor || '#d9ad5b',
      }))
    }).catch(error => {
      if (active) notify(error.message, 'error')
    }).finally(() => {
      if (active) setLoadingDetails(false)
    })
    return () => { active = false }
  }, [selected, notify])

  async function createWorkspace(event) {
    event.preventDefault()
    setBusy('create')
    try {
      const created = await apiFetch('/api/workspaces', { method: 'POST', body: JSON.stringify({ name: form.name }) })
      setForm(current => ({ ...current, name: '' }))
      await load(created?.workspace?.id ?? null)
      notify('Espaço criado. Agora você pode conectar contas e adicionar o time.')
    } catch (error) { notify(error.message, 'error') }
    finally { setBusy('') }
  }

  async function addMember(event) {
    event.preventDefault()
    if (!selected) return
    setBusy('member')
    try {
      await apiFetch(`/api/workspaces/${selected.id}/members`, { method: 'POST', body: JSON.stringify({ email: form.email, role: form.role }) })
      const data = await apiFetch(`/api/workspaces/${selected.id}/members`)
      setMembers(data.members || [])
      setForm(current => ({ ...current, email: '' }))
      notify('Colaborador adicionado ao espaço.')
    } catch (error) { notify(error.message, 'error') }
    finally { setBusy('') }
  }

  async function requestApproval(event) {
    event.preventDefault()
    if (!selected || !form.postId) return
    setBusy('approval')
    try {
      await apiFetch(`/api/workspaces/${selected.id}/approvals`, { method: 'POST', body: JSON.stringify({ postId: Number(form.postId) }) })
      const data = await apiFetch(`/api/workspaces/${selected.id}/approvals`)
      setApprovals(data.approvals || [])
      setForm(current => ({ ...current, postId: '' }))
      notify('Solicitação enviada para aprovação.')
    } catch (error) { notify(error.message, 'error') }
    finally { setBusy('') }
  }

  async function review(approval, status) {
    if (status === 'rejected' && !window.confirm(`Rejeitar o post #${approval.postId}?`)) return
    setBusy(`review:${approval.id}`)
    try {
      await apiFetch(`/api/workspaces/approvals/${approval.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      setApprovals(current => current.map(item => item.id === approval.id ? { ...item, status } : item))
      notify(status === 'approved' ? 'Conteúdo aprovado.' : 'Conteúdo rejeitado.')
    } catch (error) { notify(error.message, 'error') }
    finally { setBusy('') }
  }

  async function saveBranding(event) {
    event.preventDefault()
    if (!selected) return
    setBusy('brand')
    try {
      const data = await apiFetch(`/api/workspaces/${selected.id}/branding`, { method: 'PATCH', body: JSON.stringify({ name: form.brandName, primaryColor: form.primaryColor }) })
      setSelected(current => current ? { ...current, branding: data.branding } : current)
      setWorkspaces(current => current.map(space => space.id === selected.id ? { ...space, branding: data.branding } : space))
      notify('Identidade visual atualizada.')
    } catch (error) { notify(error.message, 'error') }
    finally { setBusy('') }
  }

  function onTabKeyDown(event) {
    const keys = DETAIL_TABS.map(item => item.key)
    const index = keys.indexOf(tab)
    const next = event.key === 'ArrowRight' ? keys[(index + 1) % keys.length]
      : event.key === 'ArrowLeft' ? keys[(index - 1 + keys.length) % keys.length]
        : null
    if (!next) return
    event.preventDefault()
    setTab(next)
    document.getElementById(`eq-tab-${next}`)?.focus()
  }

  const pendingApprovals = approvals.filter(approval => approval.status === 'pending').length
  const canManage = ['owner', 'admin'].includes(selected?.role)
  const canReview = ['owner', 'admin', 'reviewer'].includes(selected?.role)
  const reviewablePosts = posts.filter(post => !post.status || REVIEWABLE_POST_STATUS.has(post.status))
  const selectedPost = posts.find(post => String(post.id) === String(form.postId))
  const brandColor = selected?.branding?.primaryColor || '#d9ad5b'

  const createForm = <form className="eq-create" onSubmit={createWorkspace}>
    <label className="ds-label" htmlFor="workspace-name">Novo espaço</label>
    <div className="eq-create__line">
      <input id="workspace-name" className="ds-input" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Ex.: Loja Aurora" required />
      <button className="ds-btn ds-btn--primary" type="submit" disabled={busy === 'create'}>{busy === 'create' ? <span className="ds-spinner" aria-hidden="true" /> : <Icon name="plus" />}Criar espaço</button>
    </div>
    <p className="ds-hint">Use o nome do cliente ou da marca.</p>
  </form>

  const approvalsPanel = <div className="eq-pane__body">
    <form className="eq-ask" onSubmit={requestApproval}>
      <div className="ds-field">
        <label className="ds-label" htmlFor="approval-post">Publicação para revisão</label>
        <div className="eq-ask__line">
          <span className="ds-select">
            <select id="approval-post" className="ds-select__control" value={form.postId} onChange={event => setForm(current => ({ ...current, postId: event.target.value }))} required disabled={!reviewablePosts.length}>
              <option value="">{reviewablePosts.length ? 'Selecione uma publicação...' : 'Nenhuma publicação disponível para revisão'}</option>
              {reviewablePosts.slice(0, 30).map(post => <option key={post.id} value={post.id}>#{post.id} · {(post.text || 'Publicação').slice(0, 54)}</option>)}
            </select>
            <Icon name="chevronDown" className="ds-select__chev" />
          </span>
          <button className="ds-btn ds-btn--primary" type="submit" disabled={!form.postId || !reviewablePosts.length || busy === 'approval'}>{busy === 'approval' ? <span className="ds-spinner" aria-hidden="true" /> : <Icon name="send" />}Enviar para revisão</button>
        </div>
        <p className="ds-hint">{reviewablePosts.length ? 'Só aparecem publicações agendadas ou aguardando aprovação. Ela fica esperando a decisão de quem aprova.' : 'Agende uma publicação no Meu Post para poder enviá-la para revisão.'}</p>
        {!reviewablePosts.length && onNavigate && <button type="button" className="ds-go" onClick={() => onNavigate('agendador')}>Abrir o Meu Post<Icon name="arrow" size={16} /></button>}
      </div>
      {selectedPost && <div className="eq-picked"><Icon name="checkCircle" size={18} /><div><p className="ds-meta">Selecionado para revisão · Post #{selectedPost.id}</p><p className="eq-picked__text">{selectedPost.text || 'Publicação sem texto'}</p></div></div>}
    </form>

    {loadingDetails
      ? <div aria-busy="true"><p className="ds-sr-only" role="status">Carregando solicitações…</p>{[1, 2].map(item => <span className="ds-skel eq-skel" key={item} />)}</div>
      : approvals.length
        ? <ul className="eq-list">{approvals.map(approval => <li className="eq-item" key={approval.id}>
            <div className="eq-item__main">
              <p className="eq-item__title">Post #{approval.postId} <span className="ds-status ds-status--soft" data-status={APPROVAL_STATUS[approval.status] || 'muted'}>{approvalLabels[approval.status] || approval.status}</span></p>
              <p className="ds-meta eq-item__text">{formatDate(approval.createdAt)} · {approval.text ? approval.text.slice(0, 140) : 'Publicação sem texto'}</p>
            </div>
            {approval.status === 'pending' && canReview && <div className="eq-item__actions">
              <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={() => review(approval, 'approved')} disabled={Boolean(busy)}><Icon name="check" size={16} />Aprovar</button>
              <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm eq-danger" onClick={() => review(approval, 'rejected')} disabled={Boolean(busy)}>Rejeitar</button>
            </div>}
          </li>)}</ul>
        : <div className="ds-empty ds-empty--quiet"><h3 className="ds-empty__title ds-empty__title--sm">Nenhuma solicitação de aprovação por aqui.</h3><p className="ds-empty__text">Envie uma publicação para revisão e ela aparece nesta lista.</p></div>}
    {approvals.some(approval => approval.status === 'pending') && !canReview && <p className="ds-hint">Só proprietários, administradores e aprovadores podem aprovar ou rejeitar.</p>}
  </div>

  const peoplePanel = <div className="eq-pane__body">
    {canManage && <form className="eq-invite" onSubmit={addMember}>
      <div className="ds-field eq-invite__email">
        <label className="ds-label" htmlFor="member-email">Adicionar colaborador</label>
        <input id="member-email" className="ds-input" type="email" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} placeholder="email@exemplo.com" required />
      </div>
      <div className="ds-field eq-invite__role">
        <label className="ds-label" htmlFor="member-role">Papel</label>
        <span className="ds-select">
          <select id="member-role" className="ds-select__control" value={form.role} onChange={event => setForm(current => ({ ...current, role: event.target.value }))} aria-label="Papel do colaborador"><option value="editor">Editor</option><option value="reviewer">Aprovador</option><option value="admin">Administrador</option></select>
          <Icon name="chevronDown" className="ds-select__chev" />
        </span>
      </div>
      <button className="ds-btn ds-btn--secondary" type="submit" disabled={busy === 'member'}>{busy === 'member' && <span className="ds-spinner" aria-hidden="true" />}Adicionar</button>
      <p className="ds-hint eq-invite__hint">O colaborador precisa criar uma conta antes de ser adicionado.</p>
    </form>}
    {loadingDetails
      ? <div aria-busy="true"><p className="ds-sr-only" role="status">Carregando pessoas…</p>{[1, 2].map(item => <span className="ds-skel eq-skel" key={item} />)}</div>
      : members.length
        ? <ul className="eq-list">{members.map(member => <li className="eq-item" key={member.id}>
            <span className="eq-avatar" aria-hidden="true">{initials(member)}</span>
            <div className="eq-item__main">
              <p className="eq-item__title">{member.fullName || member.email}</p>
              <p className="ds-meta">{member.fullName ? member.email : 'Membro do espaço'}</p>
            </div>
            <span className="ds-badge" data-tone={member.role === 'owner' ? 'gold' : 'outline'}>{roleLabels[member.role] || member.role}</span>
          </li>)}</ul>
        : <p className="ds-hint">Ainda não há outras pessoas neste espaço.</p>}
    {!loadingDetails && members.length === 1 && canManage && <p className="ds-hint">Só você por enquanto. Adicione quem já tem conta no Meu Ecoo Mídia para colaborar neste espaço.</p>}
  </div>

  const brandPanel = <form className="eq-pane__body eq-brand" onSubmit={saveBranding}>
    <div className="eq-brand__preview" style={{ '--eq-brand': form.primaryColor }}>
      <span className="eq-brand__swatch" aria-hidden="true">{(form.brandName || selected?.name || '?').slice(0, 1).toUpperCase()}</span>
      <div><p className="eq-brand__name">{form.brandName || selected?.name}</p><p className="ds-meta">Prévia de como o espaço aparece na operação</p></div>
    </div>
    <div className="eq-brand__fields">
      <div className="ds-field">
        <label className="ds-label" htmlFor="eq-brand-name">Nome exibido</label>
        <input id="eq-brand-name" className="ds-input" value={form.brandName} onChange={event => setForm(current => ({ ...current, brandName: event.target.value }))} placeholder={selected?.name} disabled={!canManage} />
      </div>
      <div className="ds-field eq-brand__color">
        <label className="ds-label" htmlFor="eq-brand-color">Cor de destaque</label>
        <span className="eq-color"><input id="eq-brand-color" type="color" value={form.primaryColor} onChange={event => setForm(current => ({ ...current, primaryColor: event.target.value }))} aria-label="Cor de destaque do espaço" disabled={!canManage} /><code>{form.primaryColor}</code></span>
      </div>
    </div>
    {canManage
      ? <div><button className="ds-btn ds-btn--primary" type="submit" disabled={busy === 'brand'}>{busy === 'brand' && <span className="ds-spinner" aria-hidden="true" />}Salvar identidade visual</button></div>
      : <p className="ds-hint">Só proprietários e administradores do espaço podem mudar a identidade visual.</p>}
  </form>

  return <div className="ds-page eq" data-ds-root>
    <header className="ds-pagehead eq-head">
      <div className="ds-pagehead__text">
        <p className="ds-eyebrow">Operação em equipe</p>
        <h1 className="ds-pagehead__title">Equipe</h1>
        <p className="ds-pagehead__lede">Crie um espaço por cliente ou marca, convide as pessoas certas e mantenha cada publicação no fluxo de revisão.</p>
      </div>
    </header>

    {loadError && <div className="ds-alert" data-tone="danger" role="alert">
      <Icon name="alertCircle" className="ds-alert__icon" />
      <p className="ds-alert__title">Não foi possível carregar seus espaços</p>
      <p className="ds-alert__text">{loadError}</p>
      <div className="ds-alert__actions"><button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={() => load().catch(error => setLoadError(error.message))} disabled={loading}>Tentar de novo</button></div>
    </div>}

    {!loading && !loadError && !workspaces.length
      ? <section className="eq-start" aria-labelledby="eq-start-title">
          <div className="eq-start__intro">
            <span className="ds-icontile ds-icontile--lg" aria-hidden="true"><Icon name="users" /></span>
            <h2 className="ds-empty__title" id="eq-start-title">Um espaço para cada operação</h2>
            <p className="ds-empty__text">Você continua criando e agendando normalmente. A equipe entra para colaborar e revisar.</p>
            <ol className="eq-steps">
              <li><span aria-hidden="true">1</span><div><strong>Organize</strong><p>Crie um espaço para cada cliente, marca ou projeto.</p></div></li>
              <li><span aria-hidden="true">2</span><div><strong>Colabore</strong><p>Adicione pessoas já cadastradas e defina o papel de cada uma.</p></div></li>
              <li><span aria-hidden="true">3</span><div><strong>Publique com segurança</strong><p>Envie posts para aprovação antes de publicar nas redes conectadas.</p></div></li>
            </ol>
          </div>
          <div className="eq-start__body">{createForm}</div>
        </section>
      : !loadError && <div className="eq-frame">
          <aside className="eq-side" aria-label="Seus espaços">
            {createForm}
            <div className="eq-side__head"><h2 className="eq-side__title">Clientes e marcas</h2><span className="ds-badge" data-tone="outline"><span className="ds-num">{workspaces.length}</span></span></div>
            {loading && !workspaces.length
              ? <div aria-busy="true">{[1, 2, 3].map(item => <span className="ds-skel eq-skel eq-skel--sm" key={item} />)}</div>
              : <ul className="eq-spaces">{workspaces.map(space => <li key={space.id}>
                  <button type="button" className="eq-space" aria-current={selected?.id === space.id ? 'true' : undefined} onClick={() => setSelected(space)}>
                    <span className="eq-space__mark" style={{ '--eq-brand': space.branding?.primaryColor || '#d9ad5b' }} aria-hidden="true">{space.name.slice(0, 1).toUpperCase()}</span>
                    <span className="eq-space__text"><strong>{space.name}</strong><small>{roleLabels[space.role] || space.role}</small></span>
                    <Icon name="chevronRight" size={16} className="eq-space__chev" />
                  </button>
                </li>)}</ul>}
          </aside>

          {selected && <section className="eq-main" aria-labelledby="eq-selected-title">
            <header className="eq-sel">
              <span className="eq-sel__mark" style={{ '--eq-brand': brandColor }} aria-hidden="true">{selected.name.slice(0, 1).toUpperCase()}</span>
              <div className="eq-sel__text">
                <h2 className="eq-sel__title" id="eq-selected-title">{selected.name}</h2>
                <p className="ds-meta">Você está trabalhando como <strong>{roleLabels[selected.role] || selected.role}</strong>. As ações abaixo ficam vinculadas a este espaço.</p>
              </div>
              <dl className="eq-sel__stats">
                <div><dt>pessoas</dt><dd className="ds-num">{members.length}</dd></div>
                <div><dt>pendentes</dt><dd className="ds-num">{pendingApprovals}</dd></div>
                <div><dt>solicitações</dt><dd className="ds-num">{approvals.length}</dd></div>
              </dl>
            </header>

            <div className="ds-tabs eq-tabs" role="tablist" aria-label={`Seções de ${selected.name}`} onKeyDown={onTabKeyDown}>
              {DETAIL_TABS.map(item => <button key={item.key} type="button" role="tab" id={`eq-tab-${item.key}`} className="ds-tab" aria-selected={tab === item.key} aria-controls={`eq-pane-${item.key}`} tabIndex={tab === item.key ? 0 : -1} onClick={() => setTab(item.key)}>
                <Icon name={item.icon} size={16} />{item.label}{item.key === 'aprovacoes' && pendingApprovals > 0 && <span className="eq-tabs__count ds-num">{pendingApprovals}</span>}
              </button>)}
            </div>
            <div className="eq-pane" role="tabpanel" id={`eq-pane-${tab}`} aria-labelledby={`eq-tab-${tab}`}>
              {tab === 'aprovacoes' ? approvalsPanel : tab === 'pessoas' ? peoplePanel : brandPanel}
            </div>
          </section>}
        </div>}
  </div>
}
