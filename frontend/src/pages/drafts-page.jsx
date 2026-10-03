import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { composerDraftFromPost, mediaItemsOf, mediaSelectionOf, openInComposer } from '../lib/composer-handoff.js'
import { apiFetch } from '../lib/api.js'
import { useApiResource } from '../hooks/use-api-resource.js'
import { useToast } from '../components/ui/toast.jsx'
import { useConfirm } from '../components/ui/confirm-dialog.jsx'
import { Icon, NetworkGlyph } from '../components/ui/icon.jsx'
import { OverflowMenu } from '../components/ui/overflow-menu.jsx'
import { FilterGroup, FilterOption, FilterSheet, FiltersButton } from '../components/ui/filters.jsx'
import { useIsPhone } from '../lib/breakpoints.js'
import { PLATFORM_LABELS } from '../lib/platforms.js'
import { KitImportDialog } from '../components/drafts/kit-import-dialog.jsx'

const AI_GENERATION_TIMEOUT_MS = 60_000
// O /api/ai/generate recusa instruções com mais de 4000 caracteres (o mesmo limite do Assistente).
const THEME_MAX_LENGTH = 4000
// A caixa do tema começa com três linhas e cresce enquanto a pessoa escreve, até esta altura.
const THEME_MAX_HEIGHT = 240
const IDEA_FILTERS = [['all', 'Todas'], ['drafts', 'Em andamento'], ['templates', 'Modelos']]

function platformsOf(draft) {
  return Array.isArray(draft.platforms) ? draft.platforms.filter(Boolean) : []
}

