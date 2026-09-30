import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import { useToast } from '../components/ui/toast.jsx'
import { Icon, NetworkGlyph } from '../components/ui/icon.jsx'
import { Select } from '../components/ui/select.jsx'
import { useConfirm } from '../components/ui/confirm-dialog.jsx'
import { FilterGroup, FilterOption, FilterSheet, FiltersButton } from '../components/ui/filters.jsx'
import { useIsPhone } from '../lib/breakpoints.js'
import { MEDIA_ACCEPT, useMediaUpload } from '../hooks/use-media-upload.js'
import { MediaCard } from '../components/library/media-card.jsx'
import { FolderDialog, MediaEditDialog, MediaMoveDialog, MediaPreview } from '../components/library/media-dialogs.jsx'
import { UploadQueue } from '../components/library/upload-queue.jsx'
import { countLabel, shortText } from '../components/library/media-format.js'

const platforms = [
  ['instagram', 'Instagram'],
  ['facebook', 'Facebook'],
  ['youtube', 'YouTube'],
  ['tiktok', 'TikTok'],
]

const suggestionExamples = ['Educação financeira', 'Bastidores do negócio', 'Dicas para iniciantes']
const SUGGESTION_PERIODS = [{ value: 7, label: 'Últimos 7 dias' }, { value: 30, label: 'Últimos 30 dias' }, { value: 90, label: 'Últimos 90 dias' }]

export const MEDIA_LIBRARY_SELECTION_KEY = 'meu-ecoo:media-library-selection'

function platformLabel(platform) {
  return platforms.find(([id]) => id === platform)?.[1] || platform
}

function inferNicheFromInsights(insights) {
  return insights?.nicheComparisons?.[0]?.niche
    || insights?.performanceAnalysis?.comparisons?.find(item => item.topPost?.niche && item.topPost.niche !== 'não identificado')?.topPost?.niche
    || insights?.profileComparison?.find(item => item.niche && item.niche !== 'não identificado')?.niche
    || ''
}

function suggestionText(post) {
  return post?.texto || post?.text || post?.caption || ''
}

/*
 * Media library. What the backend supports and this page offers: list (search by name or tag, folder,
 * pages of 50), upload (signed URL + POST), edit name / folder / tags (PATCH), move to a folder
 * (PATCH folder), delete (DELETE), list and create folders.
 * TODO BACKEND: renaming or deleting a folder and a description/alt text per asset have no route
 * (src/routes/mediaFolders.js, src/routes/mediaAssets.js), so the page does not offer them.
 */
