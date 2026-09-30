import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import { useToast } from '../components/ui/toast.jsx'
import { Icon, NetworkGlyph } from '../components/ui/icon.jsx'
import { OverflowMenu } from '../components/ui/overflow-menu.jsx'

const platforms = [
  ['instagram', 'Instagram'],
  ['facebook', 'Facebook'],
  ['youtube', 'YouTube'],
  ['tiktok', 'TikTok'],
]

const suggestionExamples = ['Educação financeira', 'Bastidores do negócio', 'Dicas para iniciantes']

export const MEDIA_LIBRARY_SELECTION_KEY = 'meu-ecoo:media-library-selection'

function formatSize(value) {
  const bytes = Number(value || 0)
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

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

export function MediaLibraryPage({ onNavigate }) {
  const [assets, setAssets] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [folders, setFolders] = useState([])
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [folder, setFolder] = useState('')
  const [uploadFolder, setUploadFolder] = useState('Geral')
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [suggestionNiche, setSuggestionNiche] = useState('')
  const [suggestionDays, setSuggestionDays] = useState(30)
  const [suggestionPlatforms, setSuggestionPlatforms] = useState(['instagram'])
  const [suggestions, setSuggestions] = useState([])
  const [suggestionInsights, setSuggestionInsights] = useState(null)
  const [suggestionLoading, setSuggestionLoading] = useState(false)
  const [savedSuggestions, setSavedSuggestions] = useState([])
  const notify = useToast()
  const fileInputRef = useRef(null)
  const requestRef = useRef(0)

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
    })
  }, [folder, search])

  useEffect(() => {
    setLoading(true)
    load().catch(error => notify(error.message, 'error')).finally(() => { setLoading(false); setLoadedOnce(true) })
  }, [load, notify])

  const loadFolders = useCallback(() => apiFetch('/api/media-folders').then(data => setFolders(data.folders || [])), [])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const data = await apiFetch(`/api/media-assets?search=${encodeURIComponent(search)}&folder=${encodeURIComponent(folder)}&offset=${assets.length}`)
      setAssets(current => [...current, ...(data.assets || []).filter(item => !current.some(existing => existing.id === item.id))])
      setHasMore(Boolean(data.hasMore))
    } catch (error) { notify(error.message, 'error') } finally { setLoadingMore(false) }
  }

  useEffect(() => {
    loadFolders().catch(error => notify(error.message, 'error'))
  }, [loadFolders, notify])

  function selectFolder(nextFolder) {
    setFolder(nextFolder)
    setUploadFolder(nextFolder || 'Geral')
  }

  async function createFolder(event) {
    event.preventDefault()
    if (!newFolderName.trim()) return
    setCreatingFolder(true)
    try {
      const data = await apiFetch('/api/media-folders', { method: 'POST', body: JSON.stringify({ name: newFolderName }) })
      const created = data.folder
      setFolders(current => [...current, created].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')))
      selectFolder(created.name)
      setNewFolderName('')
      setFolderDialogOpen(false)
      notify(`Pasta “${created.name}” criada.`)
    } catch (error) { notify(error.message, 'error') } finally { setCreatingFolder(false) }
  }

  async function upload(event) {
    const files = [...(event.target.files || [])]
    event.target.value = ''
    if (!files.length) return
    setUploading(true)
    try {
      for (const file of files) {
        const signed = await apiFetch('/api/posts/upload-url', { method: 'POST', body: JSON.stringify({ filename: file.name, mimetype: file.type }) })
        const response = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
        if (!response.ok) throw new Error(`Não foi possível enviar ${file.name}.`)
        const uploaded = await response.json().catch(() => null)
        const mediaUrl = signed.mediaUrl || uploaded?.url
        if (!mediaUrl) throw new Error(`O upload de ${file.name} não retornou uma URL.`)
        await apiFetch('/api/media-assets', { method: 'POST', body: JSON.stringify({ name: file.name, url: mediaUrl, mimeType: file.type, sizeBytes: file.size, folder: uploadFolder || 'Geral' }) })
      }
      const foldersData = await apiFetch('/api/media-folders')
      setFolders(foldersData.folders || [])
      await load()
      notify(`${files.length} mídia(s) adicionada(s) à biblioteca.`)
    } catch (error) {
      notify(error.message, 'error')
      // Arquivos enviados antes da falha já foram salvos: atualiza a grade e as pastas.
      loadFolders().catch(() => {})
      load().catch(() => {})
    } finally { setUploading(false) }
  }

  async function remove(asset) {
    if (!window.confirm(`Remover ${asset.name} da biblioteca?`)) return
    try { await apiFetch(`/api/media-assets/${asset.id}`, { method: 'DELETE' }); setAssets(current => current.filter(item => item.id !== asset.id)); notify('Mídia removida.'); loadFolders().catch(() => {}) }
    catch (error) { notify(error.message, 'error') }
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
  const filtered = Boolean(search || folder)

  return <div className="ds-page lib" data-ds-root>
    <header className="ds-pagehead lib-head">
      <div className="ds-pagehead__text">
        <p className="ds-eyebrow">Acervo</p>
        <h1 className="ds-pagehead__title">Biblioteca</h1>
        <p className="ds-pagehead__lede">Fotos e vídeos reutilizáveis, organizados em pastas e prontos para usar no Meu Post.</p>
      </div>
      <div className="ds-pagehead__actions lib-upload">
        <span className="ds-select lib-upload__dest">
          <select className="ds-select__control" value={uploadFolder} onChange={event => setUploadFolder(event.target.value)} aria-label="Destino dos próximos uploads">
            {folderOptions.map(option => <option value={option.name} key={option.name}>Enviar para: {option.name}</option>)}
          </select>
          <Icon name="chevronDown" className="ds-select__chev" />
        </span>
        <button type="button" className="ds-btn ds-btn--primary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? <><span className="ds-spinner" aria-hidden="true" />Enviando…</> : <><Icon name="upload" />Adicionar mídia</>}
        </button>
        <input ref={fileInputRef} className="lib-upload__input" type="file" multiple accept="image/*,video/*" onChange={upload} disabled={uploading} tabIndex={-1} aria-hidden="true" />
      </div>
    </header>

    <section className="lib-shelf" aria-labelledby="lib-shelf-title">
      <h2 className="ds-sr-only" id="lib-shelf-title">Mídias salvas</h2>
      <div className="lib-tools">
        <label className="ds-inputwrap lib-tools__search">
          <Icon name="search" />
          <input className="ds-input" type="search" value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Buscar por nome ou tag…" aria-label="Buscar mídia" />
        </label>
        <span className="ds-select lib-tools__folder">
          <select className="ds-select__control" value={folder} onChange={event => selectFolder(event.target.value)} aria-label="Filtrar pasta">
            <option value="">Todas as pastas</option>
            {folderOptions.map(option => <option value={option.name} key={option.name}>{option.name}</option>)}
          </select>
          <Icon name="chevronDown" className="ds-select__chev" />
        </span>
        <button type="button" className="ds-btn ds-btn--secondary lib-tools__newfolder" onClick={() => setFolderDialogOpen(current => !current)} aria-expanded={folderDialogOpen}><Icon name="plus" />Nova pasta</button>
      </div>

      <div className="ds-netswitch lib-folders" role="group" aria-label="Pastas da biblioteca">
        <button type="button" className="ds-netswitch__opt" aria-pressed={!folder} onClick={() => selectFolder('')}>Todas <span className="lib-folders__count">{totalAssets}</span></button>
        {folderOptions.map(option => <button type="button" className="ds-netswitch__opt" aria-pressed={folder === option.name} onClick={() => selectFolder(option.name)} key={option.name}>{option.name} <span className="lib-folders__count">{option.assetCount || 0}</span></button>)}
      </div>

      {folderDialogOpen && <form className="lib-newfolder" onSubmit={createFolder}>
        <div className="ds-field lib-newfolder__field">
          <label className="ds-label" htmlFor="lib-newfolder-name">Nome da nova pasta</label>
          <input id="lib-newfolder-name" className="ds-input" autoFocus value={newFolderName} onChange={event => setNewFolderName(event.target.value)} placeholder="Ex.: Campanhas de verão" maxLength={80} />
        </div>
        <button type="button" className="ds-btn ds-btn--quiet" onClick={() => { setFolderDialogOpen(false); setNewFolderName('') }}>Cancelar</button>
        <button type="submit" className="ds-btn ds-btn--primary" disabled={creatingFolder || !newFolderName.trim()}>{creatingFolder ? 'Criando…' : 'Criar pasta'}</button>
      </form>}

      {loading && !loadedOnce
        ? <div className="lib-assets" aria-busy="true"><p className="ds-sr-only" aria-live="polite">Carregando biblioteca…</p>{[1, 2, 3, 4].map(item => <div className="lib-asset" key={item}><span className="ds-skel lib-asset__skel" /><span className="ds-skel ds-skel--text" style={{ width: '70%' }} /></div>)}</div>
        : assets.length
          ? <>
              <ul className="lib-assets" aria-busy={loading}>
                {assets.map(asset => <li className="lib-asset" key={asset.id}>
                  <div className="lib-asset__media">{asset.mimeType?.startsWith('video/') ? <video src={asset.url} muted controls preload="metadata" /> : <img src={asset.url} alt={asset.name} loading="lazy" />}</div>
                  <div className="lib-asset__body">
                    <p className="lib-asset__name" title={asset.name}>{asset.name}</p>
                    <p className="ds-meta">{asset.folder}{asset.sizeBytes ? ` · ${formatSize(asset.sizeBytes)}` : ''}</p>
                    {asset.tags?.length ? <p className="lib-asset__tags">{asset.tags.map(tag => <span key={tag}>#{tag}</span>)}</p> : null}
                  </div>
                  <div className="lib-asset__actions">
                    <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={() => useAssetInPost(asset)}><Icon name="compose" size={16} />Usar no Meu Post</button>
                    <OverflowMenu label={`Mais ações para ${asset.name}`} items={[{ label: 'Remover da biblioteca', icon: 'trash', danger: true, onSelect: () => remove(asset) }]} />
                  </div>
                </li>)}
              </ul>
              {hasMore && <div className="lib-more"><button type="button" className="ds-btn ds-btn--secondary" onClick={loadMore} disabled={loadingMore}>{loadingMore ? <><span className="ds-spinner" aria-hidden="true" />Carregando…</> : 'Carregar mais mídias'}</button></div>}
            </>
          : <div className="ds-empty lib-empty">
              <span className="ds-icontile ds-icontile--lg" aria-hidden="true"><Icon name={filtered ? 'search' : 'image'} /></span>
              <p className="ds-empty__title ds-empty__title--sm">Nenhuma mídia encontrada</p>
              <p className="ds-empty__text">{filtered ? 'Nada corresponde à busca ou à pasta escolhida.' : 'Adicione fotos ou vídeos para montar seu acervo reutilizável.'}</p>
              <div className="ds-empty__actions">
                {filtered
                  ? <button type="button" className="ds-go" onClick={() => { setSearchInput(''); setSearch(''); selectFolder('') }}>Ver todas as mídias<Icon name="arrow" /></button>
                  : <button type="button" className="ds-btn ds-btn--primary" onClick={() => fileInputRef.current?.click()} disabled={uploading}><Icon name="upload" />Adicionar mídia</button>}
              </div>
            </div>}
    </section>

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
          <span className="ds-select">
            <select id="lib-days" className="ds-select__control" value={suggestionDays} onChange={event => setSuggestionDays(Number(event.target.value))}>
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
            </select>
            <Icon name="chevronDown" className="ds-select__chev" />
          </span>
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