function objectField(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function textOf(draft) {
  if (draft.text?.trim()) return draft.text.trim()
  const textByPlatform = objectField(draft.text_by_platform || draft.textByPlatform)
  return Object.values(textByPlatform).filter(value => typeof value === 'string' && value.trim()).join('\n\n')
}

function inferredPlatformsOf(draft) {
  const selected = platformsOf(draft)
  if (selected.length) return selected
  const textByPlatform = objectField(draft.text_by_platform || draft.textByPlatform)
  const keys = Object.keys(textByPlatform)
  return keys.filter(key => PLATFORM_LABELS[key] || key === 'tiktokDescription').map(key => key === 'tiktokDescription' ? 'tiktok' : key)
}

function formatDraftDate(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return 'Data não informada'
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function listNames(names) {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : names[0] || ''
}

function shortText(text, limit = 60) {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  return value.length > limit ? `${value.slice(0, limit - 1).trimEnd()}…` : value
}

// A miniatura é só visual; o tipo de mídia (e quantas há) vai em texto para o leitor de tela.
function DraftMedia({ draft }) {
  const media = mediaItemsOf(draft)
  if (!media.length) return <span className="bau-thumb" data-kind="text"><Icon name="compose" size={20} /><span className="ds-sr-only">Somente texto</span></span>
  const first = media[0]
  const source = first.path || first.url || first.mediaUrl
  const isVideo = first.type === 'video' || first.type === 'VIDEO'
  const extra = media.length - 1
  return <span className="bau-thumb" data-kind={isVideo ? 'video' : 'image'}>
    {source && !isVideo ? <img src={source} alt="" /> : <Icon name={isVideo ? 'video' : 'image'} size={20} />}
    {extra > 0 && <b className="bau-thumb__more" aria-hidden="true">+{extra}</b>}
    <span className="ds-sr-only">{isVideo ? 'Vídeo' : 'Imagem'}{extra > 0 ? ` e mais ${extra} ${extra === 1 ? 'mídia' : 'mídias'}` : ''}</span>
  </span>
}

export function DraftsPage({ onNavigate }) {
  const [text, setText] = useState('')
  const [generating, setGenerating] = useState(false)
  const generatingRef = useRef(false)
  const [expandedDraftId, setExpandedDraftId] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')
  const [hasLoaded, setHasLoaded] = useState(false)
  // Depois de excluir, o foco vai para a ideia seguinte (ou a anterior, ou o título da lista),
  // em vez de cair no início da página junto com o "…" que sumiu.
  const [focusAfterRemoval, setFocusAfterRemoval] = useState(null)
  const themeRef = useRef(null)
  const listRef = useRef(null)
  const phone = useIsPhone()
  // A API entrega as ideias em páginas (até 100). A busca e os filtros do Baú são feitos aqui, então
  // todas as páginas são lidas (até 2.000 ideias); antes só as 50 primeiras apareciam.
  const load = useCallback(async () => {
    const all = []
    let offset = 0
    for (let page = 0; page < 20; page += 1) {
      const data = await apiFetch(`/api/drafts?limit=100&offset=${offset}`)
      const batch = Array.isArray(data?.drafts) ? data.drafts : []
      all.push(...batch)
      if (!data?.hasMore || !batch.length) break
      offset += batch.length
    }
    return all
  }, [])
  // `error` é só da lista; excluir e esvaziar mostram o próprio aviso.
  const { value: drafts, loading, error, reload } = useApiResource(load, [])
  const notify = useToast()
  const [kitOpen, setKitOpen] = useState(false)
  const { confirm, confirmDialog } = useConfirm()

  useEffect(() => { if (!loading) setHasLoaded(true) }, [loading])
  const firstLoad = loading && !hasLoaded
  const unknown = firstLoad || (Boolean(error) && !drafts.length)

  const visibleDrafts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return drafts.filter(draft => {
      const isTemplate = Boolean(draft.is_template || draft.isTemplate)
      const content = `${draft.title || ''} ${textOf(draft)} ${inferredPlatformsOf(draft).join(' ')}`.toLowerCase()
      return (!query || content.includes(query)) && (filter === 'all' || (filter === 'templates' ? isTemplate : !isTemplate))
    })
  }, [drafts, filter, search])

  useLayoutEffect(() => {
    const field = themeRef.current
    if (!field) return
    field.style.height = ''
    if (field.scrollHeight > field.clientHeight) field.style.height = `${Math.min(field.scrollHeight + 2, THEME_MAX_HEIGHT)}px`
  }, [text])

  useEffect(() => {
    if (focusAfterRemoval == null) return
    const items = listRef.current ? [...listRef.current.children] : []
    const target = items[focusAfterRemoval] || items[focusAfterRemoval - 1]
    const control = target?.querySelector('.bau-idea__use')
    if (control) control.focus()
    else document.getElementById('bau-list-title')?.focus()
    setFocusAfterRemoval(null)
  }, [focusAfterRemoval])

  async function generateIdeas(event) {
    event.preventDefault()
    if (generatingRef.current) return
    const content = text.trim()
    if (!content) return setFormError('Escreva um tema ou instrução para o sistema inteligente gerar ideias.')
    generatingRef.current = true
    setGenerating(true)
    setFormError('')
    try {
      // Este é o mesmo contrato usado pelo Meu Post: mesmo endpoint,
      // fallback de modelo e regras de adaptação por plataforma.
      const generated = await apiFetch('/api/ai/generate', {
        method: 'POST',
        timeoutMs: AI_GENERATION_TIMEOUT_MS,
        body: JSON.stringify({ instrucao: content, plataformas: ['instagram'], quantidade: 3, tom: 'profissional' }),
      })
      const ideas = (generated.posts || [])
        .map(post => ({
          title: post.titulo || post.title || `Ideia sobre ${content.slice(0, 48)}${content.length > 48 ? '…' : ''}`,
          text: String(post.texto || post.text || post.caption || ''),
          platforms: Array.isArray(post.plataformas) && post.plataformas.length ? post.plataformas : ['instagram'],
        }))
        .filter(idea => idea.text.trim())
      if (!ideas.length) throw new Error('O sistema inteligente não retornou nenhuma ideia válida. Tente reformular o tema.')
      // Cada ideia é gravada por conta própria: se uma falhar, as outras ficam salvas e a lista recarrega,
      // para que tentar de novo não duplique as que já entraram.
      const results = await Promise.allSettled(ideas.map(idea => apiFetch('/api/drafts', { method: 'POST', body: JSON.stringify(idea) })))
      const saved = results.filter(result => result.status === 'fulfilled').length
      await reload().catch(() => {})
      if (!saved) throw results.find(result => result.status === 'rejected').reason
      setText('')
      if (saved < ideas.length) {
        const message = `${saved} de ${ideas.length} ideias foram salvas no Baú de Ideias. As outras não entraram; gere de novo se quiser mais.`
        setFormError(message)
        notify(message, 'error')
      } else {
        notify(`${ideas.length} ${ideas.length === 1 ? 'ideia gerada' : 'ideias geradas'} e salvas no Baú de Ideias.`)
      }
    }
    catch (caught) { setFormError(caught.message); notify(caught.message, 'error') }
    finally {
      generatingRef.current = false
      setGenerating(false)
    }
  }

  async function remove(draft) {
    const ok = await confirm({
      title: 'Excluir esta ideia?',
      description: 'Ela sai do Baú de Ideias e não pode ser recuperada.',
      confirmLabel: 'Excluir',
    })
    if (!ok) return
    const index = visibleDrafts.findIndex(item => item.id === draft.id)
    setActionError('')
    try { await apiFetch(`/api/drafts/${draft.id}`, { method: 'DELETE' }) }
    catch (caught) { setActionError(caught.message); notify(caught.message, 'error'); return }
    notify('Ideia excluída.')
    await reload().catch(() => {})
    setFocusAfterRemoval(Math.max(index, 0))
  }

  // A importação de kit grava cada item por conta própria (como as ideias geradas em lote): o que entrou
  // já está no Baú, então a lista recarrega mesmo quando parte do kit falha.
  function kitImported(result) {
    reload().catch(() => {})
    if (result.falharam) notify(`${result.criados} de ${result.total} itens do kit entraram no Baú de Ideias.`, 'error')
    else notify(`${result.criados} ${result.criados === 1 ? 'item do kit entrou' : 'itens do kit entraram'} no Baú de Ideias.`)
  }

  async function clearIdeas() {
    if (!drafts.length) return
    const ok = await confirm({
      title: 'Esvaziar o Baú de Ideias?',
      description: drafts.length === 1 ? 'A ideia salva será excluída. Não dá para desfazer.' : `Todas as ${drafts.length} ideias salvas serão excluídas. Não dá para desfazer.`,
      confirmLabel: 'Esvaziar',
    })
    if (!ok) return
    setActionError('')
    try { await apiFetch('/api/drafts', { method: 'DELETE' }) }
    catch (caught) { setActionError(caught.message); notify(caught.message, 'error'); return }
    notify('Baú de Ideias esvaziado.')
    await reload().catch(() => {})
  }

  function startPostFromDraft(draft) {
    const platforms = inferredPlatformsOf(draft)
    const media = mediaItemsOf(draft)
    const opened = openInComposer({
      draft: composerDraftFromPost({ ...draft, platforms, text: textOf(draft) }),
      media: media.map(item => mediaSelectionOf(item, 'Mídia da ideia')),
    })
    if (!opened) { notify('O navegador não deixou guardar o rascunho. Libere espaço do site e tente de novo.', 'error'); return }
    notify(media.length ? 'Ideia carregada no Meu Post, com a mídia dela.' : 'Ideia carregada no Meu Post. Adicione sua mídia e publique.')
    onNavigate?.('agendador')
  }

  const templatesCount = drafts.filter(draft => Boolean(draft.is_template || draft.isTemplate)).length
  const mediaCount = drafts.filter(draft => mediaItemsOf(draft).length > 0).length
  const filtered = Boolean(search.trim() || filter !== 'all')
  const themeLevel = text.length >= THEME_MAX_LENGTH - 200 ? 'near' : undefined
  const clearFilters = () => { setSearch(''); setFilter('all') }
  const searchField = <label className="ds-inputwrap bau-list__search">
    <Icon name="search" />
    <span className="ds-sr-only">Buscar ideia</span>
    <input className="ds-input" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={phone ? 'Buscar ideia...' : 'Buscar por texto, título ou rede...'} />
  </label>

  return <div className="ds-page bau" data-ds-root>
    <header className="ds-pagehead">
      <div className="ds-pagehead__text">
        <p className="ds-eyebrow">Ideias e modelos</p>
        <h1 className="ds-pagehead__title">Baú de Ideias</h1>
        <p className="ds-pagehead__lede">Transforme um tema em três ideias, escolha uma e continue no Meu Post para revisar e agendar.</p>
        <p className="bau-counts">
          {unknown
            ? firstLoad ? <span className="ds-skel bau-counts__skel" aria-hidden="true" /> : null
            : <>
              <span><strong className="ds-num">{drafts.length}</strong> {drafts.length === 1 ? 'ideia salva' : 'ideias salvas'}</span>
              <span><strong className="ds-num">{templatesCount}</strong> {templatesCount === 1 ? 'modelo' : 'modelos'}</span>
              <span><strong className="ds-num">{mediaCount}</strong> com mídia</span>
            </>}
        </p>
      </div>
      <div className="ds-pagehead__actions">
        <button type="button" className="ds-btn ds-btn--secondary" onClick={() => setKitOpen(true)}>
          <Icon name="upload" />Importar kit
        </button>
        <button type="button" className="ds-btn ds-btn--secondary" onClick={() => reload().catch(() => {})} disabled={loading}>
          <Icon name="refresh" />Atualizar
        </button>
        <OverflowMenu label="Mais ações do Baú de Ideias" size="md" items={[{ label: 'Esvaziar Baú', icon: 'trash', danger: true, disabled: !drafts.length, onSelect: clearIdeas }]} />
      </div>
    </header>

    <section className="bau-compose" aria-labelledby="bau-compose-title">
      <h2 className="bau-compose__title" id="bau-compose-title">Gerar novas ideias</h2>
      <form className="bau-compose__form" onSubmit={generateIdeas} noValidate>
        <div className="ds-field">
          <div className="ds-field__top">
            <label className="ds-label" htmlFor="bau-theme">Tema ou instrução</label>
            <span className="ds-counter" id="bau-theme-count" data-level={themeLevel}>{text.length}/{THEME_MAX_LENGTH}</span>
          </div>
          <div className="bau-compose__row">
            <textarea
              id="bau-theme"
              ref={themeRef}
              rows={3}
              className="ds-textarea bau-compose__textarea"
              value={text}
              onChange={event => { setText(event.target.value); if (formError) setFormError('') }}
              placeholder="Ex.: bastidores de uma gravação, para quem está começando, tom leve"
              maxLength={THEME_MAX_LENGTH}
              aria-invalid={formError ? 'true' : undefined}
              aria-describedby="bau-theme-hint bau-theme-count"
            />
            <button className="ds-btn ds-btn--primary bau-compose__go" type="submit" disabled={generating}>
              {generating ? <><span className="ds-spinner" aria-hidden="true" />Gerando ideias...</> : <><Icon name="sparkle" />Gerar ideias</>}
            </button>
          </div>
          <p className="ds-hint" id="bau-theme-hint">Descreva o tema, o público, o objetivo ou o tom. O sistema inteligente gera 3 ideias para o Instagram.</p>
          {formError && <p className="ds-fieldmsg" data-tone="danger" role="alert"><Icon name="alertCircle" size={16} />{formError}</p>}
        </div>
      </form>
    </section>

    <section className="bau-list" aria-labelledby="bau-list-title">
      <div className="ds-head">
        <div className="ds-head__text">
          <h2 className="ds-head__title" id="bau-list-title" tabIndex={-1}>Ideias salvas <span className="ds-badge" data-tone="outline">{visibleDrafts.length} {visibleDrafts.length === 1 ? 'item' : 'itens'}</span></h2>
        </div>
      </div>
      {phone
        ? <div className="ds-searchrow bau-list__filters">
          {searchField}
          <FiltersButton count={filter === 'all' ? 0 : 1} open={filtersOpen} onClick={() => setFiltersOpen(true)} />
        </div>
        : <div className="ds-filterbar bau-list__filters">
          {searchField}
          <div className="ds-seg" role="group" aria-label="Filtrar ideias">
            {IDEA_FILTERS.map(([key, label]) => <button type="button" className="ds-seg__opt" aria-pressed={filter === key} onClick={() => setFilter(key)} key={key}>{label}</button>)}
          </div>
        </div>}

      {actionError && <div className="ds-alert bau-list__error" data-tone="danger" role="alert">
        <Icon name="alertCircle" className="ds-alert__icon" />
        <p className="ds-alert__text">{actionError}</p>
        <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-btn--sm ds-alert__close" onClick={() => setActionError('')} aria-label="Dispensar aviso"><Icon name="close" size={16} /></button>
      </div>}

      {error && <div className="ds-alert bau-list__error" data-tone={drafts.length ? 'warning' : 'danger'} role="alert">
        <Icon name={drafts.length ? 'alertTriangle' : 'alertCircle'} className="ds-alert__icon" />
        <p className="ds-alert__title">{drafts.length ? 'Não foi possível atualizar as ideias' : 'Não foi possível carregar as ideias'}</p>
        <p className="ds-alert__text">{drafts.length ? 'Mostrando a última versão carregada.' : 'Nada foi apagado; só não conseguimos mostrar as ideias agora.'}</p>
        <div className="ds-alert__actions"><button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" disabled={loading} onClick={() => reload().catch(() => {})}><Icon name="refresh" size={16} />Tentar novamente</button></div>
      </div>}

      {firstLoad
        ? <div aria-busy="true">
          <p className="ds-sr-only" aria-live="polite">Carregando ideias...</p>
          {[1, 2, 3].map(item => <div className="bau-skel" key={item}><span className="ds-skel bau-skel__thumb" /><div className="ds-stack" style={{ '--gap': '10px', flex: 1 }}><span className="ds-skel" style={{ width: '30%' }} /><span className="ds-skel" style={{ width: '70%', height: 16 }} /><span className="ds-skel" style={{ width: '90%' }} /></div></div>)}
        </div>
        : visibleDrafts.length
          ? <ul className="bau-ideas" ref={listRef}>
            {visibleDrafts.map(draft => {
              const template = Boolean(draft.is_template || draft.isTemplate)
              const platforms = inferredPlatformsOf(draft)
              const names = listNames(platforms.map(platform => PLATFORM_LABELS[platform] || platform))
              const fullText = textOf(draft)
              const expanded = expandedDraftId === draft.id
              const typeLabel = template ? 'Modelo' : draft.title === 'Autosave' ? 'Rascunho automático' : 'Ideia gerada'
              const title = draft.title || 'Ideia sem título'
              const created = draft.criado_em || draft.createdAt
              return <li className="bau-idea" key={draft.id}>
                <DraftMedia draft={draft} />
                <div className="bau-idea__body">
                  <div className="bau-idea__meta">
                    <span className="ds-badge" data-tone={template ? 'info' : 'gold'}>{typeLabel}</span>
                    <time className="ds-meta ds-num bau-idea__date" dateTime={created || undefined}>{formatDraftDate(created)}</time>
                    <span className="bau-idea__menu">
                      <OverflowMenu label={`Mais ações para “${shortText(title)}”`} sheetTitle={shortText(title, 40)} items={[{ label: 'Excluir', icon: 'trash', danger: true, onSelect: () => remove(draft) }]} />
                    </span>
                  </div>
                  <h3 className="bau-idea__title">{title}</h3>
                  <p className="bau-idea__text" id={`bau-text-${draft.id}`} data-expanded={expanded ? 'true' : undefined}>{fullText || 'Sem texto adicionado ainda.'}</p>
                  {fullText.length > 150 && <button type="button" className="ds-link bau-idea__more" aria-expanded={expanded} aria-controls={`bau-text-${draft.id}`} onClick={() => setExpandedDraftId(expanded ? null : draft.id)}>{expanded ? 'Mostrar menos' : 'Ver texto completo'}</button>}
                  <div className="bau-idea__foot">
                    {platforms.length
                      ? <span className="bau-idea__nets" title={names}>
                        {platforms.map(platform => <NetworkGlyph network={platform} size={16} key={platform} />)}
                        <span className="ds-sr-only">Redes: {names}</span>
                      </span>
                      : <span className="ds-meta">Nenhuma rede selecionada</span>}
                    <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm bau-idea__use" onClick={() => startPostFromDraft(draft)}>Criar post<Icon name="arrow" size={16} /></button>
                  </div>
                </div>
              </li>
            })}
          </ul>
          : !error && <div className="ds-empty bau-empty">
            <span className="ds-icontile ds-icontile--lg" aria-hidden="true"><Icon name={filtered ? 'search' : 'chest'} /></span>
            <p className="ds-empty__title ds-empty__title--sm">{filtered ? 'Nenhuma ideia encontrada' : <>Seu baú está vazio, <em className="ds-em">por enquanto.</em></>}</p>
            <p className="ds-empty__text">{filtered ? 'Tente mudar os filtros ou a busca.' : 'Descreva um tema acima para gerar suas primeiras ideias.'}</p>
            {filtered && <div className="ds-empty__actions"><button type="button" className="ds-go" onClick={clearFilters}>Limpar filtros<Icon name="arrow" /></button></div>}
          </div>}
    </section>

    {phone && <FilterSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} value={{ filter }} emptyValue={{ filter: 'all' }} onApply={next => setFilter(next.filter)} title="Filtrar ideias">
      {(pending, setPending) => <FilterGroup title="Tipo">
        {IDEA_FILTERS.map(([value, label]) => <FilterOption key={value} selected={pending.filter === value} onSelect={() => setPending({ ...pending, filter: value })}>{label}</FilterOption>)}
      </FilterGroup>}
    </FilterSheet>}
    <KitImportDialog open={kitOpen} onClose={() => setKitOpen(false)} onImported={kitImported} />
    {confirmDialog}
  </div>
}
