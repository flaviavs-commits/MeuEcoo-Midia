import { useEffect, useRef, useState } from 'react'
import { apiFetch, messageOf } from '../../lib/api.js'
import { Icon } from '../ui/icon.jsx'
import { Sheet } from '../ui/floating.jsx'

// Baixar as mídias do kit para a biblioteca leva mais que uma chamada comum
// (até 30 arquivos, cada um com tempo limite próprio no servidor).
const IMPORT_TIMEOUT_MS = 180_000

const EXAMPLE = `{
  "title": "Kit de 03/10",
  "items": [
    {
      "platforms": ["instagram", "tiktok"],
      "textByPlatform": { "instagram": "Legenda do Instagram", "tiktok": "Legenda curta" },
      "media": [{ "url": "https://exemplo.com/peca.jpg" }]
    }
  ]
}`

/*
 * Importa um kit (lote de posts prontos, contrato em docs/KIT-IMPORTACAO.md) como ideias do Baú.
 * Nada é publicado: cada item vira uma ideia para revisar e levar ao Meu Post. Se parte dos itens
 * falhar, o diálogo continua aberto mostrando quais e por quê; os que entraram já estão no Baú.
 */
export function KitImportDialog({ open, onClose, onImported }) {
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const [failures, setFailures] = useState([])
  const [importing, setImporting] = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (open) { setContent(''); setError(''); setFailures([]) }
  }, [open])

  async function readFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try { setContent(await file.text()); setError(''); setFailures([]) }
    catch { setError('Não foi possível ler o arquivo escolhido.') }
  }

  async function submit(event) {
    event.preventDefault()
    if (importing) return
    let kit
    try { kit = JSON.parse(content) }
    catch { setError('O conteúdo não é um JSON válido. Confira vírgulas, aspas e chaves.'); textareaRef.current?.focus(); return }
    if (!kit || !Array.isArray(kit.items) || !kit.items.length) {
      setError('O kit precisa ter uma lista "items" com pelo menos um item.')
      textareaRef.current?.focus()
      return
    }

    setImporting(true)
    setError('')
    setFailures([])
    try {
      const result = await apiFetch('/api/drafts/import', { method: 'POST', body: JSON.stringify(kit), timeoutMs: IMPORT_TIMEOUT_MS })
      const failed = (result.itens || []).filter(item => !item.ok)
      onImported(result)
      if (!failed.length) { onClose(); return }
      setFailures(failed)
      setError(result.criados
        ? `${result.criados} de ${result.total} itens entraram no Baú de Ideias. Os itens abaixo não entraram; corrija e importe só eles.`
        : 'Nenhum item entrou no Baú de Ideias. Veja o motivo de cada um abaixo.')
    }
    catch (caught) { setError(messageOf(caught, 'Não foi possível importar o kit agora. Tente de novo.')) }
    finally { setImporting(false) }
  }

  return <Sheet
    open={open}
    onClose={onClose}
    title="Importar kit"
    description="Cole o kit em JSON ou escolha o arquivo. Cada item vira uma ideia no Baú para você revisar; nada é publicado nem agendado."
    size="lg"
    footer={<>
      <button type="button" className="ds-btn ds-btn--secondary" onClick={onClose}>{failures.length ? 'Fechar' : 'Cancelar'}</button>
      <button type="submit" form="bau-kit-form" className="ds-btn ds-btn--primary" disabled={importing || !content.trim()}>
        {importing ? <><span className="ds-spinner" aria-hidden="true" />Importando…</> : 'Importar para o Baú'}
      </button>
    </>}
  >
    <form id="bau-kit-form" className="bau-kit" onSubmit={submit} noValidate>
      <div className="ds-field">
        <div className="ds-field__top">
          <label className="ds-label" htmlFor="bau-kit-content">Kit (JSON)</label>
          <label className="ds-btn ds-btn--quiet ds-btn--sm bau-kit__file">
            <Icon name="upload" />Escolher arquivo
            <input type="file" accept=".json,application/json" className="bau-kit__file-input" onChange={readFile} />
          </label>
        </div>
        <textarea
          id="bau-kit-content"
          ref={textareaRef}
          className="ds-textarea bau-kit__content"
          rows={12}
          spellCheck={false}
          value={content}
          placeholder={EXAMPLE}
          onChange={event => { setContent(event.target.value); setError('') }}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby="bau-kit-hint"
        />
        <p className="ds-hint" id="bau-kit-hint">Até 20 itens e 30 mídias por kit. Cada item precisa de texto (geral ou por rede); as mídias vêm por link https e são copiadas para a sua biblioteca.</p>
      </div>
      {error && <p className="ds-fieldmsg" data-tone="danger" role="alert"><Icon name="alertCircle" size={16} />{error}</p>}
      {failures.length > 0 && <ul className="bau-kit__failures" aria-label="Itens que não entraram">
        {failures.map(item => <li key={item.index}><strong>Item {item.index + 1}:</strong> {item.erro}</li>)}
      </ul>}
    </form>
  </Sheet>
}
