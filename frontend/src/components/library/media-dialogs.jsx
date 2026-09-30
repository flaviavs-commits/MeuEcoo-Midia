import { useEffect, useRef, useState } from 'react'
import { Icon } from '../ui/icon.jsx'
import { Sheet } from '../ui/floating.jsx'
import { Select } from '../ui/select.jsx'
import { FilterOption } from '../ui/filters.jsx'
import { formatDate, formatName, formatSize, isVideo, kindLabel } from './media-format.js'

/*
 * Preview of one asset: the whole media, its facts (the dimensions are measured from the file as it
 * loads — the API does not store them) and the actions: use in a post, edit, move, download, delete.
 */
export function MediaPreview({ asset, onClose, onUse, onEdit, onMove, onRemove }) {
  const [dimensions, setDimensions] = useState(null)
  useEffect(() => { setDimensions(null) }, [asset?.id])
  const video = isVideo(asset)
  const tags = Array.isArray(asset?.tags) ? asset.tags : []
  return <Sheet
    open={Boolean(asset)}
    onClose={onClose}
    eyebrow={asset ? kindLabel(asset) : ''}
    title={asset?.name || ''}
    size="lg"
    className="lib-preview"
    footer={asset && <>
      <button type="button" className="ds-btn ds-btn--danger" onClick={() => onRemove(asset)}><Icon name="trash" />Remover</button>
      <span className="lib-preview__actions">
        <button type="button" className="ds-btn ds-btn--secondary" onClick={() => onEdit(asset)}><Icon name="compose" />Editar</button>
        <button type="button" className="ds-btn ds-btn--primary" onClick={() => onUse(asset)}>Usar no Meu Post</button>
      </span>
    </>}
  >
    {asset && <div className="lib-preview__body">
      <div className="lib-preview__media">
        {video
          ? <video src={asset.url} controls playsInline preload="metadata" onLoadedMetadata={event => setDimensions([event.currentTarget.videoWidth, event.currentTarget.videoHeight])} />
          : <img src={asset.url} alt={asset.name} onLoad={event => setDimensions([event.currentTarget.naturalWidth, event.currentTarget.naturalHeight])} />}
      </div>
      <dl className="lib-preview__facts">
        <div><dt>Formato</dt><dd>{formatName(asset) || '—'}</dd></div>
        <div><dt>Tamanho</dt><dd>{formatSize(asset.sizeBytes) || '—'}</dd></div>
        <div><dt>Dimensões</dt><dd>{dimensions?.[0] ? `${dimensions[0]} × ${dimensions[1]} px` : '—'}</dd></div>
        <div><dt>Adicionada em</dt><dd>{formatDate(asset.createdAt) || '—'}</dd></div>
        <div><dt>Pasta</dt><dd>{asset.folder || 'Geral'}</dd></div>
      </dl>
      <div className="lib-preview__extra">
        <p className="lib-preview__tags">{tags.length ? tags.map(tag => <span className="lib-tag" key={tag}>#{tag}</span>) : <span className="ds-meta">Sem tags</span>}</p>
        <span className="lib-preview__links">
          <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm" onClick={() => onMove(asset)}><Icon name="folderMove" size={16} />Mover</button>
          <a className="ds-btn ds-btn--quiet ds-btn--sm" href={asset.url} target="_blank" rel="noopener noreferrer" download={asset.name}><Icon name="download" size={16} />Baixar<span className="ds-sr-only"> (abre em nova aba)</span></a>
        </span>
      </div>
    </div>}
  </Sheet>
}

// Tags as the backend stores them: trimmed, lower case, at most 20, each up to 100 characters.
function TagInput({ id, tags, onChange, describedBy }) {
  const [draft, setDraft] = useState('')
  const add = raw => {
    const tag = String(raw || '').trim().replace(/^#/, '').toLowerCase().slice(0, 100)
    setDraft('')
    if (!tag || tags.includes(tag) || tags.length >= 20) return
    onChange([...tags, tag])
  }
  return <div className="lib-tags ds-input" onClick={event => event.currentTarget.querySelector('input')?.focus()}>
    {tags.map(tag => <span className="lib-tag lib-tag--editable" key={tag}>
      #{tag}
      <button type="button" onClick={() => onChange(tags.filter(item => item !== tag))} aria-label={`Remover a tag ${tag}`}><Icon name="close" size={14} /></button>
    </span>)}
    <input
      id={id}
      className="lib-tags__input"
      value={draft}
      aria-describedby={describedBy}
      placeholder={tags.length ? '' : 'Ex.: campanha, bastidores'}
      onChange={event => {
        const value = event.target.value
        if (value.includes(',')) value.split(',').forEach((part, index, parts) => (index < parts.length - 1 ? add(part) : setDraft(part)))
        else setDraft(value)
      }}
      onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); add(draft) }
        else if (event.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1))
      }}
      onBlur={() => add(draft)}
    />
  </div>
}

