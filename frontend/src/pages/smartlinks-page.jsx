import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { useToast } from '../components/ui/toast.jsx'
import { Icon } from '../components/ui/icon.jsx'
import { OverflowMenu } from '../components/ui/overflow-menu.jsx'
import { Sheet } from '../components/ui/floating.jsx'

function parseLinkLine(line) {
  const value = line.trim()
  if (!value) return null
  const separator = value.indexOf('|')
  if (separator >= 0) return { label: value.slice(0, separator).trim(), url: value.slice(separator + 1).trim() }
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' && url.hostname) return { label: url.hostname.replace(/^www\./i, ''), url: url.toString() }
  } catch {}
  return { label: '', url: value }
}

const emptyForm = { name: '', slug: '', title: '', description: '', links: '', logoUrl: '' }
// Mesma regra do servidor: um item precisa de texto e de um endereço https.
function isPublishableItem(item) {
  if (!item?.label) return false
  try {
    const url = new URL(item.url)
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password
  } catch { return false }
}

const formatCount = value => Number(value || 0).toLocaleString('pt-BR')

const previewSlug = value => String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'seu-link'

// Mensagem do backend quando existe; falha de rede ou resposta fora do formato
// vira o texto da ação, nunca o erro técnico.
function messageOf(error, fallback) {
  return error instanceof ApiError ? error.message : fallback
}

// Quantos links de cada página aparecem antes do "Ver todos": com 10 ou 50
// páginas, a lista continua legível.
const PREVIEW_LINKS = 5
const FORM_ID = 'sl-create-form'

