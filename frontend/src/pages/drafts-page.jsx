import { useCallback, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import { useApiResource } from '../hooks/use-api-resource.js'
import { useToast } from '../components/ui/toast.jsx'
import { Icon, NetworkGlyph } from '../components/ui/icon.jsx'
import { OverflowMenu } from '../components/ui/overflow-menu.jsx'

const SCHEDULER_AUTOSAVE_KEY = 'meu-ecoo:scheduler-autosave'
const AI_GENERATION_TIMEOUT_MS = 60_000
const PLATFORM_LABELS = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', tiktok: 'TikTok' }

function mediaItemsOf(draft) {
  if (Array.isArray(draft.mediaItems) && draft.mediaItems.length) return draft.mediaItems
  if (Array.isArray(draft.media_items) && draft.media_items.length) return draft.media_items
  return draft.mediaPath || draft.media_path ? [{ path: draft.mediaPath || draft.media_path, type: draft.mediaType || draft.media_type }] : []
}

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
  if (!value) return 'Data não informada'
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function DraftMedia({ draft }) {
  const media = mediaItemsOf(draft)
  if (!media.length) return <span className="bau-thumb" data-kind="text" aria-hidden="true"><Icon name="compose" size={20} /></span>
  const first = media[0]
  const source = first.path || first.url || first.mediaUrl
  const isVideo = first.type === 'video' || first.type === 'VIDEO'
  return <span className="bau-thumb" data-kind={isVideo ? 'video' : 'image'}>
    {source && !isVideo ? <img src={source} alt="Prévia do rascunho" /> : <Icon name={isVideo ? 'video' : 'image'} size={20} />}
    {media.length > 1 && <b className="bau-thumb__more">+{media.length - 1}</b>}
  </span>
}

export function DraftsPage({ onNavigate }) {
  const [text, setText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [expandedDraftId, setExpandedDraftId] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [formError, setFormError] = useState('')
  const load = useCallback(() => apiFetch('/api/drafts').then(data => data.drafts || []), [])
  const { value: drafts, loading, error, setError, reload } = useApiResource(load, [])
  const notify = useToast()

  const visibleDrafts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return drafts.filter(draft => {
      const isTemplate = Boolean(draft.is_template || draft.isTemplate)
      const content = `${draft.title || ''} ${textOf(draft)} ${inferredPlatformsOf(draft).join(' ')}`.toLowerCase()
      return (!query || content.includes(query)) && (filter === 'all' || (filter === 'templates' ? isTemplate : !isTemplate))
    })
  }, [drafts, filter, search])

  async function generateIdeas(event) {
    event.preventDefault()
    const content = text.trim()
    if (!content) return setFormError('Escreva um tema ou instrução para o sistema inteligente gerar ideias.')
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
      await Promise.all(ideas.map(idea => apiFetch('/api/drafts', { method: 'POST', body: JSON.stringify(idea) })))
      setText('')
      await reload()
      notify(`${ideas.length} ${ideas.length === 1 ? 'ideia gerada' : 'ideias geradas'} e salvas no Baú de Ideias.`)
    }
    catch (caught) { setFormError(caught.message); notify(caught.message, 'error') }
    finally { setGenerating(false) }
  }

  async function remove(id) {
    if (!window.confirm('Excluir esta ideia?')) return
    try { await apiFetch(`/api/drafts/${id}`, { method: 'DELETE' }); await reload(); notify('Ideia excluída.') }
    catch (caught) { setError(caught.message); notify(caught.message, 'error') }
  }

  async function clearIdeas() {
    if (!drafts.length || !window.confirm('Esvaziar o Baú de Ideias? Todas as ideias salvas serão excluídas.')) return
    try {
      await apiFetch('/api/drafts', { method: 'DELETE' })
      await reload()
      notify('Baú de Ideias esvaziado.')
    } catch (caught) { setError(caught.message); notify(caught.message, 'error') }
  }

  function useDraft(draft) {
    const platforms = inferredPlatformsOf(draft)
    const textByPlatform = objectField(draft.text_by_platform || draft.textByPlatform)
    const titleByPlatform = objectField(draft.title_by_platform || draft.titleByPlatform)
    localStorage.setItem(SCHEDULER_AUTOSAVE_KEY, JSON.stringify({
      text: textOf(draft),
      selected: platforms.length ? platforms : ['instagram'],
      publishNow: false,
      date: '',
      textByPlatform,
      titleByPlatform,
      youtubeTitle: draft.youtube_title || draft.youtubeTitle || '',
      youtubeVisibility: draft.youtube_visibility || draft.youtubeVisibility || 'public',
      youtubeMadeForKids: draft.youtube_made_for_kids == null ? '' : String(draft.youtube_made_for_kids),
      youtubeFormat: draft.youtube_format || draft.youtubeFormat || '',
      igFormat: draft.ig_format || draft.igFormat || 'post',
      facebookFormat: draft.facebook_format || draft.facebookFormat || 'post',
      tiktokPrivacyLevel: draft.tiktok_privacy_level || draft.tiktokPrivacyLevel || 'PUBLIC_TO_EVERYONE',
      savedAt: new Date().toISOString()
    }))
    notify('Ideia carregada no Meu Post. Adicione sua mídia e publique.')
    onNavigate?.('agendador')
  }

  const templatesCount = drafts.filter(draft => Boolean(draft.is_template || draft.isTemplate)).length
  const mediaCount = drafts.filter(draft => mediaItemsOf(draft).length > 0).length

  const filtered = Boolean(search || filter !== 'all')

  return <div className="ds-page bau" data-ds-root>
    <header className="ds-pagehead">
      <div className="ds-pagehead__text">
        <p className="ds-eyebrow">Ideias e modelos</p>
        <h1 className="ds-pagehead__title">Baú de Ideias</h1>
        <p className="ds-pagehead__lede">Transforme um tema em três ideias, escolha uma e continue no Meu Post para revisar e agendar.</p>
      </div>
      <div className="ds-pagehead__actions">
        <button type="button" className="ds-btn ds-btn--secondary" onClick={() => reload().catch(() => {})} disabled={loading}>
          <Icon name="refresh" />Atualizar
        </button>
        <OverflowMenu label="Mais ações do Baú de Ideias" size="md" items={[{ label: 'Esvaziar Baú', icon: 'trash', danger: true, disabled: !drafts.length, onSelect: clearIdeas }]} />
      </div>
    </header>

    <section className="bau-status" aria-label="Resumo do Baú de Ideias" aria-busy={loading}>
      <div className="ds-stats" style={{ '--cols': 3 }}>
        <div className="ds-stat"><p className="ds-stat__label">Total de ideias</p><p className="ds-stat__value">{loading ? '—' : drafts.length}</p><p className="ds-stat__caption">Conteúdos salvos</p></div>
        <div className="ds-stat"><p className="ds-stat__label">Modelos</p><p className="ds-stat__value">{loading ? '—' : templatesCount}</p><p className="ds-stat__caption">Prontos para reutilizar</p></div>
        <div className="ds-stat"><p className="ds-stat__label">Com mídia</p><p className="ds-stat__value">{loading ? '—' : mediaCount}</p><p className="ds-stat__caption">Fotos ou vídeos anexados</p></div>
      </div>
    </section>

    <div className="bau-body">
      <section className="bau-compose" aria-labelledby="bau-compose-title">
        <h2 className="ds-head__title" id="bau-compose-title">Gerar novas ideias</h2>
        <form className="bau-compose__form" onSubmit={generateIdeas} noValidate>
          <div className="ds-field">
            <div className="ds-field__top">
              <label className="ds-label" htmlFor="bau-theme">Tema ou instrução</label>
              <span className="ds-counter" id="bau-theme-count" data-level={text.length > 4800 ? 'near' : undefined}>{text.length}/5000</span>
            </div>
            <textarea
              id="bau-theme"
              className="ds-textarea bau-compose__textarea"
              value={text}
              onChange={event => { setText(event.target.value); if (formError) setFormError('') }}
              placeholder="Ex.: bastidores de uma gravação, para quem está começando, tom leve"
              maxLength={5000}
              aria-invalid={formError ? 'true' : undefined}
              aria-describedby="bau-theme-hint bau-theme-count"
            />
            <p className="ds-hint" id="bau-theme-hint">Descreva o tema, o público, o objetivo ou o tom. O sistema inteligente gera 3 ideias para o Instagram.</p>
            {formError && <p className="ds-fieldmsg" data-tone="danger" role="alert"><Icon name="alertCircle" size={16} />{formError}</p>}
          </div>
          <button className="ds-btn ds-btn--primary ds-btn--block" type="submit" disabled={generating}>
            {generating ? <><span className="ds-spinner" aria-hidden="true" />Gerando ideias...</> : <><Icon name="sparkle" />Gerar ideias</>}
          </button>
        </form>
      </section>

      <section className="bau-list" aria-labelledby="bau-list-title">
        <div className="ds-head">
          <div className="ds-head__text">
            <h2 className="ds-head__title" id="bau-list-title">Ideias salvas <span className="ds-badge" data-tone="outline">{visibleDrafts.length} {visibleDrafts.length === 1 ? 'item' : 'itens'}</span></h2>
          </div>
        </div>
        <div className="ds-filterbar bau-list__filters">
          <label className="ds-inputwrap bau-list__search">
            <Icon name="search" />
            <span className="ds-sr-only">Buscar ideia</span>
            <input className="ds-input" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por texto, título ou rede..." />
          </label>
          <div className="ds-seg" role="group" aria-label="Filtrar ideias">
            {[['all', 'Todas'], ['drafts', 'Em andamento'], ['templates', 'Modelos']].map(([key, label]) => <button type="button" className="ds-seg__opt" aria-pressed={filter === key} onClick={() => setFilter(key)} key={key}>{label}</button>)}
          </div>
        </div>

        {error && <div className="ds-alert bau-list__error" data-tone="danger" role="alert">
          <Icon name="alertCircle" className="ds-alert__icon" />
          <p className="ds-alert__text">{error}</p>
          <div className="ds-alert__actions"><button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={() => reload().catch(() => {})}><Icon name="refresh" size={16} />Tentar novamente</button></div>
        </div>}

        {loading
          ? <div aria-busy="true">
            <p className="ds-sr-only" aria-live="polite">Carregando ideias...</p>
            {[1, 2, 3].map(item => <div className="bau-skel" key={item}><span className="ds-skel" style={{ width: 72, height: 72, borderRadius: 12 }} /><div className="ds-stack" style={{ '--gap': '10px', flex: 1 }}><span className="ds-skel" style={{ width: '30%' }} /><span className="ds-skel" style={{ width: '70%', height: 16 }} /><span className="ds-skel" style={{ width: '90%' }} /></div></div>)}
          </div>
          : visibleDrafts.length
            ? <ul className="ds-list bau-ideas">
              {visibleDrafts.map(draft => {
                const template = Boolean(draft.is_template || draft.isTemplate)
                const platforms = inferredPlatformsOf(draft)
                const fullText = textOf(draft)
                const expanded = expandedDraftId === draft.id
                const typeLabel = template ? 'Modelo' : draft.title === 'Autosave' ? 'Rascunho automático' : 'Ideia gerada'
                const title = draft.title || 'Ideia sem título'
                return <li className="bau-idea" key={draft.id}>
                  <DraftMedia draft={draft} />
                  <div className="bau-idea__body">
                    <p className="bau-idea__meta">
                      <span className="ds-badge" data-tone={template ? 'info' : 'gold'}>{typeLabel}</span>
                      <time className="ds-meta ds-num">{formatDraftDate(draft.criado_em || draft.createdAt)}</time>
                    </p>
                    <h3 className="bau-idea__title">{title}</h3>
                    <p className="bau-idea__text" data-expanded={expanded ? 'true' : undefined}>{fullText || 'Sem texto adicionado ainda.'}</p>
                    {fullText.length > 150 && <button type="button" className="ds-link bau-idea__more" aria-expanded={expanded} onClick={() => setExpandedDraftId(expanded ? null : draft.id)}>{expanded ? 'Mostrar menos' : 'Ver texto completo'}</button>}
                    <div className="bau-idea__foot">
                      <span className="bau-idea__nets" aria-label={platforms.length ? platforms.map(platform => PLATFORM_LABELS[platform] || platform).join(', ') : 'Nenhuma rede selecionada'}>
                        {platforms.length ? platforms.map(platform => <NetworkGlyph network={platform} size={16} key={platform} />) : <span className="ds-meta">Nenhuma rede selecionada</span>}
                      </span>
                      <span className="bau-idea__actions">
                        <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={() => useDraft(draft)}>Criar post<Icon name="arrow" size={16} /></button>
                        <OverflowMenu label={`Mais ações para ${title}`} items={[{ label: 'Excluir', icon: 'trash', danger: true, onSelect: () => remove(draft.id) }]} />
                      </span>
                    </div>
                  </div>
                </li>
              })}
            </ul>
            : !error && <div className="ds-empty bau-empty">
              <span className="ds-icontile ds-icontile--lg" aria-hidden="true"><Icon name={filtered ? 'search' : 'chest'} /></span>
              <p className="ds-empty__title ds-empty__title--sm">{filtered ? 'Nenhuma ideia encontrada' : <>Seu baú está vazio, <em className="ds-em">por enquanto.</em></>}</p>
              <p className="ds-empty__text">{filtered ? 'Tente mudar os filtros ou a busca.' : 'Descreva um tema ao lado para gerar suas primeiras ideias.'}</p>
              {filtered && <div className="ds-empty__actions"><button type="button" className="ds-go" onClick={() => { setSearch(''); setFilter('all') }}>Limpar filtros<Icon name="arrow" /></button></div>}
            </div>}
      </section>
    </div>
  </div>
}
