import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import { useToast } from '../components/ui/toast.jsx'
import { Icon, NetworkGlyph } from '../components/ui/icon.jsx'
import { OverflowMenu } from '../components/ui/overflow-menu.jsx'

const platforms = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['youtube', 'YouTube'], ['tiktok', 'TikTok']]
const days = [['1', 'Seg'], ['2', 'Ter'], ['3', 'Qua'], ['4', 'Qui'], ['5', 'Sex'], ['6', 'Sáb'], ['0', 'Dom']]

export function ContentQueuesPage() {
  const [queues, setQueues] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [media, setMedia] = useState(null)
  const [tiktokPrivacyLevel, setTiktokPrivacyLevel] = useState('PUBLIC_TO_EVERYONE')
  const [form, setForm] = useState({ name: '', text: '', platforms: ['instagram'], days: ['1', '3', '5'], time: '10:00' })
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const mediaRef = useRef(null)
  const drawerCloseRef = useRef(null)
  const notify = useToast()
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/api/content-queues')
      setQueues(data.queues || [])
    } finally {
      setLoading(false)
      setLoadedOnce(true)
    }
  }, [])
  useEffect(() => { load().catch(error => notify(error.message, 'error')) }, [load, notify])
  // Libera a prévia da mídia ao sair da página.
  useEffect(() => { mediaRef.current = media }, [media])
  useEffect(() => () => { if (mediaRef.current?.previewUrl) URL.revokeObjectURL(mediaRef.current.previewUrl) }, [])
  useEffect(() => {
    if (!formOpen) return undefined
    drawerCloseRef.current?.focus()
    const onKey = event => { if (event.key === 'Escape') setFormOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [formOpen])
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
    if (!response.ok) throw new Error(`Não foi possível enviar ${file.name}.`)
    const uploaded = await response.json().catch(() => null)
    const mediaUrl = signed.mediaUrl || uploaded?.url
    if (!mediaUrl) throw new Error('O upload não retornou uma URL válida.')
    return { url: mediaUrl, size: file.size }
  }
  async function save(event) {
    event.preventDefault()
    if (!form.platforms.length || !form.days.length) return notify('Selecione ao menos uma rede e um dia.', 'error')
    if (form.platforms.some(platform => ['instagram', 'youtube', 'tiktok'].includes(platform)) && !media) return notify('Instagram, YouTube e TikTok precisam de mídia anexada.', 'error')
    if (form.platforms.includes('youtube') && media && !media.file.type.startsWith('video/')) return notify('O YouTube precisa de um vídeo anexado.', 'error')
    setSaving(true)
    try {
      const uploadedMedia = media ? await uploadMedia(media.file) : null
      await apiFetch('/api/content-queues', { method: 'POST', body: JSON.stringify({ name: form.name, platforms: form.platforms, content: { text: form.text, ...(uploadedMedia ? { mediaPath: uploadedMedia.url, mediaType: media.file.type, mediaName: media.file.name, mediaSize: uploadedMedia.size } : {}), ...(form.platforms.includes('tiktok') ? { tiktokPrivacyLevel } : {}) }, recurrence: { days: form.days.map(Number), time: form.time } }) })
      setForm(current => ({ ...current, name: '', text: '' }))
      removeMedia()
      await load()
      setFormOpen(false)
      notify('Rotina de publicação criada.')
    } catch (error) {
      notify(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }
  async function toggle(queue) {
    setBusyId(queue.id)
    try { await apiFetch(`/api/content-queues/${queue.id}`, { method: 'PATCH', body: JSON.stringify({ active: !queue.active, recurrence: queue.recurrence }) }); await load() } catch (error) { notify(error.message, 'error') } finally { setBusyId(null) }
  }
  async function remove(queue) {
    if (!window.confirm(`Excluir a rotina ${queue.name}?`)) return
    setBusyId(queue.id)
    try { await apiFetch(`/api/content-queues/${queue.id}`, { method: 'DELETE' }); setQueues(current => current.filter(item => item.id !== queue.id)); notify('Rotina removida.') } catch (error) { notify(error.message, 'error') } finally { setBusyId(null) }
  }
  const activeQueues = queues.filter(queue => queue.active).length
  const pausedQueues = queues.length - activeQueues
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
    return labels.length ? labels.join(' · ') : 'Dias não definidos'
  }

  function formatNextRun(queue) {
    return queue.nextRunAt
      ? new Date(queue.nextRunAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      : 'Pausada'
  }

  const showInlineForm = loadedOnce && !queues.length
  const platformLabelOf = id => platforms.find(([key]) => key === id)?.[1] || id

  const createForm = <form className="rep-compose" onSubmit={save}>
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
        <label className="ds-label" htmlFor="rep-time">Horário</label>
        <input id="rep-time" className="ds-input" type="time" value={form.time} onChange={event => setForm(current => ({ ...current, time: event.target.value }))} />
        <p className="ds-hint">Segue o fuso horário configurado no seu perfil.</p>
      </div>
    </fieldset>

    <div className="rep-recap" role="status">
      <Icon name="repeat" />
      <p><strong>Resumo da rotina</strong><span>{selectedDays.length ? `${selectedDays.join(', ')} às ${form.time}` : 'Escolha os dias'} · {selectedPlatforms.length ? `em ${selectedPlatforms.join(', ')}` : 'escolha as redes'}</span></p>
    </div>
    <button type="submit" className="ds-btn ds-btn--primary ds-btn--block" disabled={saving || !form.platforms.length || !form.days.length || (mediaRequired && !media)}>
      {saving ? <><span className="ds-spinner" aria-hidden="true" />{media ? 'Enviando mídia…' : 'Criando rotina…'}</> : <><Icon name="plus" />Criar rotina</>}
    </button>
  </form>

  return <div className="ds-page rep" data-ds-root>
    <header className="ds-pagehead rep-head">
      <div className="ds-pagehead__text">
        <p className="ds-eyebrow">Automação</p>
        <h1 className="ds-pagehead__title">Repetidor de posts</h1>
        <p className="ds-pagehead__lede">Crie rotinas que publicam o mesmo conteúdo nos dias e horários escolhidos, sem refazer o agendamento.</p>
      </div>
      {!showInlineForm && <div className="ds-pagehead__actions">
        <button type="button" className="ds-btn ds-btn--primary" onClick={() => setFormOpen(true)}><Icon name="plus" />Nova rotina</button>
      </div>}
    </header>

    {showInlineForm
      ? <section className="rep-start" aria-labelledby="rep-start-title">
          <div className="rep-start__intro">
            <span className="ds-icontile ds-icontile--lg" aria-hidden="true"><Icon name="repeat" /></span>
            <h2 className="ds-empty__title" id="rep-start-title">Nenhuma rotina criada ainda</h2>
            <p className="ds-empty__text">Monte sua primeira rotina e deixe o conteúdo pronto para voltar à agenda automaticamente.</p>
          </div>
          <div className="rep-start__body">{createForm}</div>
        </section>
      : <section className="rep-list" aria-labelledby="rep-list-title">
          <div className="rep-list__head">
            <h2 className="rep-list__title" id="rep-list-title">Rotinas configuradas</h2>
            <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm" onClick={() => load().catch(error => notify(error.message, 'error'))} disabled={loading} aria-label="Atualizar rotinas">{loading ? <span className="ds-spinner" aria-hidden="true" /> : <Icon name="refresh" size={16} />}Atualizar</button>
          </div>
          <div className="ds-filterbar rep-list__tools">
            <label className="ds-inputwrap rep-list__search">
              <Icon name="search" />
              <input className="ds-input" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nome ou conteúdo…" aria-label="Buscar rotina" />
            </label>
            <div className="ds-seg" role="group" aria-label="Filtrar rotinas">
              {[['all', 'Todas', queues.length], ['active', 'Ativas', activeQueues], ['paused', 'Pausadas', pausedQueues]].map(([key, label, count]) => <button type="button" className="ds-seg__opt" aria-pressed={statusFilter === key} onClick={() => setStatusFilter(key)} key={key}>{label}<span className="rep-count">{count}</span></button>)}
            </div>
          </div>

          {loading && !loadedOnce
            ? <div aria-busy="true"><p className="ds-sr-only" aria-live="polite">Carregando suas rotinas…</p>{[1, 2].map(item => <span className="ds-skel rep-skel" key={item} />)}</div>
            : filteredQueues.length
              ? <ul className="rep-routines">
                  {filteredQueues.map(queue => {
                    const busy = busyId === queue.id
                    const queuePlatforms = queue.platforms || []
                    return <li className="rep-routine" data-active={queue.active || undefined} key={queue.id}>
                      <div className="rep-routine__head">
                        <div className="rep-routine__title">
                          <h3>{queue.name}</h3>
                          <span className="ds-status ds-status--soft" data-status={queue.active ? 'ok' : 'muted'}><Icon name={queue.active ? 'checkCircle' : 'clock'} />{queue.active ? 'Ativa' : 'Pausada'}</span>
                        </div>
                        <div className="rep-routine__actions">
                          <button type="button" className={`ds-btn ds-btn--sm ${queue.active ? 'ds-btn--secondary' : 'ds-btn--primary'}`} onClick={() => toggle(queue)} disabled={busy}>
                            {busy ? <span className="ds-spinner" aria-hidden="true" /> : <Icon name={queue.active ? 'halfCircle' : 'play'} size={16} />}{queue.active ? 'Pausar rotina' : 'Ativar rotina'}
                          </button>
                          <OverflowMenu label={`Mais ações para ${queue.name}`} items={[{ label: 'Excluir', icon: 'trash', danger: true, disabled: busy, onSelect: () => remove(queue) }]} />
                        </div>
                      </div>
                      <p className="rep-routine__text">“{queue.content?.text || 'Conteúdo por plataforma'}”</p>
                      {queue.content?.mediaPath ? <p className="ds-meta rep-routine__media"><Icon name={String(queue.content.mediaType || '').startsWith('video/') ? 'video' : 'image'} size={16} />Mídia anexada{queue.content.mediaName ? ` · ${queue.content.mediaName}` : ''}</p> : null}
                      <dl className="rep-routine__facts">
                        <div><dt>Horário</dt><dd>{queue.recurrence?.time || '10:00'}</dd><dd className="ds-meta">{formatQueueDays(queue)}</dd></div>
                        <div><dt>Próxima publicação</dt><dd>{formatNextRun(queue)}</dd><dd className="ds-meta">{queue.active ? 'Agendamento automático' : 'Ative para retomar'}</dd></div>
                        <div><dt>Redes</dt><dd className="rep-routine__nets">{queuePlatforms.length ? queuePlatforms.map(platform => <span key={platform}><NetworkGlyph network={platform} size={16} />{platformLabelOf(platform)}</span>) : <span className="ds-meta">Nenhuma rede</span>}</dd></div>
                      </dl>
                    </li>
                  })}
                </ul>
              : <div className="ds-empty ds-empty--quiet rep-empty">
                  <p className="ds-empty__title ds-empty__title--sm">Nenhuma rotina encontrada</p>
                  <p className="ds-empty__text">Tente outro termo ou limpe os filtros para ver suas rotinas.</p>
                  <div className="ds-empty__actions"><button type="button" className="ds-go" onClick={() => { setSearch(''); setStatusFilter('all') }}>Limpar filtros<Icon name="arrow" /></button></div>
                </div>}
        </section>}

    {formOpen && !showInlineForm && <div className="ds-scrim ds-scrim--drawer" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setFormOpen(false) }}>
      <section className="ds-drawer rep-drawer" role="dialog" aria-modal="true" aria-labelledby="rep-drawer-title">
        <header className="ds-drawer__head">
          <div className="ds-modal__heading">
            <p className="ds-eyebrow">Nova rotina</p>
            <h2 className="ds-modal__title" id="rep-drawer-title">Criar uma rotina</h2>
          </div>
          <button ref={drawerCloseRef} type="button" className="ds-btn ds-btn--quiet ds-btn--icon" onClick={() => setFormOpen(false)} aria-label="Fechar"><Icon name="close" /></button>
        </header>
        <div className="ds-drawer__body">{createForm}</div>
      </section>
    </div>}
  </div>
}