export function MediaEditDialog({ asset, folders, onClose, onSave }) {
  const [name, setName] = useState('')
  const [folder, setFolder] = useState('Geral')
  const [tags, setTags] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!asset) return
    setName(asset.name || '')
    setFolder(asset.folder || 'Geral')
    setTags(Array.isArray(asset.tags) ? asset.tags : [])
    setError('')
  }, [asset])
  const folderOptions = [...new Set(['Geral', ...folders.map(item => item.name), folder])].map(item => ({ value: item, label: item }))

  async function submit(event) {
    event.preventDefault()
    if (saving) return
    if (!name.trim()) { setError('Dê um nome para a mídia.'); return }
    setSaving(true)
    setError('')
    try { await onSave(asset, { name: name.trim(), folder, tags }) }
    catch (caught) { setError(caught.message || 'Não foi possível salvar as alterações.') }
    finally { setSaving(false) }
  }

  return <Sheet
    open={Boolean(asset)}
    onClose={onClose}
    title="Editar mídia"
    size="md"
    footer={<>
      <button type="button" className="ds-btn ds-btn--secondary" onClick={onClose}>Cancelar</button>
      <button type="submit" form="lib-edit-form" className="ds-btn ds-btn--primary" disabled={saving}>{saving ? <><span className="ds-spinner" aria-hidden="true" />Salvando…</> : 'Salvar'}</button>
    </>}
  >
    <form id="lib-edit-form" className="lib-edit" onSubmit={submit} noValidate>
      <div className="ds-field">
        <label className="ds-label" htmlFor="lib-edit-name">Nome</label>
        <input id="lib-edit-name" className="ds-input" value={name} maxLength={255} onChange={event => { setName(event.target.value); setError('') }} aria-invalid={error && !name.trim() ? 'true' : undefined} data-autofocus />
      </div>
      <div className="ds-field">
        <label className="ds-label" htmlFor="lib-edit-folder">Pasta</label>
        <Select id="lib-edit-folder" value={folder} onChange={setFolder} options={folderOptions} sheetTitle="Pasta" />
      </div>
      <div className="ds-field">
        <label className="ds-label" htmlFor="lib-edit-tags">Tags</label>
        <TagInput id="lib-edit-tags" tags={tags} onChange={setTags} describedBy="lib-edit-tags-hint" />
        <p className="ds-hint" id="lib-edit-tags-hint">Enter ou vírgula adiciona; até 20 tags. A busca da Biblioteca também encontra por tag.</p>
      </div>
      {error && <p className="ds-fieldmsg" data-tone="danger" role="alert"><Icon name="alertCircle" size={16} />{error}</p>}
    </form>
  </Sheet>
}

export function MediaMoveDialog({ asset, folders, onClose, onMove }) {
  const [target, setTarget] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (asset) { setTarget(asset.folder || 'Geral'); setError('') } }, [asset])
  const names = [...new Set(['Geral', ...folders.map(item => item.name)])]

  async function submit() {
    if (saving || !asset) return
    setSaving(true)
    setError('')
    try { await onMove(asset, target) }
    catch (caught) { setError(caught.message || 'Não foi possível mover a mídia.') }
    finally { setSaving(false) }
  }

  return <Sheet
    open={Boolean(asset)}
    onClose={onClose}
    title="Mover para pasta"
    description={asset?.name}
    size="sm"
    className="lib-move"
    footer={<>
      <button type="button" className="ds-btn ds-btn--secondary" onClick={onClose}>Cancelar</button>
      <button type="button" className="ds-btn ds-btn--primary" disabled={saving || !asset || target === (asset.folder || 'Geral')} onClick={submit}>{saving ? <><span className="ds-spinner" aria-hidden="true" />Movendo…</> : 'Mover'}</button>
    </>}
  >
    <div className="lib-move__list" role="radiogroup" aria-label="Pasta de destino">
      {names.map(name => <FilterOption key={name} icon="folder" selected={target === name} onSelect={() => setTarget(name)}>
        {name}{asset && name === (asset.folder || 'Geral') ? ' (atual)' : ''}
      </FilterOption>)}
    </div>
    {error && <p className="ds-fieldmsg" data-tone="danger" role="alert"><Icon name="alertCircle" size={16} />{error}</p>}
  </Sheet>
}

export function FolderDialog({ open, onClose, onCreate }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  useEffect(() => { if (open) { setName(''); setError('') } }, [open])

  async function submit(event) {
    event.preventDefault()
    if (saving) return
    if (!name.trim()) { setError('Dê um nome para a pasta.'); inputRef.current?.focus(); return }
    setSaving(true)
    setError('')
    try { await onCreate(name.trim()) }
    catch (caught) { setError(caught.message || 'Não foi possível criar a pasta.') }
    finally { setSaving(false) }
  }

  return <Sheet
    open={open}
    onClose={onClose}
    title="Nova pasta"
    description="Crie a pasta e abra-a: as mídias enviadas ali dentro entram nela."
    size="sm"
    footer={<>
      <button type="button" className="ds-btn ds-btn--secondary" onClick={onClose}>Cancelar</button>
      <button type="submit" form="lib-folder-form" className="ds-btn ds-btn--primary" disabled={saving}>{saving ? <><span className="ds-spinner" aria-hidden="true" />Criando…</> : 'Criar pasta'}</button>
    </>}
  >
    <form id="lib-folder-form" onSubmit={submit} noValidate>
      <div className="ds-field">
        <label className="ds-label" htmlFor="lib-folder-name">Nome da nova pasta</label>
        <input id="lib-folder-name" ref={inputRef} className="ds-input" value={name} maxLength={80} placeholder="Ex.: Campanhas de verão" onChange={event => { setName(event.target.value); setError('') }} aria-invalid={error ? 'true' : undefined} data-autofocus />
      </div>
      {error && <p className="ds-fieldmsg" data-tone="danger" role="alert"><Icon name="alertCircle" size={16} />{error}</p>}
    </form>
  </Sheet>
}
