import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { useIsPhone } from '../lib/breakpoints.js'
import { useToast } from '../components/ui/toast.jsx'
import { Icon, NetworkGlyph } from '../components/ui/icon.jsx'
import { OverflowMenu } from '../components/ui/overflow-menu.jsx'
import { Sheet } from '../components/ui/floating.jsx'
import { TimeField } from '../components/ui/date-time-field.jsx'
import { FilterGroup, FilterOption, FilterSheet, FiltersButton } from '../components/ui/filters.jsx'

const platforms = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['youtube', 'YouTube'], ['tiktok', 'TikTok']]
const days = [['1', 'Seg'], ['2', 'Ter'], ['3', 'Qua'], ['4', 'Qui'], ['5', 'Sex'], ['6', 'Sáb'], ['0', 'Dom']]
const STATUS_FILTERS = [['all', 'Todas'], ['active', 'Ativas'], ['paused', 'Pausadas']]
const FORM_ID = 'rep-create-form'

// Mensagem do backend quando existe; falha de rede ou resposta fora do formato
// vira o texto da ação, nunca o erro técnico.
function messageOf(error, fallback) {
  return error instanceof ApiError ? error.message : fallback
}

export function ContentQueuesPage() {
  const [queues, setQueues] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [media, setMedia] = useState(null)
  const [tiktokPrivacyLevel, setTiktokPrivacyLevel] = useState('PUBLIC_TO_EVERYONE')
  const [form, setForm] = useState({ name: '', text: '', platforms: ['instagram'], days: ['1', '3', '5'], time: '10:00' })
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const mediaRef = useRef(null)
  const notify = useToast()
  const phone = useIsPhone()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/api/content-queues')
      setQueues(data?.queues || [])
      setLoadError('')
      setLoadedOnce(true)
    } finally {
      setLoading(false)
    }
  }, [])
  // Uma falha de carga não vira "Nenhuma rotina criada ainda": a pessoa
  // acharia que perdeu as rotinas.
  const loadAll = useCallback(() => load().catch(error => setLoadError(messageOf(error, 'Verifique sua conexão e tente de novo.'))), [load])
  useEffect(() => { loadAll() }, [loadAll])
  // Libera a prévia da mídia ao sair da página.
  useEffect(() => { mediaRef.current = media }, [media])
  useEffect(() => () => { if (mediaRef.current?.previewUrl) URL.revokeObjectURL(mediaRef.current.previewUrl) }, [])

  function togglePlatform(platform) {
    setForm(current => ({ ...current, platforms: current.platforms.includes(platform) ? current.platforms.filter(item => item !== platform) : [...current.platforms, platform] }))
  }
  function toggleDay(day) { setForm(current => ({ ...current, days: current.days.includes(day) ? current.days.filter(item => item !== day) : [...current.days, day] })) }
  function selectMedia(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      notify('Escolha uma imagem ou vídeo válido.', 'error')
      return
    }
    setMedia(current => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl)
      return { file, previewUrl: URL.createObjectURL(file) }
    })
  }
  function removeMedia() {
    setMedia(current => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl)
      return null
    })
  }
  async function uploadMedia(file) {
    const signed = await apiFetch('/api/posts/upload-url', { method: 'POST', body: JSON.stringify({ filename: file.name, mimetype: file.type }) })
    const response = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
      .catch(() => { throw new Error(`Não foi possível enviar ${file.name}. Verifique sua conexão e tente de novo.`) })
    if (!response.ok) throw new Error(`Não foi possível enviar ${file.name}.`)
    const uploaded = await response.json().catch(() => null)
    const mediaUrl = signed.mediaUrl || uploaded?.url
    if (!mediaUrl) throw new Error('O upload não retornou uma URL válida.')
    return { url: mediaUrl, size: file.size }
  }
  async function save(event) {
    event.preventDefault()
    if (saving) return
    if (!form.platforms.length || !form.days.length) return notify('Selecione ao menos uma rede e um dia.', 'error')
    if (form.platforms.some(platform => ['instagram', 'youtube', 'tiktok'].includes(platform)) && !media) return notify('Instagram, YouTube e TikTok precisam de mídia anexada.', 'error')
    if (form.platforms.includes('youtube') && media && !media.file.type.startsWith('video/')) return notify('O YouTube precisa de um vídeo anexado.', 'error')
    setSaving(true)
    try {
      const uploadedMedia = media ? await uploadMedia(media.file) : null
      await apiFetch('/api/content-queues', { method: 'POST', body: JSON.stringify({ name: form.name, platforms: form.platforms, content: { text: form.text, ...(uploadedMedia ? { mediaPath: uploadedMedia.url, mediaType: media.file.type, mediaName: media.file.name, mediaSize: uploadedMedia.size } : {}), ...(form.platforms.includes('tiktok') ? { tiktokPrivacyLevel } : {}) }, recurrence: { days: form.days.map(Number), time: form.time } }) })
      setForm(current => ({ ...current, name: '', text: '' }))
      removeMedia()
      setFormOpen(false)
      notify('Rotina de publicação criada.')
      await loadAll()
    } catch (error) {
      // Erros criados aqui (upload) já trazem a frase certa; os da API vêm do servidor.
      notify(error instanceof ApiError || error?.name === 'Error' ? error.message : 'Não foi possível criar a rotina agora.', 'error')
    } finally {
      setSaving(false)
    }
  }
  // Sem UI otimista: o estado só muda depois que o servidor confirma e a lista recarrega.
  async function toggle(queue) {
    if (busyId !== null) return
    setBusyId(queue.id)
    try { await apiFetch(`/api/content-queues/${queue.id}`, { method: 'PATCH', body: JSON.stringify({ active: !queue.active, recurrence: queue.recurrence }) }); await load() }
    catch (error) { notify(messageOf(error, queue.active ? 'Não foi possível pausar a rotina agora.' : 'Não foi possível ativar a rotina agora.'), 'error') }
    finally { setBusyId(null) }
  }
  async function remove(queue) {
    if (busyId !== null || !window.confirm(`Excluir a rotina ${queue.name}?`)) return
    setBusyId(queue.id)
    try { await apiFetch(`/api/content-queues/${queue.id}`, { method: 'DELETE' }); setQueues(current => current.filter(item => item.id !== queue.id)); notify('Rotina removida.') }
    catch (error) { notify(messageOf(error, 'Não foi possível excluir a rotina agora.'), 'error') }
    finally { setBusyId(null) }
  }
  const activeQueues = queues.filter(queue => queue.active).length
  const pausedQueues = queues.length - activeQueues
  const statusCounts = { all: queues.length, active: activeQueues, paused: pausedQueues }
  const filteredQueues = queues.filter(queue => {
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? queue.active : !queue.active)
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR')
    const matchesSearch = !normalizedSearch || [queue.name, queue.content?.text, ...(queue.platforms || [])]
      .filter(Boolean)
      .some(value => String(value).toLocaleLowerCase('pt-BR').includes(normalizedSearch))
    return matchesStatus && matchesSearch
  })
  const selectedDays = days.filter(([id]) => form.days.includes(id)).map(([, label]) => label)
  const selectedPlatforms = platforms.filter(([id]) => form.platforms.includes(id)).map(([, label]) => label)
  const selectedPlatformsLabel = selectedPlatforms.length === 1 ? '1 rede selecionada' : `${selectedPlatforms.length} redes selecionadas`
  const mediaRequired = form.platforms.some(platform => ['instagram', 'youtube', 'tiktok'].includes(platform))
  const videoOnly = form.platforms.includes('youtube')

  function formatQueueDays(queue) {
    const queueDays = queue.recurrence?.days || []
    const labels = days.filter(([id]) => queueDays.includes(Number(id)) || queueDays.includes(id)).map(([, label]) => label)
    return labels.length ? labels.join(', ') : 'dias não definidos'
  }

  function formatNextRun(queue) {
    if (!queue.nextRunAt) return null
    const date = new Date(queue.nextRunAt)
    return Number.isNaN(date.getTime()) ? null : date.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const showInlineForm = loadedOnce && !loadError && !queues.length
  const platformLabelOf = id => platforms.find(([key]) => key === id)?.[1] || id

  const submitButton = (block = true) => <button type="submit" form={FORM_ID} className={`ds-btn ds-btn--primary${block ? ' ds-btn--block' : ''}`} disabled={saving || !form.platforms.length || !form.days.length || (mediaRequired && !media)}>
    {saving ? <><span className="ds-spinner" aria-hidden="true" />{media ? 'Enviando mídia…' : 'Criando rotina…'}</> : <><Icon name="plus" />Criar rotina</>}
  </button>

  const createForm = <form id={FORM_ID} className="rep-compose" onSubmit={save}>
    <div className="ds-field">
      <label className="ds-label" htmlFor="rep-name">Nome da rotina</label>
      <input id="rep-name" className="ds-input" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Ex.: Dicas da semana" required />
      <p className="ds-hint">Um nome fácil de reconhecer depois.</p>
    </div>
    <div className="ds-field">
      <label className="ds-label" htmlFor="rep-text">Texto da publicação</label>
      <textarea id="rep-text" className="ds-textarea" value={form.text} onChange={event => setForm(current => ({ ...current, text: event.target.value }))} placeholder="Uma ideia que será publicada nos dias selecionados…" required />
      <p className="ds-hint">O mesmo texto e a mesma mídia são reutilizados em cada execução da rotina.</p>
    </div>
    <div className="ds-field">
      <p className="ds-label">Mídia da publicação <span className="ds-label__req">{mediaRequired ? 'obrigatória' : 'opcional'}</span></p>
      <label className="rep-media" data-filled={media ? 'true' : undefined}>
        <input className="rep-media__input" type="file" accept={videoOnly ? 'video/*' : 'image/*,video/*'} onChange={selectMedia} />
        <span className="ds-icontile" aria-hidden="true"><Icon name={media?.file.type.startsWith('video/') ? 'video' : 'upload'} /></span>
        <span className="rep-media__text">
          <strong>{media ? media.file.name : videoOnly ? 'Escolher vídeo' : 'Escolher imagem ou vídeo'}</strong>
          <small>{media ? `${(media.file.size / 1024 / 1024).toFixed(1)} MB · pronto para enviar` : 'Os limites de tamanho e duração variam conforme as redes e são validados antes da publicação.'}</small>
        </span>
        <span className="ds-btn ds-btn--secondary ds-btn--sm rep-media__action" aria-hidden="true">{media ? 'Trocar' : 'Selecionar'}</span>
      </label>
      {media ? <div className="rep-media__preview">
        {media.file.type.startsWith('video/') ? <video src={media.previewUrl} muted controls preload="metadata" /> : <img src={media.previewUrl} alt="Prévia da mídia selecionada" />}
        <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm" onClick={removeMedia}><Icon name="trash" size={16} />Remover mídia</button>
      </div> : null}
    </div>

    <fieldset className="rep-group">
      <legend className="ds-label">Onde publicar? <span className="ds-label__req">{selectedPlatforms.length ? selectedPlatformsLabel : 'Nenhuma rede selecionada'}</span></legend>
      <div className="ds-netswitch rep-group__options" role="group" aria-label="Redes da rotina">
        {platforms.map(([id, label]) => <button type="button" className="ds-netswitch__opt" aria-pressed={form.platforms.includes(id)} onClick={() => togglePlatform(id)} key={id}><NetworkGlyph network={id} size={16} />{label}</button>)}
      </div>
      <p className="ds-hint">Publica em todas as contas conectadas de cada rede escolhida.</p>
    </fieldset>

    {form.platforms.includes('tiktok') && <div className="ds-field">
      <label className="ds-label" htmlFor="rep-tiktok">Privacidade do TikTok</label>
      <span className="ds-select">
        <select id="rep-tiktok" className="ds-select__control" value={tiktokPrivacyLevel} onChange={event => setTiktokPrivacyLevel(event.target.value)}>
          <option value="PUBLIC_TO_EVERYONE">Público</option>
          <option value="MUTUAL_FOLLOW_FRIENDS">Amigos</option>
          <option value="FOLLOWER_OF_CREATOR">Seguidores do criador</option>
          <option value="SELF_ONLY">Somente eu</option>
        </select>
        <Icon name="chevronDown" className="ds-select__chev" />
      </span>
    </div>}

    <fieldset className="rep-group">
      <legend className="ds-label">Quando publicar? <span className="ds-label__req">{selectedDays.length ? `${selectedDays.length} ${selectedDays.length === 1 ? 'dia' : 'dias'}` : 'Selecione ao menos um dia'}</span></legend>
      <div className="rep-days" role="group" aria-label="Dias da semana">
        {days.map(([id, label]) => <button type="button" className="rep-day" aria-pressed={form.days.includes(id)} onClick={() => toggleDay(id)} key={id}>{label}</button>)}
      </div>
      <div className="ds-field rep-time">
        <p className="ds-label" id="rep-time-label">Horário</p>
        <TimeField id="rep-time" value={form.time} onChange={time => setForm(current => ({ ...current, time }))} labelledBy="rep-time-label" />
        <p className="ds-hint">Segue o fuso horário configurado no seu perfil.</p>
      </div>
    </fieldset>

    <div className="rep-recap" role="status">
      <Icon name="repeat" />
      <p><strong>Resumo da rotina</strong><span>{selectedDays.length ? `${selectedDays.join(', ')} às ${form.time}` : 'Escolha os dias'} · {selectedPlatforms.length ? `em ${selectedPlatforms.join(', ')}` : 'escolha as redes'}</span></p>
    </div>
    {showInlineForm && submitButton()}
  </form>

  return <div className="ds-page rep" data-ds-root>
    <header className="ds-pagehead rep-head">
      <div className="ds-pagehead__text">
        <p className="ds-eyebrow">Automação</p>
        <h1 className="ds-pagehead__title">Repetidor de posts</h1>
        <p className="ds-pagehead__lede">Crie rotinas que publicam o mesmo conteúdo nos dias e horários escolhidos, sem refazer o agendamento.</p>
      </div>
      {!showInlineForm && !loadError && loadedOnce && <div className="ds-pagehead__actions">
        <button type="button" className="ds-btn ds-btn--primary" onClick={() => setFormOpen(true)}><Icon name="plus" />Nova rotina</button>
      </div>}
    </header>

    {loadError && <div className="ds-alert" data-tone="danger" role="alert">
      <Icon name="alertCircle" className="ds-alert__icon" />
      <p className="ds-alert__title">Não foi possível carregar suas rotinas</p>
      <p className="ds-alert__text">{loadError}</p>
      <div className="ds-alert__actions"><button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={loadAll} disabled={loading}>Tentar de novo</button></div>
    </div>}

    {!loadedOnce
      ? !loadError && <div aria-busy="true"><p className="ds-sr-only" aria-live="polite">Carregando suas rotinas…</p>{[1, 2].map(item => <span className="ds-skel rep-skel" key={item} />)}</div>
      : showInlineForm
        ? <section className="rep-start" aria-labelledby="rep-start-title">
            <div className="rep-start__intro">
              <span className="ds-icontile ds-icontile--lg" aria-hidden="true"><Icon name="repeat" /></span>
              <h2 className="ds-empty__title" id="rep-start-title">Nenhuma rotina criada ainda</h2>
              <p className="ds-empty__text">Monte sua primeira rotina e deixe o conteúdo pronto para voltar à agenda automaticamente.</p>
            </div>
            <div className="rep-start__body">{createForm}</div>
          </section>
        : queues.length > 0 && <section className="rep-list" aria-labelledby="rep-list-title" aria-busy={loading || undefined}>
            <div className="rep-list__head">
              <h2 className="rep-list__title" id="rep-list-title">Rotinas configuradas</h2>
              <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm" onClick={loadAll} disabled={loading} aria-label="Atualizar rotinas">{loading ? <span className="ds-spinner" aria-hidden="true" /> : <Icon name="refresh" size={16} />}Atualizar</button>
            </div>
            {/* Celular: busca + "Filtros" (folha). Desktop: a barra com os estados. Os dois mexem no mesmo estado. */}
            <div className="ds-filterbar rep-list__tools">
              <label className="ds-inputwrap rep-list__search">
                <Icon name="search" />
                <input className="ds-input" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nome ou conteúdo…" aria-label="Buscar rotina" />
              </label>
              {phone
                ? <FiltersButton count={statusFilter !== 'all' ? 1 : 0} open={filtersOpen} onClick={() => setFiltersOpen(true)} />
                : <div className="ds-seg" role="group" aria-label="Filtrar rotinas">
                    {STATUS_FILTERS.map(([key, label]) => <button type="button" className="ds-seg__opt" aria-pressed={statusFilter === key} onClick={() => setStatusFilter(key)} key={key}>{label}<span className="rep-count">{statusCounts[key]}</span></button>)}
                  </div>}
            </div>

            {filteredQueues.length
              ? <ul className="rep-routines">
                  {filteredQueues.map(queue => {
                    const busy = busyId === queue.id
                    const queuePlatforms = queue.platforms || []
                    const nextRun = formatNextRun(queue)
                    return <li className="rep-routine" data-active={queue.active || undefined} key={queue.id} aria-busy={busy || undefined}>
                      <div className="rep-routine__head">
                        <h3>{queue.name}</h3>
                        <span className="ds-status ds-status--soft" data-status={queue.active ? 'ok' : 'muted'}><Icon name={queue.active ? 'checkCircle' : 'clock'} />{queue.active ? 'Ativa' : 'Pausada'}</span>
                        <OverflowMenu label={`Mais ações para ${queue.name}`} items={[{ label: 'Excluir', icon: 'trash', danger: true, disabled: busyId !== null, onSelect: () => remove(queue) }]} />
                      </div>
                      <p className="rep-routine__text">{queue.content?.text || 'Conteúdo por plataforma'}</p>
                      {queue.content?.mediaPath ? <p className="ds-meta rep-routine__media"><Icon name={String(queue.content.mediaType || '').startsWith('video/') ? 'video' : 'image'} size={16} />Mídia anexada{queue.content.mediaName ? ` · ${queue.content.mediaName}` : ''}</p> : null}
                      <div className="rep-routine__foot">
                        <p className="rep-routine__when">
                          <span><Icon name="clock" size={16} /><strong>{queue.recurrence?.time || '10:00'}</strong> · {formatQueueDays(queue)}</span>
                          <span className="rep-routine__next">{queue.active ? (nextRun ? <>Próxima: <strong>{nextRun}</strong></> : 'Próxima: a definir') : 'Pausada: ative para retomar'}</span>
                          <span className="rep-routine__nets" aria-label={`Redes: ${queuePlatforms.map(platformLabelOf).join(', ') || 'nenhuma'}`}>
                            {queuePlatforms.length ? queuePlatforms.map(platform => <NetworkGlyph key={platform} network={platform} size={18} />) : <span className="ds-meta">Nenhuma rede</span>}
                          </span>
                        </p>
                        <button type="button" className={`ds-btn ds-btn--sm ${queue.active ? 'ds-btn--secondary' : 'ds-btn--primary'}`} onClick={() => toggle(queue)} disabled={busyId !== null}>
                          {busy ? <span className="ds-spinner" aria-hidden="true" /> : <Icon name={queue.active ? 'halfCircle' : 'play'} size={16} />}{queue.active ? 'Pausar rotina' : 'Ativar rotina'}
                        </button>
                      </div>
                    </li>
                  })}
                </ul>
              : <div className="ds-empty ds-empty--quiet rep-empty">
                  <p className="ds-empty__title ds-empty__title--sm">Nenhuma rotina encontrada</p>
                  <p className="ds-empty__text">Tente outro termo ou limpe os filtros para ver suas rotinas.</p>
                  <div className="ds-empty__actions"><button type="button" className="ds-go" onClick={() => { setSearch(''); setStatusFilter('all') }}>Limpar filtros<Icon name="arrow" /></button></div>
                </div>}
          </section>}

    {phone && <FilterSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} value={{ status: statusFilter }} emptyValue={{ status: 'all' }} onApply={next => setStatusFilter(next.status)} title="Filtrar rotinas">
      {(draft, setDraft) => <FilterGroup title="Situação">
        {STATUS_FILTERS.map(([key, label]) => <FilterOption key={key} icon={key === 'active' ? 'checkCircle' : key === 'paused' ? 'clock' : 'repeat'} selected={draft.status === key} onSelect={() => setDraft({ status: key })}>{label} · {statusCounts[key]}</FilterOption>)}
      </FilterGroup>}
    </FilterSheet>}

    {/* Folha do DS: prende o foco, fecha no Escape, trava a rolagem e devolve o foco ao "Nova rotina". */}
    {!showInlineForm && <Sheet
      open={formOpen}
      onClose={() => { if (!saving) setFormOpen(false) }}
      eyebrow="Nova rotina"
      title="Criar uma rotina"
      size="lg"
      className="rep-sheet"
      footer={<>
        <button type="button" className="ds-btn ds-btn--quiet" onClick={() => setFormOpen(false)} disabled={saving}>Cancelar</button>
        {submitButton(false)}
      </>}
    >
      {createForm}
    </Sheet>}
  </div>
}