export function MediaLibraryPage({ onNavigate }) {
  const [assets, setAssets] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [folders, setFolders] = useState([])
  const [foldersState, setFoldersState] = useState('loading')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [folder, setFolder] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [preview, setPreview] = useState(null)
  const [editing, setEditing] = useState(null)
  const [moving, setMoving] = useState(null)
  const [dragging, setDragging] = useState(false)
  // Depois de excluir, o foco vai para a mídia seguinte (ou a anterior, ou o título da estante).
  const [focusAfterRemoval, setFocusAfterRemoval] = useState(null)
  const dragDepth = useRef(0)
  const assetsRef = useRef(null)
  const fileInputRef = useRef(null)
  const requestRef = useRef(0)
  const phone = useIsPhone()
  const notify = useToast()
  const { confirm, confirmDialog } = useConfirm()
  const [suggestionNiche, setSuggestionNiche] = useState('')
  const [suggestionDays, setSuggestionDays] = useState(30)
  const [suggestionPlatforms, setSuggestionPlatforms] = useState(['instagram'])
  const [suggestions, setSuggestions] = useState([])
  const [suggestionInsights, setSuggestionInsights] = useState(null)
  const [suggestionLoading, setSuggestionLoading] = useState(false)
  const [savedSuggestions, setSavedSuggestions] = useState([])

  // Espera uma pausa na digitação antes de consultar o servidor.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim() ? searchInput : ''), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const load = useCallback(() => {
    const requestId = ++requestRef.current
    return apiFetch(`/api/media-assets?search=${encodeURIComponent(search)}&folder=${encodeURIComponent(folder)}`).then(data => {
      // Ignora respostas antigas quando a busca muda durante a consulta.
      if (requestId !== requestRef.current) return
      setAssets(data.assets || [])
      setHasMore(Boolean(data.hasMore))
      setLoadError('')
    }).catch(error => { if (requestId === requestRef.current) throw error })
  }, [folder, search])

  // Uma falha de carga vira aviso com "Tentar novamente", não a estante vazia.
  const refresh = useCallback(() => {
    setLoading(true)
    return load()
      .catch(error => setLoadError(error.message || 'Não foi possível carregar a biblioteca.'))
      .finally(() => { setLoading(false); setLoadedOnce(true) })
  }, [load])

  useEffect(() => { refresh() }, [refresh])

  const loadFolders = useCallback(() => apiFetch('/api/media-folders').then(data => {
    setFolders(data.folders || [])
    setFoldersState('ok')
  }), [])

  useEffect(() => {
    loadFolders().catch(() => setFoldersState('error'))
  }, [loadFolders])

  useEffect(() => {
    if (focusAfterRemoval == null) return
    const items = assetsRef.current ? [...assetsRef.current.children] : []
    const target = items[focusAfterRemoval] || items[focusAfterRemoval - 1]
    const control = target?.querySelector('.lib-asset__open')
    if (control) control.focus()
    else document.getElementById('lib-shelf-title')?.focus()
    setFocusAfterRemoval(null)
  }, [focusAfterRemoval])

  const destination = folder || 'Geral'
  const upload = useMediaUpload({
    onFinished: ({ sent, failed }) => {
      if (sent) notify(`${sent} ${sent === 1 ? 'mídia adicionada' : 'mídias adicionadas'} à biblioteca.`)
      if (failed) notify(`${failed} ${failed === 1 ? 'arquivo não foi enviado' : 'arquivos não foram enviados'}. Veja o motivo na lista de envios.`, 'error')
      if (sent) {
        refresh()
        loadFolders().catch(() => setFoldersState('error'))
      }
    },
  })

  function chooseFiles(event) {
    const files = [...(event.target.files || [])]
    event.target.value = ''
    if (files.length) upload.add(files, destination)
  }

  // Arrastar arquivos para a estante envia para a pasta aberta (ou "Geral", com todas as pastas à vista).
  const carriesFiles = event => [...(event.dataTransfer?.types || [])].includes('Files')
  const dropHandlers = phone ? {} : {
    onDragEnter: event => { if (!carriesFiles(event)) return; event.preventDefault(); dragDepth.current += 1; setDragging(true) },
    onDragOver: event => { if (carriesFiles(event)) event.preventDefault() },
    onDragLeave: event => { if (!carriesFiles(event)) return; dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false) },
    onDrop: event => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      const files = [...(event.dataTransfer.files || [])]
      if (files.length) upload.add(files, destination)
    },
  }

  async function loadMore() {
    setLoadingMore(true)
    try {
      const data = await apiFetch(`/api/media-assets?search=${encodeURIComponent(search)}&folder=${encodeURIComponent(folder)}&offset=${assets.length}`)
      setAssets(current => [...current, ...(data.assets || []).filter(item => !current.some(existing => existing.id === item.id))])
      setHasMore(Boolean(data.hasMore))
    } catch (error) { notify(error.message, 'error') } finally { setLoadingMore(false) }
  }

  async function createFolder(name) {
    const data = await apiFetch('/api/media-folders', { method: 'POST', body: JSON.stringify({ name }) })
    const created = data.folder
    setFolders(current => [...current, created].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')))
    setFoldersState('ok')
    setFolder(created.name)
    setFolderDialogOpen(false)
    notify(`Pasta “${created.name}” criada. O que você enviar agora entra nela.`)
  }

  // O PATCH do backend troca as tags pelas enviadas: toda alteração manda as tags atuais junto.
  async function saveAsset(asset, changes) {
    const next = { name: changes.name ?? asset.name, folder: changes.folder ?? asset.folder, tags: changes.tags ?? (asset.tags || []) }
    await apiFetch(`/api/media-assets/${asset.id}`, { method: 'PATCH', body: JSON.stringify(next) })
    const updated = { ...asset, ...next }
    const leavesView = folder && next.folder !== folder
    setAssets(current => leavesView ? current.filter(item => item.id !== asset.id) : current.map(item => (item.id === asset.id ? updated : item)))
    setPreview(current => (current?.id === asset.id ? (leavesView ? null : updated) : current))
    if (next.folder !== asset.folder) loadFolders().catch(() => setFoldersState('error'))
    return updated
  }

  async function submitEdit(asset, changes) {
    await saveAsset(asset, changes)
    setEditing(null)
    notify('Mídia atualizada.')
  }

  async function submitMove(asset, target) {
    await saveAsset(asset, { folder: target })
    setMoving(null)
    notify(`Mídia movida para “${target}”.`)
  }

  async function remove(asset) {
    const ok = await confirm({
      title: `Remover “${shortText(asset.name, 48)}” da biblioteca?`,
      description: 'A mídia sai da biblioteca. Publicações que já usaram o arquivo não mudam.',
      confirmLabel: 'Remover',
      tone: 'danger',
    })
    if (!ok) return
    const index = assets.findIndex(item => item.id === asset.id)
    try { await apiFetch(`/api/media-assets/${asset.id}`, { method: 'DELETE' }) }
    catch (error) { notify(error.message, 'error'); return }
    setAssets(current => current.filter(item => item.id !== asset.id))
    setPreview(current => (current?.id === asset.id ? null : current))
    setFocusAfterRemoval(Math.max(index, 0))
    notify('Mídia removida.')
    loadFolders().catch(() => setFoldersState('error'))
  }

  function useAssetInPost(asset) {
    try {
      sessionStorage.setItem(MEDIA_LIBRARY_SELECTION_KEY, JSON.stringify({ id: asset.id, name: asset.name, url: asset.url, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes }))
      onNavigate?.('agendador')
    } catch (error) { notify(error.message || 'Não foi possível preparar a mídia.', 'error') }
  }

  function toggleSuggestionPlatform(platform) {
    setSuggestionPlatforms(current => current.includes(platform) ? current.filter(item => item !== platform) : [...current, platform])
  }

  function buildSuggestionInstruction(insights, niche) {
    const comparisons = insights?.performanceAnalysis?.comparisons || []
    const signals = comparisons.flatMap(item => (item.signals || []).slice(0, 2).map(signal => `${item.platformLabel}: ${signal}`)).slice(0, 6)
    const recommendations = (insights?.recommendations || []).slice(0, 3)
    const dataNote = insights?.dataQuality?.hasEnoughData
      ? 'Use estes sinais como referência prática, sem repetir as mesmas publicações.'
      : 'Os dados ainda são limitados; trate os sinais como hipóteses de teste, não como certezas.'

    return [
      `Crie 3 sugestões de posts originais para o nicho ${niche || 'identificado a partir do histórico da conta'}.`,
      `Adapte cada ideia para ${suggestionPlatforms.map(platformLabel).join(', ')}.`,
      'Priorize ganchos claros, utilidade para o público, potencial de comentários, salvamentos ou compartilhamentos e uma chamada para ação natural.',
      'Varie os formatos: uma ideia educativa, uma ideia de conversa/comunidade e uma ideia de prova, bastidor ou aplicação prática.',
      'Não invente tendências, números, notícias, resultados ou referências externas. Não copie nenhum post anterior.',
      dataNote,
      signals.length ? `Sinais observados no histórico: ${signals.join(' | ')}` : 'Não há sinais de conteúdo suficientes no histórico para sustentar uma conclusão forte.',
      recommendations.length ? `Recomendações do Analytics: ${recommendations.join(' | ')}` : 'Não há recomendações de Analytics disponíveis.',
    ].join('\n')
  }

  async function generateContentSuggestions() {
    if (!suggestionPlatforms.length) {
      notify('Selecione pelo menos uma rede social.', 'error')
      return
    }
    setSuggestionLoading(true)
    try {
      const analyticsData = await apiFetch(`/api/ai/analytics-insights?days=${suggestionDays}`)
      const insights = analyticsData.insights || null
      setSuggestionInsights(insights)
      const inferredNiche = suggestionNiche.trim() || inferNicheFromInsights(insights) || 'o seu nicho'
      if (!suggestionNiche.trim() && inferredNiche !== 'o seu nicho') setSuggestionNiche(inferredNiche)
      const generated = await apiFetch('/api/ai/generate', {
        method: 'POST',
        timeoutMs: 60_000,
        body: JSON.stringify({ instrucao: buildSuggestionInstruction(insights, inferredNiche), plataformas: suggestionPlatforms, quantidade: 3, tom: 'profissional', modelo: 'openrouter' }),
      })
      const nextSuggestions = (generated.posts || []).map((post, index) => ({ ...post, suggestionId: `${Date.now()}-${index}`, text: suggestionText(post) }))
      setSuggestions(nextSuggestions)
      if (!nextSuggestions.length) notify('O sistema inteligente não retornou sugestões desta vez.', 'error')
    } catch (error) {
      notify(error.message || 'Não foi possível gerar sugestões agora.', 'error')
    } finally { setSuggestionLoading(false) }
  }

  async function saveSuggestionToIdeaVault(suggestion) {
    const text = suggestionText(suggestion)
    if (!text.trim()) return
    try {
      await apiFetch('/api/drafts', { method: 'POST', body: JSON.stringify({ title: suggestion.titulo || `Ideia do sistema inteligente · ${suggestionNiche || 'novo conteúdo'}`, text, platforms: suggestion.plataformas?.length ? suggestion.plataformas : suggestionPlatforms }) })
      setSavedSuggestions(current => [...current, suggestion.suggestionId])
      notify('Ideia salva no Baú de Ideias.')
    } catch (error) { notify(error.message, 'error') }
  }


  const quality = suggestionInsights?.dataQuality
  const inferredNiche = suggestionNiche || inferNicheFromInsights(suggestionInsights)

  const folderOptions = [{ name: 'Geral', assetCount: folders.find(item => item.name.toLowerCase() === 'geral')?.assetCount || 0 }, ...folders.filter(item => item.name.toLowerCase() !== 'geral')]
  const totalAssets = folders.reduce((total, item) => total + Number(item.assetCount || 0), 0)
  const countsKnown = foldersState === 'ok'
  const currentCount = folder ? Number(folderOptions.find(option => option.name === folder)?.assetCount || 0) : totalAssets
  const searching = Boolean(search)
  const assetMenu = asset => [
    { label: 'Visualizar', icon: 'eye', onSelect: () => setPreview(asset) },
    { label: 'Editar informações', icon: 'compose', onSelect: () => setEditing(asset) },
    { label: 'Mover para pasta', icon: 'folderMove', onSelect: () => setMoving(asset) },
    { label: 'Usar no Meu Post', icon: 'send', onSelect: () => useAssetInPost(asset) },
    { label: 'Remover da biblioteca', icon: 'trash', danger: true, onSelect: () => remove(asset) },
  ]
  const folderChip = (name, count, pressed, onClick, key) => <button type="button" className="ds-netswitch__opt lib-folders__opt" aria-pressed={pressed} onClick={onClick} key={key}>
    <Icon name="folder" size={16} />
    <span>{name}</span>
    {countsKnown && <><span className="lib-folders__count" aria-hidden="true">{count}</span><span className="ds-sr-only">, {countLabel(count)}</span></>}
  </button>
  const uploadButton = <button type="button" className="ds-btn ds-btn--primary lib-upload__go" onClick={() => fileInputRef.current?.click()} title={`As mídias entram em “${destination}”`}>
    <Icon name="upload" />Adicionar mídia
  </button>

  return <div className="ds-page lib" data-ds-root>
    <header className="ds-pagehead lib-head">
      <div className="ds-pagehead__text">
        <h1 className="ds-pagehead__title">Biblioteca</h1>
        <p className="ds-pagehead__lede">Gerencie as imagens e os vídeos que você usa nas publicações.</p>
      </div>
      <div className="ds-pagehead__actions lib-upload">
        <button type="button" className="ds-btn ds-btn--secondary" onClick={() => setFolderDialogOpen(true)}><Icon name="folder" />Nova pasta</button>
        {uploadButton}
        <input ref={fileInputRef} className="lib-upload__input" type="file" multiple accept={MEDIA_ACCEPT} onChange={chooseFiles} tabIndex={-1} aria-hidden="true" />
      </div>
    </header>

    <section className="lib-shelf" aria-labelledby="lib-shelf-title" data-dragging={dragging || undefined} {...dropHandlers}>
      <h2 className="ds-sr-only" id="lib-shelf-title" tabIndex={-1}>Mídias salvas</h2>
      {phone
        ? <div className="ds-searchrow">
          <label className="ds-inputwrap">
            <Icon name="search" />
            <input className="ds-input" type="search" value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Buscar por nome ou tag…" aria-label="Buscar mídia" />
          </label>
          <FiltersButton count={folder ? 1 : 0} open={filtersOpen} onClick={() => setFiltersOpen(true)} />
        </div>
        : <div className="lib-tools">
          <label className="ds-inputwrap lib-tools__search">
            <Icon name="search" />
            <input className="ds-input" type="search" value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Buscar por nome ou tag…" aria-label="Buscar mídia" />
          </label>
          <div className="ds-netswitch lib-folders" role="group" aria-label="Pastas da biblioteca">
            {folderChip('Todas', totalAssets, !folder, () => setFolder(''), '')}
            {folderOptions.map(option => folderChip(option.name, Number(option.assetCount || 0), folder === option.name, () => setFolder(option.name), option.name))}
            {foldersState === 'error' && <button type="button" className="ds-go lib-folders__retry" onClick={() => loadFolders().catch(() => setFoldersState('error'))}>Pastas indisponíveis. Tentar de novo<Icon name="refresh" size={16} /></button>}
          </div>
        </div>}

      <nav className="lib-crumb" aria-label="Local na biblioteca">
        {folder
          ? <><button type="button" className="lib-crumb__up" onClick={() => setFolder('')}>Todas as mídias</button><Icon name="chevronRight" size={14} className="lib-crumb__sep" /><span className="lib-crumb__here" aria-current="page"><Icon name="folder" size={16} />{folder}</span></>
          : <span className="lib-crumb__here" aria-current="page">Todas as mídias</span>}
        {countsKnown && !searching && <span className="ds-meta lib-crumb__count">{countLabel(currentCount)}</span>}
        {searching && <span className="ds-meta lib-crumb__count">Resultados para “{shortText(search, 40)}”</span>}
      </nav>

      <UploadQueue items={upload.items} onRetry={upload.retry} onDismiss={upload.dismiss} onClear={upload.clearFinished} />

      {loadError && <div className="ds-alert lib-alert" data-tone={assets.length ? 'warning' : 'danger'} role="alert">
        <Icon name={assets.length ? 'alertTriangle' : 'alertCircle'} className="ds-alert__icon" />
        <p className="ds-alert__title">{assets.length ? 'Não foi possível atualizar a biblioteca' : 'Não foi possível carregar a biblioteca'}</p>
        <p className="ds-alert__text">{assets.length ? 'Mostrando a última versão carregada.' : 'Nada foi apagado; só não conseguimos mostrar as mídias agora.'}</p>
        <div className="ds-alert__actions"><button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" disabled={loading} onClick={() => refresh()}><Icon name="refresh" size={16} />Tentar novamente</button></div>
      </div>}

      {loading && !loadedOnce
        ? <div className="lib-assets" aria-busy="true"><p className="ds-sr-only" aria-live="polite">Carregando biblioteca…</p>{[1, 2, 3, 4, 5, 6, 7, 8].map(item => <div className="lib-asset lib-asset--skel" key={item}><span className="ds-skel lib-asset__skel" /><span className="ds-skel ds-skel--text" style={{ width: '70%' }} /><span className="ds-skel ds-skel--text" style={{ width: '40%' }} /></div>)}</div>
        : assets.length
          ? <>
            <ul className="lib-assets" aria-busy={loading} ref={assetsRef}>
              {assets.map(asset => <MediaCard key={asset.id} asset={asset} showFolder={!folder} menuItems={assetMenu(asset)} onOpen={setPreview} onUse={useAssetInPost} />)}
            </ul>
            {hasMore && <div className="lib-more"><button type="button" className="ds-btn ds-btn--secondary" onClick={loadMore} disabled={loadingMore}>{loadingMore ? <><span className="ds-spinner" aria-hidden="true" />Carregando…</> : 'Carregar mais mídias'}</button></div>}
          </>
          : !loadError && <div className="ds-empty lib-empty">
            <span className="ds-icontile ds-icontile--lg" aria-hidden="true"><Icon name={searching ? 'search' : folder ? 'folder' : 'image'} /></span>
            <p className="ds-empty__title ds-empty__title--sm">{searching ? 'Nenhuma mídia encontrada' : folder ? 'Esta pasta ainda está vazia' : 'Ainda não há mídias aqui'}</p>
            <p className="ds-empty__text">{searching ? `Nada com “${shortText(search, 40)}” no nome ou nas tags. Tente outra palavra.` : folder ? `Envie fotos ou vídeos com a pasta “${folder}” aberta${phone ? '' : ', ou arraste os arquivos para cá'}.` : `Adicione fotos ou vídeos para reutilizar nas suas publicações${phone ? '' : ', ou arraste os arquivos para cá'}.`}</p>
            <div className="ds-empty__actions">
              {searching
                ? <button type="button" className="ds-btn ds-btn--secondary" onClick={() => { setSearchInput(''); setSearch('') }}>Limpar busca</button>
                : <button type="button" className="ds-btn ds-btn--primary" onClick={() => fileInputRef.current?.click()}><Icon name="upload" />Adicionar mídia</button>}
            </div>
          </div>}

      {dragging && <div className="lib-dropzone" aria-hidden="true">
        <p className="lib-dropzone__msg"><Icon name="upload" size={20} /><span>Solte para adicionar em <strong>{destination}</strong></span></p>
      </div>}
    </section>

    <MediaPreview asset={preview} onClose={() => setPreview(null)} onUse={useAssetInPost} onEdit={asset => { setPreview(null); setEditing(asset) }} onMove={asset => { setPreview(null); setMoving(asset) }} onRemove={remove} />
    <MediaEditDialog asset={editing} folders={folderOptions} onClose={() => setEditing(null)} onSave={submitEdit} />
    <MediaMoveDialog asset={moving} folders={folderOptions} onClose={() => setMoving(null)} onMove={submitMove} />
    <FolderDialog open={folderDialogOpen} onClose={() => setFolderDialogOpen(false)} onCreate={createFolder} />
    {confirmDialog}

    {phone && <FilterSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} value={{ folder }} emptyValue={{ folder: '' }} onApply={next => setFolder(next.folder)} title="Filtrar biblioteca">
      {(pending, setPending) => <FilterGroup title="Pasta">
        <FilterOption selected={!pending.folder} onSelect={() => setPending({ folder: '' })}>{countsKnown ? `Todas (${totalAssets})` : 'Todas'}</FilterOption>
        {folderOptions.map(option => <FilterOption key={option.name} icon="folder" selected={pending.folder === option.name} onSelect={() => setPending({ folder: option.name })}>{countsKnown ? `${option.name} (${Number(option.assetCount || 0)})` : option.name}</FilterOption>)}
      </FilterGroup>}
    </FilterSheet>}

    <section className="ds-block lib-ideas" aria-labelledby="media-ai-opportunities-title">
      <div className="ds-head">
        <div className="ds-head__text">
          <p className="ds-eyebrow">Assistente inteligente</p>
          <h2 className="ds-head__title" id="media-ai-opportunities-title">Encontre sua próxima oportunidade</h2>
          <p className="ds-head__desc">O sistema inteligente cruza seu nicho com os sinais disponíveis nos Relatórios e sugere ideias para testar.</p>
        </div>
        <span className="ds-badge" data-tone={suggestionInsights ? 'gold' : 'outline'}>{suggestionInsights ? 'Baseado no seu histórico' : 'Analisa seu histórico'}</span>
      </div>

      <div className="lib-ideas__form">
        <div className="ds-field">
          <div className="ds-field__top"><label className="ds-label" htmlFor="lib-niche">Nicho ou tema principal</label><span className="ds-label__req">opcional</span></div>
          <input id="lib-niche" className="ds-input" value={suggestionNiche} onChange={event => setSuggestionNiche(event.target.value)} placeholder="Ex.: educação financeira" />
        </div>
        <div className="ds-field">
          <label className="ds-label" htmlFor="lib-days">Período do histórico</label>
          <Select id="lib-days" value={suggestionDays} onChange={value => setSuggestionDays(Number(value))} options={SUGGESTION_PERIODS} sheetTitle="Período do histórico" />
        </div>
        <div className="ds-field lib-ideas__nets">
          <p className="ds-label">Redes para adaptar <span className="ds-label__req">{suggestionPlatforms.length} selecionada{suggestionPlatforms.length === 1 ? '' : 's'}</span></p>
          <div className="ds-netswitch" role="group" aria-label="Redes para adaptar">
            {platforms.map(([id, label]) => <button type="button" className="ds-netswitch__opt" onClick={() => toggleSuggestionPlatform(id)} key={id} aria-pressed={suggestionPlatforms.includes(id)}><NetworkGlyph network={id} size={16} />{label}</button>)}
          </div>
        </div>
        <button type="button" className="ds-btn ds-btn--primary lib-ideas__go" onClick={generateContentSuggestions} disabled={suggestionLoading}>
          {suggestionLoading ? <span className="ds-spinner" aria-hidden="true" /> : <Icon name="sparkle" />}{suggestionLoading ? 'Analisando e criando…' : suggestions.length ? 'Gerar novas ideias' : 'Gerar sugestões'}
        </button>
      </div>

      {suggestionInsights && <div className="lib-ideas__insights">
        <ul className="lib-ideas__facts">
          <li><strong className="ds-num">{quality?.publications || 0}</strong> publicações analisadas</li>
          <li><strong className="ds-num">{quality?.profiles || 0}</strong> perfis com dados</li>
          <li><strong>{inferredNiche || 'Nicho aberto'}</strong> nicho de referência</li>
        </ul>
        {suggestionInsights.summary && <p className="lib-ideas__summary">{suggestionInsights.summary}</p>}
        {suggestionInsights.recommendations?.length ? <ol className="lib-ideas__tips">{suggestionInsights.recommendations.slice(0, 2).map((tip, index) => <li key={index}>{tip}</li>)}</ol> : null}
      </div>}

      {suggestionLoading && <div className="ds-alert lib-ideas__loading" role="status" aria-live="polite">
        <span className="ds-spinner ds-alert__icon" aria-hidden="true" />
        <p className="ds-alert__title">Lendo seus sinais e preparando ideias</p>
        <p className="ds-alert__text">O sistema inteligente está combinando seu histórico com as redes escolhidas.</p>
      </div>}

      {suggestions.length
        ? <ol className="lib-ideas__list" aria-live="polite">
            {suggestions.map((suggestion, index) => {
              const saved = savedSuggestions.includes(suggestion.suggestionId)
              return <li className="lib-idea" key={suggestion.suggestionId}>
                <p className="lib-idea__num ds-num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</p>
                <p className="ds-eyebrow">Ideia para testar</p>
                <h3 className="lib-idea__title">{suggestion.titulo || `Sugestão ${index + 1}`}</h3>
                <p className="lib-idea__text">{suggestion.text}</p>
                <div className="lib-idea__why">
                  <p className="lib-idea__whylabel">{suggestionInsights?.recommendations?.length ? 'Recomendação dos Relatórios' : 'Por que vale testar'}</p>
                  <p>{suggestionInsights?.recommendations?.[index % (suggestionInsights.recommendations?.length || 1)] || 'A ideia combina o nicho informado com um formato de conteúdo fácil de testar e comparar.'}</p>
                </div>
                <div className="lib-idea__foot">
                  <span className="lib-idea__nets">{(suggestion.plataformas?.length ? suggestion.plataformas : suggestionPlatforms).map(platform => <span key={platform}><NetworkGlyph network={platform} size={14} />{platformLabel(platform)}</span>)}</span>
                  <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={() => saveSuggestionToIdeaVault(suggestion)} disabled={saved}>{saved ? <><Icon name="check" size={16} />Salvo no Baú de Ideias</> : <><Icon name="chest" size={16} />Salvar no Baú de Ideias</>}</button>
                </div>
              </li>
            })}
          </ol>
        : !suggestionLoading && <div className="ds-empty ds-empty--quiet lib-ideas__empty">
            <p className="ds-empty__title ds-empty__title--sm">Comece com um tema ou deixe o sistema inteligente descobrir</p>
            <p className="ds-empty__text">Informe um assunto para direcionar as ideias. Se deixar em branco, o sistema tenta encontrar um nicho no seu histórico.</p>
            <div className="ds-empty__actions" role="group" aria-label="Temas sugeridos">{suggestionExamples.map(example => <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" key={example} onClick={() => setSuggestionNiche(example)}>{example}</button>)}</div>
          </div>}
    </section>
  </div>
}