// A caixa de links cresce com o conteúdo (a página rola, não a caixa): com 50+
// linhas continua dando para ver e revisar tudo.
function useAutoGrow(ref, value) {
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight + 2}px`
  }, [ref, value])
}

function SmartlinkRow({ link, editing, editingSlug, savingSlug, removing, copied, onCopy, onStartEdit, onCancelEdit, onChangeSlug, onSaveSlug, onRemove }) {
  const [showAll, setShowAll] = useState(false)
  const label = link.title || link.name
  const items = link.items || []
  const totalClicks = items.reduce((total, item) => total + Number(item.clicks || 0), 0)
  const visibleItems = showAll ? items : items.slice(0, PREVIEW_LINKS)
  const publicPath = `/go/${link.slug}`

  return <li className="sl-page" aria-busy={removing || undefined}>
    <div className="sl-page__head">
      <span className="sl-page__logo">{link.theme?.logoUrl ? <img src={link.theme.logoUrl} alt="" /> : <Icon name="link" />}</span>
      <div className="sl-page__id">
        <h3>{label}</h3>
        <p className="sl-page__meta">
          <span className="sl-page__url">{publicPath}</span>
          <span className="sl-page__stats">{items.length} {items.length === 1 ? 'link' : 'links'} · <span className="ds-num">{formatCount(totalClicks)}</span> {totalClicks === 1 ? 'clique' : 'cliques'}</span>
        </p>
      </div>
      <div className="sl-page__actions">
        {/* O nome acessível começa pelo texto visível (quem usa comando de voz fala "Copiar link"). */}
        <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={() => onCopy(link)} aria-label={copied ? `Copiado: link de ${label}` : `Copiar link de ${label}`}>
          <Icon name={copied ? 'check' : 'copy'} size={16} />{copied ? 'Copiado' : 'Copiar link'}
        </button>
        <a className="ds-btn ds-btn--secondary ds-btn--sm" href={publicPath} target="_blank" rel="noreferrer" aria-label={`Abrir a página pública de ${label} (abre em nova aba)`}>Abrir<Icon name="external" size={16} /></a>
        <OverflowMenu label={`Mais ações para ${label}`} items={[
          { label: editing ? 'Cancelar edição da URL' : 'Editar URL', icon: 'compose', onSelect: () => (editing ? onCancelEdit() : onStartEdit(link)) },
          { label: removing ? 'Excluindo…' : 'Excluir', icon: 'trash', danger: true, disabled: removing, onSelect: () => onRemove(link.id, label) },
        ]} />
      </div>
    </div>

    {editing && <form className="sl-edit" onSubmit={event => { event.preventDefault(); onSaveSlug(link.id) }}>
      <label className="ds-label" htmlFor={`sl-edit-${link.id}`}>Nova URL personalizada</label>
      <div className="sl-edit__line">
        <span className="sl-slug"><span className="sl-slug__prefix" aria-hidden="true">/go/</span><input id={`sl-edit-${link.id}`} className="ds-input" value={editingSlug} onChange={event => onChangeSlug(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') onCancelEdit() }} maxLength="60" autoFocus /></span>
        <button className="ds-btn ds-btn--primary ds-btn--sm" type="submit" disabled={savingSlug}>{savingSlug ? 'Salvando…' : 'Salvar'}</button>
        <button className="ds-btn ds-btn--quiet ds-btn--sm" type="button" onClick={onCancelEdit} disabled={savingSlug}>Cancelar</button>
      </div>
      <p className="ds-hint">Letras, números e hífens, com pelo menos 3 caracteres. O endereço antigo continua redirecionando.</p>
    </form>}

    {items.length > 0 && <div className="sl-page__body">
      <ul className="sl-page__links" aria-label={`Links de ${label}`}>
        {visibleItems.map(item => <li key={item.id}>
          <span className="sl-page__label">{item.label}</span>
          <span className="sl-page__clicks"><span className="ds-num">{formatCount(item.clicks)}</span> {Number(item.clicks || 0) === 1 ? 'clique' : 'cliques'}</span>
        </li>)}
      </ul>
      {items.length > PREVIEW_LINKS && <button type="button" className="ds-go sl-page__more" aria-expanded={showAll} onClick={() => setShowAll(current => !current)}>
        {showAll ? 'Mostrar menos' : `Ver todos os ${items.length} links`}<Icon name="chevronDown" size={16} />
      </button>}
    </div>}
  </li>
}

export function SmartlinksPage() {
  const [smartlinks, setSmartlinks] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingSlug, setEditingSlug] = useState('')
  const [savingSlug, setSavingSlug] = useState(false)
  const [removingId, setRemovingId] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [creating, setCreating] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const linksRef = useRef(null)
  const copiedTimer = useRef(null)
  const notify = useToast()
  const load = useCallback(() => apiFetch('/api/smartlinks').then(data => setSmartlinks(data?.smartlinks || [])), [])

  // Uma falha de carga não pode virar o formulário de "primeira página": a
  // pessoa pensaria que perdeu os Smartlinks.
  const loadAll = useCallback(() => {
    setLoading(true)
    setLoadError('')
    return load()
      .catch(error => setLoadError(messageOf(error, 'Verifique sua conexão e tente de novo.')))
      .finally(() => setLoading(false))
  }, [load])

  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => () => window.clearTimeout(copiedTimer.current), [])
  useAutoGrow(linksRef, `${form.links}|${formOpen}`)

  async function changeLogo(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return notify('Escolha uma imagem JPG, PNG, GIF ou WebP.', 'error')
    setUploadingLogo(true)
    try {
      const upload = await apiFetch('/api/posts/upload-url', { method: 'POST', body: JSON.stringify({ filename: file.name, mimetype: file.type }) })
      const response = await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file }).catch(() => { throw new Error('Não foi possível enviar a logo. Verifique sua conexão e tente de novo.') })
      if (!response.ok) throw new Error('Não foi possível enviar a logo.')
      const uploaded = await response.json().catch(() => null)
      const mediaUrl = upload.mediaUrl || uploaded?.url
      if (!mediaUrl) throw new Error('O upload não retornou uma URL válida.')
      setForm(current => ({ ...current, logoUrl: mediaUrl }))
      notify('Logo da loja carregada.')
    } catch (error) {
      notify(error instanceof ApiError || error?.name === 'Error' ? error.message : 'Não foi possível enviar a logo agora.', 'error')
    } finally {
      setUploadingLogo(false)
    }
  }

  async function save(event) {
    event.preventDefault()
    if (creating) return
    setCreating(true)
    try {
      const items = form.links.split('\n').map(parseLinkLine).filter(Boolean)
      const slug = form.slug.trim()
      await apiFetch('/api/smartlinks', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          // A URL personalizada só vai quando foi preenchida; sem ela o
          // servidor continua derivando o endereço a partir do nome.
          ...(slug ? { slug } : {}),
          title: form.title,
          description: form.description,
          theme: { logoUrl: form.logoUrl || null },
          items,
        }),
      })
      setForm(emptyForm)
      setFormOpen(false)
      notify('Smartlink criado.')
      await loadAll()
    } catch (error) {
      notify(messageOf(error, 'Não foi possível criar o Smartlink agora.'), 'error')
    } finally {
      setCreating(false)
    }
  }

  async function remove(id, label = '') {
    if (removingId !== null || !window.confirm(label ? `Excluir o Smartlink “${label}”?` : 'Excluir este Smartlink?')) return
    setRemovingId(id)
    try {
      await apiFetch(`/api/smartlinks/${id}`, { method: 'DELETE' })
      setSmartlinks(current => current.filter(item => item.id !== id))
      notify('Smartlink removido.')
    } catch (error) {
      notify(messageOf(error, 'Não foi possível excluir agora.'), 'error')
    } finally {
      setRemovingId(null)
    }
  }

  async function copyAddress(link) {
    const address = `${window.location.origin}/go/${link.slug}`
    try {
      await navigator.clipboard.writeText(address)
      setCopiedId(link.id)
      window.clearTimeout(copiedTimer.current)
      copiedTimer.current = window.setTimeout(() => setCopiedId(null), 2500)
    } catch {
      notify(`Não foi possível copiar. O endereço é ${address}`, 'error')
    }
  }

  function startSlugEdit(link) {
    setEditingId(link.id)
    setEditingSlug(link.slug || '')
  }

  async function saveSlug(id) {
    if (savingSlug) return
    setSavingSlug(true)
    try {
      const updated = await apiFetch(`/api/smartlinks/${id}`, { method: 'PATCH', body: JSON.stringify({ slug: editingSlug }) })
      setSmartlinks(current => current.map(link => link.id === id ? { ...link, slug: updated?.slug ?? link.slug } : link))
      setEditingId(null)
      notify('URL personalizada atualizada.')
    } catch (error) {
      notify(messageOf(error, 'Não foi possível salvar a URL agora.'), 'error')
    } finally {
      setSavingSlug(false)
    }
  }

  const linkLines = form.links.split('\n').filter(line => line.trim())
  const validLinks = linkLines.map(parseLinkLine).filter(isPublishableItem)
  const ignoredLines = linkLines.length - validLinks.length
  const showInlineForm = !loading && !loadError && !smartlinks.length
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const submitButton = (block = true) => <button type="submit" form={FORM_ID} className={`ds-btn ds-btn--primary${block ? ' ds-btn--block' : ''}`} disabled={uploadingLogo || creating}>
    {creating ? <><span className="ds-spinner" aria-hidden="true" />Criando…</> : <><Icon name="plus" />Criar Smartlink</>}
  </button>

  const createForm = <form id={FORM_ID} className="sl-compose" onSubmit={save}>
    <fieldset className="sl-group">
      <legend className="sl-group__title">Identidade</legend>
      <div className="sl-logo">
        <span className="sl-logo__preview">{form.logoUrl ? <img src={form.logoUrl} alt="Prévia da logo da loja" /> : <Icon name="image" />}</span>
        <div className="sl-logo__text">
          <p className="ds-label">Logo da loja</p>
          <p className="ds-hint">PNG, JPG, GIF ou WebP. Aparece no centro da página pública.</p>
          <div className="sl-logo__actions">
            <label className="ds-btn ds-btn--secondary ds-btn--sm sl-filebtn">
              {uploadingLogo ? <><span className="ds-spinner" aria-hidden="true" />Enviando…</> : <><Icon name="upload" size={16} />{form.logoUrl ? 'Trocar logo' : 'Adicionar logo'}</>}
              <input className="sl-fileinput" type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={changeLogo} disabled={uploadingLogo} />
            </label>
            {form.logoUrl && <button type="button" className="ds-btn ds-btn--danger ds-btn--sm" onClick={() => setForm(current => ({ ...current, logoUrl: '' }))}>Remover</button>}
          </div>
        </div>
      </div>
      <div className="ds-field">
        <label className="ds-label" htmlFor="sl-name">Nome interno</label>
        <input id="sl-name" className="ds-input" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Perfil principal" required />
      </div>
      <div className="ds-field">
        <label className="ds-label" htmlFor="sl-title">Título público</label>
        <input id="sl-title" className="ds-input" value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder="Nome da loja" />
      </div>
      <div className="ds-field">
        <label className="ds-label" htmlFor="sl-description">Descrição</label>
        <textarea id="sl-description" className="ds-textarea sl-description" value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} placeholder="Uma frase sobre a loja ou sua marca" />
      </div>
    </fieldset>

    <fieldset className="sl-group">
      <legend className="sl-group__title">Endereço</legend>
      <div className="ds-field">
        <div className="ds-field__top"><label className="ds-label" htmlFor="sl-slug">URL personalizada</label><span className="ds-label__req">opcional</span></div>
        <span className="sl-slug"><span className="sl-slug__prefix" aria-hidden="true">/go/</span><input id="sl-slug" className="ds-input" value={form.slug} onChange={event => setForm(current => ({ ...current, slug: event.target.value }))} placeholder="meu-ecoo-midia" maxLength="60" /></span>
        <p className="ds-hint">Letras, números e hífens, com pelo menos 3 caracteres. Em branco, o endereço é gerado a partir do nome. Se já estiver em uso, você recebe um aviso.</p>
        <p className="sl-preview">Sua URL: <strong>{origin}/go/{previewSlug(form.slug || form.name)}</strong></p>
      </div>
    </fieldset>

    <fieldset className="sl-group">
      <legend className="sl-group__title">Links</legend>
      <div className="ds-field">
        <div className="ds-field__top">
          <label className="ds-label" htmlFor="sl-links">Um link por linha</label>
          {linkLines.length > 0 && <span className="ds-counter"><span className="ds-num">{linkLines.length}</span> {linkLines.length === 1 ? 'linha' : 'linhas'}</span>}
        </div>
        <textarea ref={linksRef} id="sl-links" className="ds-textarea sl-links" value={form.links} onChange={event => setForm(current => ({ ...current, links: event.target.value }))} placeholder={'https://exemplo.com\nInstagram | https://instagram.com/'} required aria-describedby="sl-links-help sl-links-check" />
        <p className="ds-hint" id="sl-links-help">Escreva <code>Texto | https://endereço</code> ou só o endereço. Só endereços com <strong>https://</strong> entram na página.</p>
        {linkLines.length > 0 && <p className="sl-check" id="sl-links-check" data-tone={ignoredLines ? 'warning' : 'success'} aria-live="polite">
          <Icon name={ignoredLines ? 'alertTriangle' : 'checkCircle'} size={16} />
          {validLinks.length} {validLinks.length === 1 ? 'link válido' : 'links válidos'}{ignoredLines ? ` · ${ignoredLines} ${ignoredLines === 1 ? 'linha será ignorada' : 'linhas serão ignoradas'} (precisa de texto e https://)` : ''}
        </p>}
      </div>
    </fieldset>

    {showInlineForm && submitButton()}
  </form>

  return (
    <div className="ds-page sl" data-ds-root>
      <header className="ds-pagehead sl-head">
        <div className="ds-pagehead__text">
          <p className="ds-eyebrow">Link na bio</p>
          <h1 className="ds-pagehead__title">Smartlinks</h1>
          <p className="ds-pagehead__lede">Uma página pública para reunir Instagram, WhatsApp, site, YouTube, cursos e produtos, com contagem de cliques em cada link.</p>
        </div>
        {!showInlineForm && !loading && !loadError && <div className="ds-pagehead__actions">
          <button type="button" className="ds-btn ds-btn--primary" onClick={() => setFormOpen(true)}><Icon name="plus" />Novo Smartlink</button>
        </div>}
      </header>

      {loadError && <div className="ds-alert" data-tone="danger" role="alert">
        <Icon name="alertCircle" className="ds-alert__icon" />
        <p className="ds-alert__title">Não foi possível carregar seus Smartlinks</p>
        <p className="ds-alert__text">{loadError}</p>
        <div className="ds-alert__actions"><button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={loadAll} disabled={loading}>Tentar de novo</button></div>
      </div>}

      {loading && !smartlinks.length
        ? <div aria-busy="true"><p className="ds-sr-only" aria-live="polite">Carregando Smartlinks…</p>{[1, 2].map(item => <span className="ds-skel sl-skel" key={item} />)}</div>
        : showInlineForm
          ? <section className="sl-start" aria-labelledby="sl-start-title">
              <div className="sl-start__intro">
                <span className="ds-icontile ds-icontile--lg" aria-hidden="true"><Icon name="link" /></span>
                <h2 className="ds-empty__title" id="sl-start-title">Crie sua primeira página de links</h2>
                <p className="ds-empty__text">Divulgue todos os seus canais em um só lugar. A logo da loja fica no centro da página pública e a marca Meu Ecoo aparece discreta no canto.</p>
              </div>
              <div className="sl-start__body">{createForm}</div>
            </section>
          : smartlinks.length > 0 && <section className="sl-list" aria-labelledby="sl-list-title" aria-busy={loading || undefined}>
              <h2 className="sl-list__title" id="sl-list-title">Seus Smartlinks <span className="ds-badge" data-tone="outline"><span className="ds-num">{smartlinks.length}</span><span className="ds-sr-only"> páginas</span></span></h2>
              <ul className="sl-pages">
                {smartlinks.map(link => <SmartlinkRow
                  key={link.id}
                  link={link}
                  editing={editingId === link.id}
                  editingSlug={editingSlug}
                  savingSlug={savingSlug}
                  removing={removingId === link.id}
                  copied={copiedId === link.id}
                  onCopy={copyAddress}
                  onStartEdit={startSlugEdit}
                  onCancelEdit={() => setEditingId(null)}
                  onChangeSlug={setEditingSlug}
                  onSaveSlug={saveSlug}
                  onRemove={remove}
                />)}
              </ul>
              <p className="ds-sr-only" role="status">{copiedId !== null ? 'Link copiado.' : ''}</p>
            </section>}

      {/* Folha do DS: prende o foco, fecha no Escape, trava a rolagem e devolve o foco ao "Novo Smartlink". */}
      {!showInlineForm && <Sheet
        open={formOpen}
        onClose={() => { if (!creating) setFormOpen(false) }}
        eyebrow="Novo Smartlink"
        title="Sua central de links"
        size="lg"
        className="sl-sheet"
        footer={<>
          <button type="button" className="ds-btn ds-btn--quiet" onClick={() => setFormOpen(false)} disabled={creating}>Cancelar</button>
          {submitButton(false)}
        </>}
      >
        {createForm}
      </Sheet>}
    </div>
  )
}
