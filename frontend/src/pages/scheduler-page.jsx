import { useEffect, useMemo, useRef, useState } from 'react'
import { readStoredJson, removeStored, writeStored } from '../lib/storage.js'
import { apiFetch } from '../lib/api.js'
import { uploadToStorage } from '../lib/upload.js'
import { TEAM_APPROVAL_UI_ENABLED } from '../lib/feature-flags.js'
import { buildValidationIssues, INSTAGRAM_CAROUSEL_MAX_ITEMS, TIKTOK_PHOTO_MAX_ITEMS, mediaFileKey, readVideoMeta } from '../lib/postValidation.js'
import { Icon, NetworkGlyph } from '../components/ui/icon.jsx'
import { OverflowMenu } from '../components/ui/overflow-menu.jsx'
import { Sheet } from '../components/ui/floating.jsx'
import { Select } from '../components/ui/select.jsx'
import { DateTimeField, localTimeZoneName, toApiDateTime } from '../components/ui/date-time-field.jsx'
import { useIsCompact, useIsPhone } from '../lib/breakpoints.js'
import { PublicationResultGroups, PublicationStatusModal } from '../components/ui/publication-status-modal.jsx'
import { createPostValidationWorker } from '../lib/postValidationWorker.js'
import { findPublicationResult, latestPublicationEventId, processingPublicationMessage, scheduledPublicationDetails } from '../lib/publicationEvents.js'
import { useToast } from '../components/ui/toast.jsx'
import { useConfirm } from '../components/ui/confirm-dialog.jsx'
import { AI_POST_DRAFT_KEY, SCHEDULER_AUTOSAVE_KEY as AUTOSAVE_KEY, clearMediaSelection, readMediaSelection } from '../lib/composer-handoff.js'
import { PLATFORM_TEXT_LIMITS, getPlatformTextLimit } from '../lib/platformTextLimits.js'
import { TIKTOK_VIDEO_DIMENSIONS, mediaKindLabel, ratioLabel, socialMediaLimitHint, socialMediaResolutionHint } from '../lib/mediaFormat.js'
import { accountIdKey, accountsForPlatform, buildAccountSelectionIssues, groupAccountsByPerson, selectedAccountsForPost } from '../lib/account-selection.js'
import '../styles/scheduler-composer.css'
import { PLATFORMS, PLATFORM_LABELS } from '../lib/platforms.js'
import { handleTabKeys } from '../lib/tab-keys.js'
import { PostPreview, VideoCoverPicker } from '../components/composer/post-preview.jsx'
import { MediaAiSuggestions, composeAiCaption } from '../components/composer/media-ai-suggestions.jsx'

const IMAGE_MIME_BY_EXTENSION = { heic: 'image/heic', heif: 'image/heif', avif: 'image/avif', tif: 'image/tiff', tiff: 'image/tiff', bmp: 'image/bmp' }
const TOKEN_STATUS = { valid: ['ok', 'Token válido'], expiring: ['warning', 'Expirando'], expired: ['failed', 'Requer atenção'], error: ['failed', 'Requer atenção'] }
const atHandle = value => (value.startsWith('@') ? value : `@${value}`)
const accountLabelOf = account => account.handle || account.name || account.tokens?.find(token => token.accountName)?.accountName || `Conta ${account.id}`
// Contas que não publicam mais: o acesso venceu ou deu erro (as que só estão "expirando" ainda funcionam).
const BROKEN_TOKEN_STATUSES = new Set(['expired', 'error'])
const ACCOUNTS_WARNING_KEY = 'meu-ecoo:accounts-warning-seen'
const PUBLICATION_MONITOR_MAX_MS = 30 * 60 * 1000
function tokenStatusOf(account) {
  return account.tokens?.find(token => token.status)?.status || ''
}

function handleOf(account) {
  const raw = account.handle || account.name
  return raw ? atHandle(raw) : accountLabelOf(account)
}

function SelectField({ id, label, value, onChange, options, required = false }) {
  return <div className="ds-field">
    <label className="ds-label" htmlFor={id}>{label}{required && <span className="ds-label__req">obrigatório</span>}</label>
    <Select id={id} value={value} onChange={onChange} options={options.map(([optionValue, optionLabel]) => ({ value: optionValue, label: optionLabel }))} sheetTitle={label} />
  </div>
}

// O TikTok usa uma chave de estado diferente porque o formulário separa
// título e descrição, mas o payload ainda precisa considerar a rede `tiktok`.
export function textsForSelectedPlatforms(textByPlatform = {}, selected = []) {
  return Object.fromEntries(Object.entries(textByPlatform).filter(([key]) => (
    selected.includes(key) || (key === 'tiktokDescription' && selected.includes('tiktok'))
  )))
}

function normalizeMediaFile(file) {
  if (file.type) return file
  const extension = file.name.split('.').pop()?.toLowerCase()
  const type = IMAGE_MIME_BY_EXTENSION[extension]
  return type ? new File([file], file.name, { type, lastModified: file.lastModified }) : file
}

function formatFileSize(bytes) {
  if (!bytes) return '0 KB'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`
}

function readImageMeta(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight, duration: null })
      URL.revokeObjectURL(url)
    }
    image.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    image.src = url
  })
}

async function imageSourceToFile(source, fileName = 'imagem-gerada-ia.png') {
  const response = await fetch(source).catch(() => { throw new Error('Não foi possível carregar a imagem gerada pelo sistema inteligente.') })
  if (!response.ok) throw new Error('Não foi possível carregar a imagem gerada pelo sistema inteligente.')
  const blob = await response.blob()
  const extension = blob.type.split('/')[1] || 'png'
  const safeName = fileName.includes('.') ? fileName : `${fileName}.${extension}`
  return new File([blob], safeName, { type: blob.type || 'image/png', lastModified: Date.now() })
}

const youtubeCategories = [
  { id: '1', label: 'Filmes e animação' },
  { id: '2', label: 'Carros e veículos' },
  { id: '10', label: 'Música' },
  { id: '15', label: 'Animais' },
  { id: '17', label: 'Esportes' },
  { id: '19', label: 'Viagens e eventos' },
  { id: '20', label: 'Games' },
  { id: '22', label: 'Pessoas e blogs' },
  { id: '23', label: 'Comédia' },
  { id: '24', label: 'Entretenimento' },
  { id: '25', label: 'Notícias e política' },
  { id: '26', label: 'Como fazer e estilo' },
  { id: '27', label: 'Educação' },
  { id: '28', label: 'Ciência e tecnologia' },
]

async function uploadWithConcurrency(items, upload, limit, onProgress) {
  const results = new Array(items.length)
  let next = 0
  let completed = 0
  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await upload(items[index])
      completed += 1
      onProgress?.(completed, items.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function SchedulerErrorCard({ title = 'Não foi possível concluir a publicação', message, resultSummary, onReview, onClose }) {
  return <div className="ds-alert mp-alert" data-tone="danger" role="alert">
    <Icon name="alertCircle" className="ds-alert__icon" />
    <p className="ds-alert__title">{title}</p>
    <p className="ds-alert__text">{message || 'Revise os dados do post antes de tentar novamente.'}</p>
    {resultSummary && <PublicationResultGroups summary={resultSummary} />}
    <div className="ds-alert__actions">
      <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={onReview}>Revisar no editor</button>
      <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm" onClick={onClose}>Fechar aviso</button>
    </div>
    <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-btn--sm ds-alert__close" onClick={onClose} aria-label="Fechar erro"><Icon name="close" size={16} /></button>
  </div>
}

export function SchedulerPage({ onNavigate } = {}) {
  const [textByPlatform, setTextByPlatform] = useState({})
  const [titleByPlatform, setTitleByPlatform] = useState({})
  const [date, setDate] = useState('')
  const [publishNow, setPublishNow] = useState(false)
  const [workspaces, setWorkspaces] = useState([])
  const [approvalWorkspaceId, setApprovalWorkspaceId] = useState('')
  const [selected, setSelected] = useState(['instagram'])
  const [connectedAccounts, setConnectedAccounts] = useState([])
  const [selectedAccountIds, setSelectedAccountIds] = useState([])
  const [accountsLoaded, setAccountsLoaded] = useState(false)
  const [files, setFiles] = useState([])
  const [filesByPlatform, setFilesByPlatform] = useState({})
  const [mediaPreviews, setMediaPreviews] = useState([])
  const [mediaMetaByKey, setMediaMetaByKey] = useState({})
  const [videoMetaByKey, setVideoMetaByKey] = useState({})
  const [coverFile, setCoverFile] = useState(null)
  const [coverSourceKey, setCoverSourceKey] = useState('')
  const [coverTime, setCoverTime] = useState(null)
  const [youtubeTitle, setYoutubeTitle] = useState('')
  const [youtubeVisibility, setYoutubeVisibility] = useState('public')
  const [youtubeMadeForKids, setYoutubeMadeForKids] = useState('')
  const [igFormat, setIgFormat] = useState('post')
  const [igAspect, setIgAspect] = useState('auto')
  const [facebookFormat, setFacebookFormat] = useState('post')
  const [tiktokAspect, setTiktokAspect] = useState('auto')
  const [tiktokPrivacyLevel, setTiktokPrivacyLevel] = useState('PUBLIC_TO_EVERYONE')
  const [tiktokDisableComment, setTiktokDisableComment] = useState(false)
  const [tiktokDisableDuet, setTiktokDisableDuet] = useState(false)
  const [tiktokDisableStitch, setTiktokDisableStitch] = useState(false)
  const [youtubeCategoryId, setYoutubeCategoryId] = useState('')
  const [youtubeFormat, setYoutubeFormat] = useState('')
  const [error, setError] = useState('')
  const [savedMessage, setSavedMessage] = useState(null)
  const [publicationStatus, setPublicationStatus] = useState(null)
  const [publicationModalOpen, setPublicationModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [workerIssues, setWorkerIssues] = useState([])
  const [draftReady, setDraftReady] = useState(false)
  const [draftSavedAt, setDraftSavedAt] = useState(null)
  const [serverDraftStatus, setServerDraftStatus] = useState('')
  const [accountsError, setAccountsError] = useState(false)
  const [accountsAttempt, setAccountsAttempt] = useState(0)
  const [lastResult, setLastResult] = useState(null)
  const [textTab, setTextTab] = useState('instagram')
  const [issuesOpen, setIssuesOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const savingTemplateRef = useRef(false)
  const submittingRef = useRef(false)
  const feedbackRef = useRef(null)
  const pageRef = useRef(null)
  const compactLayout = useIsCompact()
  const phone = useIsPhone()
  const notify = useToast()
  const { confirm, confirmDialog } = useConfirm()
  const validationRequest = useRef(0)
  const publicationPollTimer = useRef(null)
  const activeMonitor = useRef(null)
  const mountedRef = useRef(true)
  const publicationModalOpenRef = useRef(false)
  const sourceFailureId = useRef(null)
  // Publicação com falha aberta em "Revisar no editor": ao publicar, ela sai do calendário (substituída).
  const [replacingFailureId, setReplacingFailureId] = useState(null)
  const accountGroups = useMemo(() => groupAccountsByPerson(connectedAccounts), [connectedAccounts])

  useEffect(() => {
    if (['reel', 'story'].includes(igFormat) && igAspect !== 'auto') setIgAspect('auto')
    if (igFormat === 'post' && !['auto', 'square', 'portrait', 'instagramWide'].includes(igAspect)) setIgAspect('auto')
  }, [igFormat, igAspect])
  const serverDraftId = useRef(null)
  // O worker nasce e morre com o efeito: no StrictMode (desenvolvimento) a
  // montagem dupla encerrava o worker memoizado e a validação parava de responder.
  const [validationWorker, setValidationWorker] = useState(null)
  useEffect(() => {
    const worker = createPostValidationWorker(({ requestId, issues }) => {
      if (requestId === validationRequest.current) setWorkerIssues(issues)
    })
    setValidationWorker(worker)
    return () => {
      worker?.terminate()
      setValidationWorker(null)
    }
  }, [])

  function clearComposer() {
    setTextByPlatform({}); setTitleByPlatform({}); setDate(''); setFiles([]); setFilesByPlatform({}); setCoverFile(null); setCoverSourceKey(''); setCoverTime(null); setYoutubeTitle(''); setYoutubeMadeForKids(''); setYoutubeCategoryId(''); setYoutubeFormat(''); setIgFormat('post'); setIgAspect('auto'); setFacebookFormat('post'); setTiktokAspect('auto'); setTiktokDisableComment(false); setTiktokDisableDuet(false); setTiktokDisableStitch(false); setPublishNow(false); setApprovalWorkspaceId(''); setSavedMessage(null); removeStored(AUTOSAVE_KEY); setDraftSavedAt(null); setServerDraftStatus('')
    sourceFailureId.current = null
    setReplacingFailureId(null)
  }

  function reviewError() {
    // Mantém à vista o resultado por rede para evitar reenviar a quem já recebeu.
    if (['warning', 'error'].includes(publicationStatus?.type) && publicationStatus?.resultSummary) setLastResult(publicationStatus.resultSummary)
    setError('')
    setPublicationStatus(null)
    setPublicationModalOpen(false)
    window.requestAnimationFrame(() => {
      const editor = document.querySelector('.mp-compose')
      editor?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      editor?.querySelector('textarea, input, select')?.focus({ preventScroll: true })
    })
  }

  useEffect(() => {
    apiFetch('/api/accounts').then(data => {
      const accounts = data.data || []
      setConnectedAccounts(accounts)
      setSelectedAccountIds(accounts.map(account => account.id))
      setAccountsError(false)
      setAccountsLoaded(true)
    }).catch(() => {
      setConnectedAccounts([])
      setSelectedAccountIds([])
      setAccountsError(true)
      setAccountsLoaded(true)
    })
  }, [accountsAttempt])

  useEffect(() => { if (!compactLayout) setPreviewOpen(false) }, [compactLayout])

  // Sem conta conectada, ou com conta que parou de funcionar, não dá para publicar: um aviso
  // leva a pessoa a Contas. Aparece uma vez por sessão para o mesmo problema.
  useEffect(() => {
    if (!accountsLoaded || accountsError || !onNavigate) return undefined
    const broken = connectedAccounts.filter(account => BROKEN_TOKEN_STATUSES.has(tokenStatusOf(account)))
    if (connectedAccounts.length && !broken.length) return undefined
    const signature = connectedAccounts.length ? broken.map(account => account.id).sort().join(',') : 'none'
    try { if (sessionStorage.getItem(ACCOUNTS_WARNING_KEY) === signature) return undefined } catch { /* sem armazenamento: avisa */ }
    const names = broken.map(account => `${handleOf(account)} (${PLATFORM_LABELS[account.platform] || account.platform})`)
    const listed = names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0]
    let active = true
    confirm(connectedAccounts.length
      ? {
          title: broken.length === 1 ? 'Uma conta precisa ser reconectada' : `${broken.length} contas precisam ser reconectadas`,
          description: `O acesso de ${listed} venceu ou parou de funcionar, e as publicações para ${broken.length === 1 ? 'ela' : 'elas'} vão falhar. Reconecte em Contas.`,
          confirmLabel: 'Ir para Contas', cancelLabel: 'Agora não', tone: 'warning', icon: 'plug',
        }
      : {
          title: 'Conecte uma conta para publicar',
          description: 'Nenhuma rede social está conectada ainda. Conecte Instagram, Facebook, YouTube ou TikTok em Contas e volte para publicar.',
          confirmLabel: 'Ir para Contas', cancelLabel: 'Agora não', tone: 'warning', icon: 'plug',
        }).then(go => {
      if (!active) return
      try { sessionStorage.setItem(ACCOUNTS_WARNING_KEY, signature) } catch { /* sem armazenamento */ }
      if (go) onNavigate('integracoes')
    })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountsLoaded, accountsError, connectedAccounts])

  useEffect(() => {
    if (!TEAM_APPROVAL_UI_ENABLED) return undefined
    apiFetch('/api/workspaces').then(data => setWorkspaces(data.workspaces || [])).catch(() => setWorkspaces([]))
    return undefined
  }, [])

  // Mídias deixadas por outra tela (Biblioteca, "Revisar no editor", Baú): uma ou várias, na ordem.
  // A seleção só é consumida depois de baixada; em modo estrito o efeito roda duas vezes e, se ela
  // fosse apagada antes, a segunda execução não teria o que anexar.
  useEffect(() => {
    const selection = readMediaSelection()
    if (!selection.length) return undefined

    let cancelled = false
    Promise.all(selection.map(item => fetch(item.url).then(response => {
      if (!response.ok) throw new Error('A mídia salva não está disponível neste momento.')
      return response.blob()
    }).then(blob => new File([blob], item.name || 'midia-da-biblioteca', { type: item.mimeType || blob.type || 'application/octet-stream', lastModified: Date.now() }))))
      .then(loaded => {
        if (cancelled) return
        clearMediaSelection()
        setFiles(current => [...current, ...loaded])
        notify(loaded.length === 1 ? `“${selection[0].name || 'Mídia'}” carregada do acervo.` : `${loaded.length} mídias carregadas, na ordem.`)
      })
      .catch(error => {
        if (cancelled) return
        clearMediaSelection()
        notify(error.message?.startsWith('A mídia salva') ? error.message : 'Não foi possível carregar a mídia salva. Anexe o arquivo de novo.', 'error')
      })
    return () => { cancelled = true }
  }, [notify])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearTimeout(publicationPollTimer.current)
    }
  }, [])
  useEffect(() => { publicationModalOpenRef.current = publicationModalOpen }, [publicationModalOpen])

  useEffect(() => {
    try {
      const savedDraft = readStoredJson(AUTOSAVE_KEY)
      if (savedDraft) {
        sourceFailureId.current = savedDraft.sourceFailureId || null
        setReplacingFailureId(savedDraft.sourceFailureId || null)
        const knownSelected = Array.isArray(savedDraft.selected) ? savedDraft.selected.filter(platform => PLATFORMS.includes(platform)) : []
        const savedSelected = knownSelected.length ? knownSelected : ['instagram']
        const savedText = typeof savedDraft.text === 'string' ? savedDraft.text : ''
        const savedTexts = savedDraft.textByPlatform && typeof savedDraft.textByPlatform === 'object' ? savedDraft.textByPlatform : {}
        const savedTitles = savedDraft.titleByPlatform && typeof savedDraft.titleByPlatform === 'object' ? savedDraft.titleByPlatform : {}
        const migratedTexts = Object.fromEntries(savedSelected.filter(platform => platform !== 'tiktok').map(platform => [platform, Object.prototype.hasOwnProperty.call(savedTexts, platform) ? savedTexts[platform] : savedText]))
        const { tiktok: legacyTiktokText, ...savedTextsWithoutLegacyTiktok } = savedTexts
        setTextByPlatform({
          ...savedTextsWithoutLegacyTiktok,
          ...migratedTexts,
          ...(savedTexts.tiktokDescription || legacyTiktokText ? { tiktokDescription: savedTexts.tiktokDescription || legacyTiktokText } : {})
        })
        setTitleByPlatform(savedTitles)
        setDate(savedDraft.date || '')
        setPublishNow(Boolean(savedDraft.publishNow))
        setApprovalWorkspaceId(TEAM_APPROVAL_UI_ENABLED && savedDraft.approvalWorkspaceId ? String(savedDraft.approvalWorkspaceId) : '')
        setSelected(savedSelected)
        setYoutubeTitle(savedDraft.youtubeTitle || '')
        setYoutubeVisibility(savedDraft.youtubeVisibility || 'public')
        setYoutubeMadeForKids(savedDraft.youtubeMadeForKids || '')
        setYoutubeFormat(savedDraft.youtubeFormat || '')
        setIgFormat(savedDraft.igFormat || 'post')
        setIgAspect(savedDraft.igAspect || 'auto')
        setFacebookFormat(savedDraft.facebookFormat || 'post')
        setTiktokAspect(savedDraft.tiktokAspect || 'auto')
        setTiktokPrivacyLevel(savedDraft.tiktokPrivacyLevel || 'PUBLIC_TO_EVERYONE')
        setYoutubeCategoryId(savedDraft.youtubeCategoryId ? String(savedDraft.youtubeCategoryId) : '')
        setTiktokDisableComment(Boolean(savedDraft.tiktokDisableComment))
        setTiktokDisableDuet(Boolean(savedDraft.tiktokDisableDuet))
        setTiktokDisableStitch(Boolean(savedDraft.tiktokDisableStitch))
        setDraftSavedAt(savedDraft.savedAt ? new Date(savedDraft.savedAt) : null)
      }
    } catch {
      removeStored(AUTOSAVE_KEY)
    } finally {
      setDraftReady(true)
    }
  }, [])

  useEffect(() => {
    if (!draftReady) return undefined
    const timer = setTimeout(() => {
      const hasContent = Object.values(textByPlatform).some(value => value?.trim()) || Object.values(titleByPlatform).some(value => value?.trim()) || youtubeTitle.trim() || files.length
      if (!hasContent) {
        removeStored(AUTOSAVE_KEY)
        setDraftSavedAt(null)
        return
      }
      const savedAt = new Date()
      writeStored(AUTOSAVE_KEY, JSON.stringify({ textByPlatform, titleByPlatform, date, publishNow, approvalWorkspaceId: TEAM_APPROVAL_UI_ENABLED ? approvalWorkspaceId : '', selected, youtubeTitle, youtubeVisibility, youtubeMadeForKids, youtubeFormat, igFormat, igAspect, facebookFormat, tiktokAspect, tiktokPrivacyLevel, youtubeCategoryId, tiktokDisableComment, tiktokDisableDuet, tiktokDisableStitch, sourceFailureId: sourceFailureId.current, savedAt: savedAt.toISOString() }))
      setDraftSavedAt(savedAt)
    }, 700)
    return () => clearTimeout(timer)
  }, [draftReady, textByPlatform, titleByPlatform, date, publishNow, approvalWorkspaceId, selected, youtubeTitle, youtubeVisibility, youtubeMadeForKids, youtubeFormat, igFormat, igAspect, facebookFormat, tiktokAspect, tiktokPrivacyLevel, files.length, youtubeCategoryId, tiktokDisableComment, tiktokDisableDuet, tiktokDisableStitch])

  // Só os textos das redes vão para a conta (o backend não guarda títulos nem mídia):
  // sem texto, nada é sincronizado e o status volta a ser o do rascunho local.
  useEffect(() => {
    if (!draftReady) return undefined
    const hasText = Object.values(textByPlatform).some(value => value?.trim())
    if (!hasText) { setServerDraftStatus(''); return undefined }
    const timer = setTimeout(async () => {
      try {
        if (serverDraftId.current) {
          await apiFetch(`/api/drafts/${serverDraftId.current}`, { method: 'PATCH', body: JSON.stringify({ textByPlatform, titleByPlatform, platforms: selected, igFormat, facebookFormat, youtubeFormat }) })
        } else {
          const result = await apiFetch('/api/drafts', { method: 'POST', body: JSON.stringify({ title: 'Autosave', textByPlatform, titleByPlatform, platforms: selected, igFormat, facebookFormat, youtubeFormat }) })
          serverDraftId.current = result.id
        }
        setServerDraftStatus('Texto sincronizado na conta')
      } catch {
        setServerDraftStatus('Texto salvo só neste dispositivo')
      }
    }, 1800)
    return () => clearTimeout(timer)
  }, [draftReady, textByPlatform, titleByPlatform, selected, youtubeTitle, igFormat, facebookFormat, youtubeFormat, files.length])

  // Acompanha a publicação pelos eventos do servidor. Um acompanhamento por vez; para ao sair da
  // página e depois de 30 minutos (o Calendário mostra o desfecho). Se a pessoa fechou o diálogo
  // ("Continuar em segundo plano"), o resultado chega por aviso.
  function monitorPublication(postId, initialCursor) {
    clearTimeout(publicationPollTimer.current)
    const monitor = Symbol('publication-monitor')
    activeMonitor.current = monitor
    const startedAt = Date.now()
    let cursor = initialCursor
    const stillCurrent = () => mountedRef.current && activeMonitor.current === monitor
    const poll = async () => {
      try {
        const { events = [] } = await apiFetch(`/api/logs/events/since/${cursor}`) || {}
        if (!stillCurrent()) return
        if (events.length) cursor = Math.max(cursor, ...events.map(event => Number(event.id) || 0))
        const result = findPublicationResult(events, postId)
        if (result) {
          setPublicationStatus(result)
          if (!publicationModalOpenRef.current) notify(result.message, result.type === 'success' ? 'success' : 'error')
          if (result.type === 'success') clearComposer()
          return
        }
      } catch {
        // Uma falha pontual de rede não encerra o acompanhamento; o próximo
        // ciclo tenta novamente sem substituir a mensagem da publicação.
      }
      if (stillCurrent() && Date.now() - startedAt < PUBLICATION_MONITOR_MAX_MS) publicationPollTimer.current = setTimeout(poll, 4000)
    }
    poll()
  }

  function toggle(platform) {
    setSelected(value => value.includes(platform) ? value.filter(item => item !== platform) : [...value, platform])
  }
  function toggleAccount(accountId) {
    const key = accountIdKey(accountId)
    setSelectedAccountIds(current => current.some(id => accountIdKey(id) === key)
      ? current.filter(id => accountIdKey(id) !== key)
      : [...current, accountId])
  }
  function selectAllPersonAccounts(personKey, shouldSelect) {
    const group = accountGroups.find(item => item.key === personKey)
    if (!group) return
    const availableIds = group.accounts.filter(account => selected.includes(account.platform)).map(account => account.id)
    setSelectedAccountIds(current => {
      const currentKeys = new Set(current.map(accountIdKey))
      if (shouldSelect) return [...current, ...availableIds.filter(id => !currentKeys.has(accountIdKey(id)))]
      const groupKeys = new Set(availableIds.map(accountIdKey))
      return current.filter(id => !groupKeys.has(accountIdKey(id)))
    })
  }
  function updatePlatformText(platform, value) {
    const key = platform === 'tiktok' ? 'tiktokDescription' : platform
    setTextByPlatform(current => ({ ...current, [key]: value }))
  }
  function updatePlatformTitle(platform, value) {
    setTitleByPlatform(current => ({ ...current, [platform]: value }))
  }
  function insertTiktokToken(token) {
    const current = textByPlatform.tiktokDescription || ''
    const separator = current && !/\s$/.test(current) ? ' ' : ''
    updatePlatformText('tiktok', `${current}${separator}${token}`.slice(0, 4000))
  }
  function addFiles(fileList) {
    const incoming = Array.from(fileList || []).map(normalizeMediaFile)
    const valid = incoming.filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'))
    if (incoming.length !== valid.length) {
      setError('Alguns arquivos foram ignorados. Selecione somente imagens ou vídeos.')
    }
    setFiles(current => {
      const merged = [...current, ...valid]
      const unique = merged.filter((file, index, list) => list.findIndex(item => mediaFileKey(item) === mediaFileKey(file)) === index)
      const hasVideo = unique.some(file => file.type.startsWith('video/'))
      if (selected.includes('tiktok') && hasVideo && unique.length > 1) {
        setError('O TikTok aceita um vídeo sozinho ou um carrossel somente de fotos. Remova a mistura de mídias e os arquivos extras.')
        return current
      }
      const carouselLimit = selected.includes('instagram')
        ? INSTAGRAM_CAROUSEL_MAX_ITEMS
        : selected.includes('tiktok')
          ? TIKTOK_PHOTO_MAX_ITEMS
          : INSTAGRAM_CAROUSEL_MAX_ITEMS
      if (!hasVideo && unique.length > carouselLimit) {
        setError(`Este carrossel pode ter no máximo ${carouselLimit} fotos para as redes selecionadas.`)
        return current
      }
      if (unique.length > 1 && unique.some(file => file.type.startsWith('video/'))) {
        setError('Carrosséis usam somente fotos. Remova o vídeo antes de adicionar outras imagens.')
        return current
      }
      if (unique.length > 1 && selected.includes('instagram') && igFormat !== 'post') setIgFormat('post')
      if (unique.length > 1 && selected.includes('facebook') && facebookFormat !== 'post') setFacebookFormat('post')
      return unique
    })
  }
  function selectFiles(event) { addFiles(event.target.files); event.target.value = '' }
  function dropFiles(event) { event.preventDefault(); addFiles(event.dataTransfer.files) }
  function removeFile(key) { setFiles(current => current.filter(file => mediaFileKey(file) !== key)) }
  function moveFile(index, direction) {
    setFiles(current => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  function chooseImageCover(key) {
    setCoverFile(null)
    setCoverTime(null)
    setCoverSourceKey(key)
    setFiles(current => {
      const currentIndex = current.findIndex(file => mediaFileKey(file) === key)
      if (currentIndex <= 0) return current
      const next = [...current]
      const [cover] = next.splice(currentIndex, 1)
      next.unshift(cover)
      return next
    })
  }

  function selectCoverImage(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('A capa precisa ser uma imagem.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('A imagem da capa precisa ter no máximo 2 MB.')
      return
    }
    setCoverFile(normalizeMediaFile(file))
    setCoverSourceKey('custom')
    setCoverTime(null)
  }
  // Uma vez ao abrir: traz o rascunho que o Assistente deixou (imagem e texto) para o editor.
  useEffect(() => {
    let draft = window.__socialAiPostDraft || null
    try {
      if (!draft) draft = JSON.parse(sessionStorage.getItem(AI_POST_DRAFT_KEY) || 'null')
      sessionStorage.removeItem(AI_POST_DRAFT_KEY)
    } catch { /* storage indisponível ou rascunho ilegível: segue sem ele */ }
    window.__socialAiPostDraft = null
    if (!draft?.image) return undefined

    let cancelled = false
    setTextByPlatform(draft.text ? { instagram: draft.text } : {})
    imageSourceToFile(draft.image).then(file => {
      if (!cancelled) addFiles([file])
    }).catch(error => {
      if (!cancelled) setError(error.message)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function applyMediaSuggestion(suggestionOrSuggestions, options = {}) {
    const suggestions = Array.isArray(suggestionOrSuggestions) ? suggestionOrSuggestions : [suggestionOrSuggestions]
    suggestions.filter(Boolean).forEach(suggestion => {
      const composedText = composeAiCaption(suggestion)
      if (suggestion.plataforma) updatePlatformText(suggestion.plataforma, composedText)
      if (suggestion.plataforma === 'youtube' && suggestion.titulo) setYoutubeTitle(suggestion.titulo)
    })
    if (!options.silent && suggestions.length) {
      const labels = suggestions.map(suggestion => PLATFORM_LABELS[suggestion.plataforma] || suggestion.plataforma).filter(Boolean).join(', ')
      notify(`Sugestão aplicada para ${labels}.`)
    }
  }

  // Lê a dimensão real de imagens e vídeos para identificar automaticamente
  // o tipo da mídia e escolher a proporção mais próxima na prévia.
  const allComposerFiles = useMemo(() => Array.from(new Map([
    ...files,
    ...Object.values(filesByPlatform).flat()
  ].map(file => [mediaFileKey(file), file])).values()), [files, filesByPlatform])

  useEffect(() => {
    let cancelled = false
    Promise.all(allComposerFiles.map(async file => {
      const key = mediaFileKey(file)
      const meta = file.type.startsWith('video/') ? await readVideoMeta(file) : await readImageMeta(file)
      return [key, meta ? { ...meta, kind: file.type.startsWith('video/') ? 'video' : 'image' } : null]
    })).then(entries => {
      if (!cancelled) setMediaMetaByKey(Object.fromEntries(entries.filter(([, meta]) => meta)))
    })
    return () => { cancelled = true }
  }, [allComposerFiles])

  useEffect(() => {
    if (coverFile) return
    const isCurrentPhotoCarousel = files.length > 1 && files.every(file => file.type.startsWith('image/'))
    if (isCurrentPhotoCarousel && files.length) {
      const firstKey = mediaFileKey(files[0])
      if (coverSourceKey !== firstKey) setCoverSourceKey(firstKey)
      return
    }
    const selectedCoverExists = files.some(file => mediaFileKey(file) === coverSourceKey)
    if (files.length && (!selectedCoverExists || !coverSourceKey)) setCoverSourceKey(mediaFileKey(files[0]))
    if (!files.length) setCoverSourceKey('')
  }, [files, coverFile, coverSourceKey])

  // Lê metadados (largura/altura) dos vídeos selecionados para checar a
  // proporção exigida pelo TikTok antes do upload — ver postValidation.js.
  useEffect(() => {
    let cancelado = false
    const videos = allComposerFiles.filter(file => file.type.startsWith('video/'))
    Promise.all(videos.map(async file => [mediaFileKey(file), await readVideoMeta(file)])).then(pares => {
      if (cancelado) return
      setVideoMetaByKey(Object.fromEntries(pares.filter(([, meta]) => meta)))
    })
    return () => { cancelado = true }
  }, [allComposerFiles])

  useEffect(() => {
    const previews = allComposerFiles.map(file => ({ file, key: mediaFileKey(file), url: URL.createObjectURL(file) }))
    setMediaPreviews(previews)
    return () => previews.forEach(preview => URL.revokeObjectURL(preview.url))
  }, [allComposerFiles])

  const mediaProfile = useMemo(() => {
    const firstFile = allComposerFiles[0]
    if (!firstFile) return null
    const meta = mediaMetaByKey[mediaFileKey(firstFile)]
    return {
      kind: meta?.kind || (firstFile.type.startsWith('video/') ? 'video' : 'image'),
      width: meta?.width || 0,
      height: meta?.height || 0,
      ratio: meta?.width && meta?.height ? meta.width / meta.height : null,
      duration: meta?.duration || 0,
    }
  }, [allComposerFiles, mediaMetaByKey])

  const coverFilePreviewUrl = useMemo(() => coverFile ? URL.createObjectURL(coverFile) : '', [coverFile])
  useEffect(() => () => {
    if (coverFilePreviewUrl) URL.revokeObjectURL(coverFilePreviewUrl)
  }, [coverFilePreviewUrl])
  const selectedCoverPreview = mediaPreviews.find(preview => preview.key === coverSourceKey)
  const videoCoverFile = files.find(file => file.type.startsWith('video/'))
  const isPhotoCarousel = files.length > 1 && files.every(file => file.type.startsWith('image/'))
  const coverPreviewUrl = coverFilePreviewUrl || (isPhotoCarousel ? selectedCoverPreview?.url : '') || ''
  useEffect(() => {
    if (coverFile && !videoCoverFile) {
      setCoverFile(null)
      setCoverSourceKey('')
      setCoverTime(null)
    }
  }, [videoCoverFile, coverFile])

  const carouselQualityNotes = useMemo(() => {
    if (files.length < 2 || files.some(file => !file.type.startsWith('image/'))) return []
    const metas = files.map(file => mediaMetaByKey[mediaFileKey(file)]).filter(Boolean)
    if (metas.length !== files.length) return ['Estamos lendo as dimensões de todas as fotos antes de recomendar ajustes.']
    const ratios = metas.map(meta => meta.width / meta.height).filter(Number.isFinite)
    const notes = []
    if (selected.includes('instagram') && ratios.some(ratio => ratio < 0.8 || ratio > 1.91)) {
      notes.push('Uma ou mais fotos estão fora da faixa segura do Feed do Instagram (4:5 a 1,91:1).')
    }
    if (ratios.length > 1 && Math.max(...ratios) - Math.min(...ratios) > 0.18) {
      notes.push('As fotos têm proporções diferentes; padronizar o enquadramento deixa o carrossel mais uniforme.')
    }
    if (metas.some(meta => Math.min(meta.width, meta.height) < 600)) {
      notes.push('Uma ou mais fotos têm baixa resolução e podem perder nitidez após o processamento da rede.')
    }
    return notes
  }, [files, mediaMetaByKey, selected])

  const validationInput = useMemo(() => ({
    textByPlatform, titleByPlatform, tiktokDescription: textByPlatform.tiktokDescription || '', platforms: selected, files: files.map(({ name, lastModified, size, type }) => ({ name, lastModified, size, type })),
    filesByPlatform: Object.fromEntries(Object.entries(filesByPlatform).map(([platform, platformFiles]) => [platform, platformFiles.map(({ name, lastModified, size, type }) => ({ name, lastModified, size, type }))])),
     publishNow, scheduledAt: date, youtubeTitle, youtubeMadeForKids, youtubeFormat, igFormat, facebookFormat, tiktokPrivacyLevel, videoMetaByKey, mediaMetaByKey
  }), [textByPlatform, titleByPlatform, selected, files, filesByPlatform, publishNow, date, youtubeTitle, youtubeMadeForKids, youtubeFormat, igFormat, facebookFormat, tiktokPrivacyLevel, videoMetaByKey, mediaMetaByKey])
  useEffect(() => {
    const requestId = ++validationRequest.current
    if (!validationWorker) {
      setWorkerIssues(buildValidationIssues(validationInput))
      return
    }
    validationWorker.postMessage({ ...validationInput, requestId })
  }, [validationWorker, validationInput])
  const issues = workerIssues
  const accountSelectionIssues = !accountsLoaded
    ? []
    : accountsError
      ? [{ platform: null, message: 'Não foi possível carregar suas contas. Tente de novo em “Redes”.' }]
      : buildAccountSelectionIssues(connectedAccounts, selected, selectedAccountIds)
  const blockingIssues = [...issues, ...accountSelectionIssues]
  // A data vazia não entra na contagem de pendências (a regra de validação continua a
  // mesma), mas a barra nunca diz "Pronto" enquanto ela faltar.
  const dateMissing = (!publishNow || Boolean(approvalWorkspaceId)) && !date

  async function uploadFile(file) {
    const mediaUrl = await uploadToStorage(file, { filename: file.name, mimetype: file.type })
    return { url: mediaUrl, mimetype: file.type, name: file.name, size: file.size }
  }

  async function submit(event) {
    event.preventDefault()
    if (submittingRef.current) return
    setError(''); setLastResult(null); setIssuesOpen(false); setSavedMessage(null); setPublicationStatus(null); setPublicationModalOpen(false); setProgress('')
    if (blockingIssues.length > 0) { setError(blockingIssues[0].message); return }
    if (dateMissing) { setError('Escolha a data e a hora da publicação.'); return }
    const requestingApproval = TEAM_APPROVAL_UI_ENABLED && Boolean(approvalWorkspaceId)
    if (requestingApproval && publishNow) { setError('Desative "Publicar agora" para enviar o conteúdo para aprovação.'); return }
    submittingRef.current = true
    setLoading(true)
    if (publishNow) {
      setPublicationStatus({ type: 'processing', message: processingPublicationMessage(selected) })
      setPublicationModalOpen(true)
    }
    try {
      const eventCursor = publishNow ? await latestPublicationEventId(apiFetch) : 0
      setProgress(allComposerFiles.length ? 'Enviando mídias...' : 'Validando agendamento...')
      const filesToUpload = Array.from(new Map([
        ...allComposerFiles,
        ...(coverFile ? [coverFile] : [])
      ].map(file => [mediaFileKey(file), file])).values())
      const uploadedFiles = await uploadWithConcurrency(filesToUpload, uploadFile, 3, (completed, total) => setProgress(`Enviando mídias (${completed}/${total})...`))
      const uploadedByKey = new Map(filesToUpload.map((file, index) => [mediaFileKey(file), uploadedFiles[index]]))
      const uploadedItems = platformFiles => platformFiles.map(file => uploadedByKey.get(mediaFileKey(file))).filter(Boolean)
      const media = uploadedItems(files)
      const mediaByPlatform = Object.fromEntries(Object.entries(filesByPlatform)
        .filter(([platform]) => selected.includes(platform))
        .map(([platform, platformFiles]) => [platform, uploadedItems(platformFiles)]))
      const uploadedCover = coverFile ? uploadedByKey.get(mediaFileKey(coverFile)) : null
      const cover = uploadedCover ? { url: uploadedCover.url, mimetype: uploadedCover.mimetype, name: uploadedCover.name, time: Number.isFinite(coverTime) ? coverTime : null } : null
      const scheduledAt = publishNow ? new Date().toISOString() : toApiDateTime(date)
      const platformTexts = textsForSelectedPlatforms(textByPlatform, selected)
      const accountIds = selectedAccountsForPost(connectedAccounts, selected, selectedAccountIds)
      setProgress(requestingApproval ? 'Salvando para aprovação...' : publishNow ? 'Preparando publicação imediata...' : 'Processando e salvando agendamento...')
       const createdPost = await apiFetch('/api/posts', { method: 'POST', body: JSON.stringify({ textByPlatform: JSON.stringify(platformTexts), titleByPlatform: JSON.stringify(titleByPlatform), scheduledAt, platforms: JSON.stringify(selected), accountIds: JSON.stringify(accountIds), publishNow, requiresApproval: requestingApproval, media: JSON.stringify(media), mediaByPlatform: JSON.stringify(mediaByPlatform), cover: JSON.stringify(cover), youtubeTitle, youtubeVisibility, youtubeMadeForKids: youtubeMadeForKids === '' ? undefined : youtubeMadeForKids === 'true', youtubeCategoryId: youtubeCategoryId || undefined, youtubeFormat: youtubeFormat || undefined, igFormat, facebookFormat, tiktokPrivacyLevel, tiktokDisableComment, tiktokDisableDuet, tiktokDisableStitch }) })
      if (publishNow && !createdPost?.id) throw new Error('A publicação foi enviada, mas não foi possível acompanhar a confirmação. Verifique o histórico de atividades.')
      if (requestingApproval) {
        await apiFetch(`/api/workspaces/${approvalWorkspaceId}/approvals`, { method: 'POST', body: JSON.stringify({ postId: Number(createdPost.id) }) })
      }
      if (sourceFailureId.current) {
        const replacedFailureId = sourceFailureId.current
        sourceFailureId.current = null
        setReplacingFailureId(null)
        apiFetch(`/api/posts/${replacedFailureId}`, { method: 'DELETE' }).catch(() => {})
      }
      if (serverDraftId.current) { apiFetch(`/api/drafts/${serverDraftId.current}`, { method: 'DELETE' }).catch(() => {}); serverDraftId.current = null }
      const successMessage = requestingApproval
        ? { approval: true, date, platformList: selected, workspaceName: workspaces.find(workspace => String(workspace.id) === String(approvalWorkspaceId))?.name || 'o espaço selecionado' }
        : publishNow ? null : scheduledPublicationDetails(date, selected)
      if (!publishNow) {
        clearComposer()
        if (requestingApproval) {
          setSavedMessage(successMessage)
        } else {
          setPublicationStatus({ type: 'scheduled', ...successMessage })
          setPublicationModalOpen(true)
        }
      }
      if (publishNow && createdPost?.id) monitorPublication(createdPost.id, eventCursor)
    } catch (caught) {
      setPublicationStatus(null)
      setPublicationModalOpen(false)
      setError(caught.message)
    } finally { submittingRef.current = false; setLoading(false); setProgress('') }
  }

  async function saveAsTemplate() {
    if (savingTemplateRef.current) return
    if (!Object.values(textByPlatform).some(value => value?.trim())) { notify('Escreva algum conteúdo antes de salvar um modelo.', 'error'); return }
    savingTemplateRef.current = true
    setSavingTemplate(true)
    try {
      await apiFetch('/api/drafts', { method: 'POST', body: JSON.stringify({ title: 'Modelo de publicação', textByPlatform, titleByPlatform, platforms: selected, isTemplate: true, igFormat, facebookFormat, youtubeFormat }) })
      notify('Modelo salvo no Baú de Ideias.')
    } catch (caught) {
      notify(caught.message, 'error')
    } finally {
      savingTemplateRef.current = false
      setSavingTemplate(false)
    }
  }

  const aiContext = selected.map(platform => {
    const value = platform === 'tiktok' ? (textByPlatform.tiktokDescription || '') : (textByPlatform[platform] || '')
    return value.trim() ? `${PLATFORM_LABELS[platform] || platform}: ${value.trim()}` : ''
  }).filter(Boolean).join('\n\n')

  const carouselPlatforms = selected.filter(platform => platform === 'instagram' || platform === 'tiktok' || platform === 'facebook' && facebookFormat === 'post')
  const carouselLimit = selected.includes('instagram') || selected.includes('facebook') ? INSTAGRAM_CAROUSEL_MAX_ITEMS : TIKTOK_PHOTO_MAX_ITEMS

  // Qualquer forma de fechar o aviso (×, "Fechar aviso", Esc, fundo) mantém o
  // resultado por rede à vista, para não reenviar a quem já recebeu o post.
  function closePublicationModal() {
    if (['warning', 'error'].includes(publicationStatus?.type) && publicationStatus?.resultSummary) setLastResult(publicationStatus.resultSummary)
    setPublicationModalOpen(false)
    setPublicationStatus(null)
  }

  const isAccountSelected = account => selectedAccountIds.some(id => accountIdKey(id) === accountIdKey(account))
  const submitVerb = publishNow ? 'publicar' : approvalWorkspaceId ? 'enviar para aprovação' : 'agendar'
  const submitLabel = approvalWorkspaceId ? 'Enviar para aprovação' : publishNow ? 'Publicar agora' : 'Agendar'
  const hasAnyText = Object.values(textByPlatform).some(value => value?.trim())
  const hasVideoFile = files.some(file => file.type.startsWith('video/'))
  const activeTextPlatform = selected.includes(textTab) ? textTab : selected[0]
  const issueCountByPlatform = blockingIssues.reduce((counts, issue) => (issue.platform ? { ...counts, [issue.platform]: (counts[issue.platform] || 0) + 1 } : counts), {})
  const saveStatus = serverDraftStatus || (draftSavedAt ? `Rascunho salvo às ${draftSavedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : '')
  const previewAccounts = [...connectedAccounts.filter(isAccountSelected), ...connectedAccounts.filter(account => !isAccountSelected(account))]
  const selectableAccounts = connectedAccounts.filter(account => selected.includes(account.platform))
  const markedAccountCount = selectableAccounts.filter(isAccountSelected).length
  const mediaHeading = isPhotoCarousel ? `${files.length} fotos em sequência` : mediaProfile?.kind === 'video' ? 'Vídeo detectado' : mediaProfile?.kind === 'image' ? 'Foto detectada' : 'Fotos, design ou vídeo'

  useEffect(() => { if (!blockingIssues.length) setIssuesOpen(false) }, [blockingIssues.length])
  useEffect(() => {
    if (error || savedMessage) feedbackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [error, savedMessage])

  function retryAccounts() {
    setAccountsLoaded(false)
    setAccountsAttempt(attempt => attempt + 1)
  }

  function networkSummary(platform) {
    if (!accountsLoaded) return 'Carregando contas…'
    if (accountsError) return 'Contas indisponíveis'
    const platformAccounts = accountsForPlatform(connectedAccounts, platform)
    if (!platformAccounts.length) return 'Nenhuma conta conectada'
    const chosen = platformAccounts.filter(isAccountSelected)
    if (!chosen.length) return 'Nenhuma conta marcada'
    return chosen.length > 1 ? `${chosen.length} contas` : handleOf(chosen[0])
  }

  // Leva a pessoa até o campo que resolve a pendência clicada. A primeira opção que
  // existir na tela recebe o foco (conta antes da rede; campo exato antes do painel).
  function focusIssue(issue) {
    setIssuesOpen(false)
    const text = String(issue.message || '').toLowerCase()
    const pane = issue.platform && selected.includes(issue.platform) ? issue.platform : activeTextPlatform
    const network = issue.platform ? PLATFORM_LABELS[issue.platform] : ''
    let candidates = ['.mp-drop .mp-fileinput']
    if (/antecedência|no passado|data e hora|data e a hora/.test(text)) candidates = ['#mp-date']
    else if (/carregar suas contas/.test(text)) candidates = ['.mp-accts .ds-alert button']
    else if (/conta/.test(text)) candidates = [network ? `.mp-accts input[aria-label$=" no ${network}"]:not(:disabled)` : '', '.mp-accts input:not(:disabled)', '.mp-accts .ds-go', '.mp-nets input'].filter(Boolean)
    else if (/rede social|plataformas|redes/.test(text)) candidates = ['.mp-nets input']
    else if (pane && /título do vídeo/.test(text)) candidates = ['#mp-yt-title']
    else if (pane && /feito para crianças/.test(text)) candidates = ['#mp-yt-kids']
    else if (pane && /quem pode ver/.test(text)) candidates = ['#mp-tt-privacy']
    else if (pane === 'tiktok' && /descrição/.test(text)) candidates = ['#mp-tiktok-desc']
    else if (pane === 'tiktok' && /título/.test(text)) candidates = ['#mp-tiktok-title']
    else if (pane && /caracteres|texto|descrição|título/.test(text)) candidates = [`#mp-pane-${pane} textarea`, `#mp-pane-${pane} input`]
    if (candidates.some(selector => selector.startsWith('#mp-pane-') || /^#mp-(yt|tt|tiktok)-/.test(selector))) setTextTab(pane)
    window.requestAnimationFrame(() => {
      const target = candidates.map(selector => document.querySelector(selector)).find(Boolean)
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target?.focus({ preventScroll: true })
    })
  }

  function levelOf(length, max) {
    if (length >= max) return 'over'
    return length >= max * 0.9 ? 'near' : undefined
  }

  function renderNetworkPane(platform) {
    const label = PLATFORM_TEXT_LIMITS[platform]?.label || PLATFORM_LABELS[platform] || platform
    const limit = getPlatformTextLimit(platform)
    const value = textByPlatform[platform] || ''
    const targets = accountsForPlatform(connectedAccounts, platform).filter(isAccountSelected)
    const tiktokTitle = titleByPlatform.tiktok || ''
    const tiktokText = textByPlatform.tiktokDescription || ''
    const vertical = platform === 'tiktok' || (platform === 'facebook' && facebookFormat === 'reel')
    return <div className="mp-pane" role="tabpanel" id={`mp-pane-${platform}`} aria-labelledby={`mp-tab-${platform}`} hidden={platform !== activeTextPlatform} key={platform}>
      <p className="ds-meta mp-pane__to">
        {targets.length ? <>Vai para <strong>{targets.map(handleOf).join(', ')}</strong></> : !accountsLoaded ? 'Carregando contas…' : accountsError ? 'Contas indisponíveis no momento.' : `Nenhuma conta do ${label} marcada em “Redes”.`}
        {vertical && <span className="ds-badge" data-tone="outline">9:16 · 1080 × 1920</span>}
      </p>
      {platform === 'tiktok'
        ? <>
          <div className="ds-field">
            <div className="ds-field__top"><label className="ds-label" htmlFor="mp-tiktok-title">Título chamativo</label><span className="ds-counter" data-level={levelOf(tiktokTitle.length, 90)}>{tiktokTitle.length}/90</span></div>
            <input id="mp-tiktok-title" className="ds-input" value={tiktokTitle} onChange={event => updatePlatformTitle('tiktok', event.target.value)} maxLength={90} placeholder="Adicione um título chamativo" />
          </div>
          <div className="ds-field">
            <div className="ds-field__top"><label className="ds-label" htmlFor="mp-tiktok-desc">Descrição</label><span className="ds-counter" data-level={levelOf(tiktokText.length, 4000)}>{tiktokText.length}/4000</span></div>
            <textarea id="mp-tiktok-desc" className="ds-textarea mp-textarea" value={tiktokText} onChange={event => updatePlatformText('tiktok', event.target.value)} maxLength={4000} placeholder="Escrever uma descrição longa pode ajudar a obter, em média, 3x mais visualizações" />
            <div className="mp-tokens">
              <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm" onClick={() => insertTiktokToken('#')}># Hashtags</button>
              <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm" onClick={() => insertTiktokToken('@')}>@ Mencionar</button>
            </div>
          </div>
        </>
        : <div className="ds-field">
          <div className="ds-field__top"><label className="ds-label" htmlFor={`mp-text-${platform}`}>{platform === 'youtube' ? 'Descrição do vídeo' : `Texto do ${label}`}</label><span className="ds-counter" data-level={levelOf(value.length, limit)}>{value.length}/{limit}</span></div>
          <textarea id={`mp-text-${platform}`} className="ds-textarea mp-textarea" value={value} onChange={event => updatePlatformText(platform, event.target.value)} maxLength={limit} placeholder={`Escreva o texto do ${label}...`} />
        </div>}

      {platform === 'instagram' && <div className="ds-fieldrow mp-settings">
        <SelectField id="mp-ig-format" label="Formato" value={igFormat} onChange={setIgFormat} options={[['post', 'Feed (imagem/carrossel)'], ['reel', 'Reels'], ['story', 'Story']]} />
      </div>}
      {platform === 'facebook' && <div className="ds-fieldrow mp-settings">
        <SelectField id="mp-fb-format" label="Formato" value={facebookFormat} onChange={setFacebookFormat} options={[['post', 'Feed (imagem/vídeo)'], ['reel', 'Reels · vídeo 9:16']]} />
      </div>}
      {platform === 'youtube' && <>
        <div className="ds-field">
          <div className="ds-field__top"><label className="ds-label" htmlFor="mp-yt-title">Título do vídeo<span className="ds-label__req">obrigatório</span></label><span className="ds-counter" data-level={levelOf(youtubeTitle.length, 100)}>{youtubeTitle.length}/100</span></div>
          <input id="mp-yt-title" className="ds-input" value={youtubeTitle} onChange={event => setYoutubeTitle(event.target.value)} maxLength={100} />
        </div>
        <div className="ds-fieldrow mp-settings">
          <SelectField id="mp-yt-kids" label="Feito para crianças" required value={youtubeMadeForKids} onChange={setYoutubeMadeForKids} options={[['', 'Selecione...'], ['false', 'Não'], ['true', 'Sim']]} />
          <SelectField id="mp-yt-format" label="Formato" value={youtubeFormat} onChange={setYoutubeFormat} options={[['', 'Automático · detectar'], ['video', 'Vídeo · 1920 × 1080'], ['short', 'Short · 9:16 · 1080 × 1920 · menos de 60s']]} />
        </div>
        <details className="ds-disclosure mp-more">
          <summary>Mais opções do YouTube<Icon name="chevronDown" className="ds-disclosure__chev" /></summary>
          <div className="ds-disclosure__body ds-fieldrow">
            <SelectField id="mp-yt-visibility" label="Visibilidade" value={youtubeVisibility} onChange={setYoutubeVisibility} options={[['public', 'Público'], ['unlisted', 'Não listado'], ['private', 'Privado']]} />
            <SelectField id="mp-yt-category" label="Categoria" value={youtubeCategoryId} onChange={setYoutubeCategoryId} options={[['', 'Automática'], ...youtubeCategories.map(category => [category.id, category.label])]} />
          </div>
        </details>
      </>}
      {platform === 'tiktok' && <>
        <div className="ds-fieldrow mp-settings">
          <SelectField id="mp-tt-privacy" label="Quem pode ver" value={tiktokPrivacyLevel} onChange={setTiktokPrivacyLevel} options={[['PUBLIC_TO_EVERYONE', 'Público'], ['MUTUAL_FOLLOW_FRIENDS', 'Amigos'], ['FOLLOWER_OF_CREATOR', 'Seguidores do criador'], ['SELF_ONLY', 'Somente eu']]} />
          <div className="ds-field">
            <p className="ds-label">Formato</p>
            <p className="mp-static">{files.length > 1 && isPhotoCarousel ? `Carrossel de fotos · até ${TIKTOK_PHOTO_MAX_ITEMS} imagens · ajuste sem corte` : files[0]?.type.startsWith('image/') ? 'Foto · qualquer proporção · ajuste sem corte para 1080 × 1920 px' : `${TIKTOK_VIDEO_DIMENSIONS.label} · vídeo 9:16`}</p>
          </div>
        </div>
        <details className="ds-disclosure mp-more">
          <summary>Interações do TikTok<Icon name="chevronDown" className="ds-disclosure__chev" /></summary>
          <div className="ds-disclosure__body mp-checks">
            <label className="ds-check"><input type="checkbox" className="ds-checkbox" checked={tiktokDisableComment} onChange={event => setTiktokDisableComment(event.target.checked)} />Bloquear comentários</label>
            <label className="ds-check"><input type="checkbox" className="ds-checkbox" checked={tiktokDisableDuet} onChange={event => setTiktokDisableDuet(event.target.checked)} />Bloquear duet</label>
            <label className="ds-check"><input type="checkbox" className="ds-checkbox" checked={tiktokDisableStitch} onChange={event => setTiktokDisableStitch(event.target.checked)} />Bloquear stitch</label>
          </div>
        </details>
      </>}
    </div>
  }

  const previewProps = { textByPlatform, titleByPlatform, selected, files, filesByPlatform, previews: mediaPreviews, publishNow, approvalRequested: TEAM_APPROVAL_UI_ENABLED && Boolean(approvalWorkspaceId), date, youtubeTitle, igFormat, igAspect, onIgAspectChange: setIgAspect, tiktokAspect, youtubeFormat, facebookFormat, mediaProfile, coverUrl: coverPreviewUrl, accounts: previewAccounts }
  const timeZone = localTimeZoneName()
  const templateDisabled = loading || savingTemplate || !hasAnyText
  const submitDisabled = loading || blockingIssues.length > 0 || dateMissing

  function openDatePicker() {
    const trigger = document.getElementById('mp-date')
    trigger?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    trigger?.focus({ preventScroll: true })
    if (trigger?.getAttribute('aria-expanded') !== 'true') trigger?.click()
  }

  const issueList = <ul className="mp-issuelist">{blockingIssues.map((issue, index) => <li key={index}><button type="button" className="mp-issue" onClick={() => focusIssue(issue)}>
    {issue.platform ? <NetworkGlyph network={issue.platform} size={16} /> : <Icon name="alertTriangle" size={16} />}
    <span>{issue.message}</span>
    <Icon name="arrow" size={16} className="mp-issue__go" />
  </button></li>)}</ul>

  return <div className="ds-page mp" data-ds-root ref={pageRef}>
    {/* No celular a barra do topo já mostra "Meu Post" com o botão Voltar: o cabeçalho fica só para leitores de tela. */}
    <header className="ds-pagehead mp-head">
      <div className="ds-pagehead__text">
        <p className="ds-eyebrow">{approvalWorkspaceId ? 'Enviar para aprovação' : publishNow ? 'Publicar agora' : 'Agendar publicação'}</p>
        <h1 className="ds-pagehead__title">Meu Post</h1>
        <p className="ds-pagehead__lede">Escolha as redes, adicione a mídia e escreva o texto de cada uma. No fim, publique na hora ou agende.</p>
      </div>
    </header>

    <div className="mp-body">
      <form className="mp-compose" onSubmit={submit}>
        <fieldset className="mp-step">
          <legend className="mp-step__legend"><span className="mp-step__num" aria-hidden="true">1</span>Redes</legend>
          {lastResult && <div className="ds-alert mp-alert" data-tone="warning" role="status">
            <Icon name="alertTriangle" className="ds-alert__icon" />
            <p className="ds-alert__title">Resultado da última tentativa</p>
            <PublicationResultGroups summary={lastResult} />
            {lastResult.published?.length > 0 && <p className="ds-alert__text">Desmarque as redes que já receberam o post antes de enviar de novo, para não publicar em dobro.</p>}
            <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-btn--sm ds-alert__close" onClick={() => setLastResult(null)} aria-label="Dispensar resultado"><Icon name="close" size={16} /></button>
          </div>}
          <div className="mp-nets" role="group" aria-label="Redes sociais">
            {PLATFORMS.map(platform => {
              const isSelected = selected.includes(platform)
              return <label className="mp-net" data-selected={isSelected || undefined} key={platform}>
                <input type="checkbox" className="ds-checkbox" checked={isSelected} onChange={() => toggle(platform)} />
                <NetworkGlyph network={platform} size={20} />
                <span className="mp-net__text"><span className="mp-net__name">{PLATFORM_LABELS[platform]}</span><span className="mp-net__acct">{networkSummary(platform)}</span></span>
              </label>
            })}
          </div>
          <div className="mp-accts">
            <div className="mp-accts__head">
              <p className="mp-sublabel">Contas que vão receber</p>
              {accountsLoaded && !accountsError && selectableAccounts.length > 0 && <span className="ds-meta">{markedAccountCount} de {selectableAccounts.length} marcadas</span>}
            </div>
            {!accountsLoaded
              ? <div className="mp-accts__loading" aria-busy="true"><span className="ds-sr-only">Carregando contas...</span>{[1, 2].map(item => <span className="ds-skel mp-accts__skel" key={item} />)}</div>
              : accountsError
                ? <div className="ds-alert" data-tone="danger" role="alert">
                  <Icon name="alertCircle" className="ds-alert__icon" />
                  <p className="ds-alert__text">Não foi possível carregar suas contas conectadas.</p>
                  <div className="ds-alert__actions"><button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={retryAccounts}><Icon name="refresh" size={16} />Tentar novamente</button></div>
                </div>
                : !connectedAccounts.length
                  ? <div className="mp-accts__empty">
                    <p className="ds-hint">Nenhuma conta conectada. Conecte uma conta antes de continuar.</p>
                    {onNavigate && <button type="button" className="ds-go" onClick={() => onNavigate('integracoes')}>Conectar conta<Icon name="arrow" /></button>}
                  </div>
                  : accountGroups.map(group => {
                    const visible = group.accounts.filter(account => selected.includes(account.platform))
                    return <div className="mp-person" key={group.key}>
                      <div className="mp-person__head">
                        <span className="ds-meta mp-person__label">{group.label}</span>
                        {visible.length > 1 && <span className="mp-person__actions">
                          <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm" onClick={() => selectAllPersonAccounts(group.key, true)}>Marcar todas</button>
                          <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm" onClick={() => selectAllPersonAccounts(group.key, false)}>Desmarcar</button>
                        </span>}
                      </div>
                      {visible.length
                        ? <ul className="mp-acctlist">{visible.map(account => {
                          const label = accountLabelOf(account)
                          const [tone, tokenLabel] = TOKEN_STATUS[account.tokens?.find(token => token.status)?.status] || ['muted', 'Sem status']
                          const networkLabel = PLATFORM_LABELS[account.platform] || account.platform
                          return <li key={account.id}><label className="mp-acct">
                            <input type="checkbox" className="ds-checkbox" checked={isAccountSelected(account)} disabled={!selected.includes(account.platform)} onChange={() => toggleAccount(account.id)} aria-label={`Usar ${label} no ${networkLabel}`} />
                            {account.avatarUrl ? <img className="mp-acct__avatar" src={account.avatarUrl} alt="" /> : <span className="mp-acct__avatar" aria-hidden="true"><NetworkGlyph network={account.platform} size={16} /></span>}
                            <span className="mp-acct__text"><span className="mp-acct__name">{label}</span><span className="mp-acct__net"><NetworkGlyph network={account.platform} size={14} />{networkLabel}{account.name && account.handle ? ` · ${account.name}` : ''}</span></span>
                            <span className="ds-status" data-status={tone}>{tokenLabel}</span>
                          </label></li>
                        })}</ul>
                        : <p className="ds-hint">Nenhuma conta desta pessoa nas redes marcadas.</p>}
                    </div>
                  })}
          </div>
        </fieldset>

        <fieldset className="mp-step">
          <legend className="mp-step__legend"><span className="mp-step__num" aria-hidden="true">2</span>Mídia</legend>
          <div className="mp-drop" data-filled={files.length > 0 || undefined} onDragOver={event => event.preventDefault()} onDrop={dropFiles}>
            <span className="ds-icontile" aria-hidden="true"><Icon name={mediaProfile?.kind === 'video' ? 'video' : 'image'} /></span>
            <div className="mp-drop__text">
              <p className="mp-drop__title">{mediaHeading}</p>
              <p className="ds-hint">Arraste os arquivos até aqui{carouselPlatforms.length ? ` · carrossel com até ${carouselLimit} fotos, na ordem escolhida` : ''}</p>
            </div>
            <label className="ds-btn ds-btn--secondary mp-filebtn"><Icon name="upload" />Adicionar mídia<input className="mp-fileinput" type="file" multiple={carouselPlatforms.length > 0} accept="image/*,image/heic,image/heif,video/*" onChange={selectFiles} aria-label={selected.includes('tiktok') ? 'Selecionar imagens ou vídeo para o TikTok' : 'Selecionar imagens ou vídeos'} /></label>
          </div>
          {files.length > 0 && <ul className="mp-thumbs" aria-label="Arquivos selecionados">
            {mediaPreviews.map((item, index) => {
              const isVideo = item.file.type.startsWith('video/')
              return <li className="mp-thumb" key={item.key}>
                <div className="mp-thumb__media">
                  {isVideo ? <video src={item.url} muted playsInline preload="metadata" aria-label={`Prévia do vídeo ${item.file.name}`} /> : <img src={item.url} alt={`Prévia de ${item.file.name}`} />}
                  {isPhotoCarousel && <span className="mp-thumb__num" aria-hidden="true">{index + 1}</span>}
                  {isPhotoCarousel && index === 0 && <span className="mp-thumb__badge">Capa</span>}
                  <button type="button" className="mp-thumb__remove" onClick={() => removeFile(item.key)} aria-label={`Remover ${item.file.name}`}><Icon name="close" size={16} /></button>
                </div>
                <p className="mp-thumb__name" title={item.file.name}>{item.file.name}</p>
                <p className="ds-meta">{isVideo ? 'Vídeo' : 'Foto'} · {formatFileSize(item.file.size)}</p>
                {isPhotoCarousel && <div className="mp-thumb__tools">
                  <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-btn--sm" onClick={() => moveFile(index, -1)} disabled={index === 0} aria-label={`Mover ${item.file.name} para a esquerda`}><Icon name="chevronLeft" size={16} /></button>
                  <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-btn--sm" onClick={() => moveFile(index, 1)} disabled={index === files.length - 1} aria-label={`Mover ${item.file.name} para a direita`}><Icon name="chevronRight" size={16} /></button>
                  {index > 0 && <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm mp-thumb__cover" onClick={() => chooseImageCover(item.key)}>Usar como capa</button>}
                </div>}
              </li>
            })}
            {carouselPlatforms.length > 0 && !hasVideoFile && <li><label className="mp-thumb mp-thumb--add"><Icon name="plus" /><span>Adicionar fotos</span><input className="mp-fileinput" type="file" multiple accept="image/*" onChange={selectFiles} aria-label="Adicionar fotos ao carrossel" /></label></li>}
          </ul>}
          {mediaProfile && <p className="mp-detect">
            <strong>{mediaKindLabel(mediaProfile.kind)}</strong>
            <span>{mediaProfile.ratio ? `Original ${ratioLabel(mediaProfile.width, mediaProfile.height)}` : 'Lendo a proporção original…'}</span>
            <span>{mediaProfile.width && mediaProfile.height ? `${mediaProfile.width} × ${mediaProfile.height}px` : 'A prévia será ajustada automaticamente.'}</span>
            {selected.includes('tiktok') && mediaProfile.kind === 'video' && <span>Versão enviada ao TikTok: {TIKTOK_VIDEO_DIMENSIONS.label} · vertical 9:16</span>}
          </p>}
          {isPhotoCarousel && carouselQualityNotes.length > 0 && <div className="mp-notes">
            <p className="mp-sublabel"><Icon name="info" size={16} />Revisão visual do carrossel</p>
            <ul>{carouselQualityNotes.map(note => <li key={note}>{note}</li>)}</ul>
          </div>}
          {isPhotoCarousel && <p className="ds-hint">A primeira foto será a capa do carrossel. Use “Usar como capa” para trocar.</p>}
          {videoCoverFile && <VideoCoverPicker file={videoCoverFile} value={coverTime} onChange={setCoverTime} coverUrl={coverFilePreviewUrl} onCapture={file => { if (file.size > 2 * 1024 * 1024) { setError('O frame escolhido ficou maior que 2 MB. Escolha outro frame.'); return } setCoverFile(file); setCoverSourceKey('custom') }} onImageSelect={selectCoverImage} onClear={() => { setCoverFile(null); setCoverSourceKey(''); setCoverTime(null) }} />}
          {videoCoverFile && selected.includes('youtube') && youtubeFormat === 'short' && <p className="ds-hint">O YouTube não aplica capas personalizadas em Shorts; nos demais formatos e redes compatíveis, a capa escolhida será enviada.</p>}
          {files.length > 0 && <p className="ds-hint mp-keepnote"><Icon name="info" size={14} />As mídias ficam só nesta tela. Se sair antes de publicar, será preciso adicioná-las de novo.</p>}
          {selected.length > 0 && <details className="ds-disclosure mp-limits">
            <summary>Tamanhos e limites<Icon name="chevronDown" className="ds-disclosure__chev" /></summary>
            <ul className="ds-disclosure__body mp-limits__list">
              {selected.map(platform => <li key={platform}>
                <NetworkGlyph network={platform} size={16} />
                <span><strong>{PLATFORM_LABELS[platform]}</strong> {socialMediaResolutionHint(platform, { instagramFormat: igFormat, facebookFormat, youtubeFormat, mediaKind: mediaProfile?.kind })}. {socialMediaLimitHint(platform, { instagramFormat: igFormat, facebookFormat })}</span>
              </li>)}
            </ul>
          </details>}
        </fieldset>

        <fieldset className="mp-step">
          <legend className="mp-step__legend"><span className="mp-step__num" aria-hidden="true">3</span>Conteúdo</legend>
          {selected.length > 0 && <MediaAiSuggestions files={files} selected={selected} contexto={aiContext} previews={mediaPreviews} onApply={applyMediaSuggestion} />}
          {selected.length
            ? <>
              <div className="ds-tabs mp-tabs" role="tablist" aria-label="Texto por rede" onKeyDown={event => handleTabKeys(event, selected, activeTextPlatform, setTextTab, 'mp-tab-')}>
                {selected.map(platform => <button type="button" role="tab" id={`mp-tab-${platform}`} aria-controls={`mp-pane-${platform}`} aria-selected={platform === activeTextPlatform} tabIndex={platform === activeTextPlatform ? 0 : -1} className="ds-tab mp-tab" key={platform} onClick={() => setTextTab(platform)}>
                  <NetworkGlyph network={platform} size={16} />{PLATFORM_LABELS[platform]}
                  {issueCountByPlatform[platform] > 0 && <span className="ds-badge mp-tab__count" data-tone="danger"><span aria-hidden="true">{issueCountByPlatform[platform]}</span><span className="ds-sr-only">, {issueCountByPlatform[platform]} {issueCountByPlatform[platform] === 1 ? 'pendência' : 'pendências'}</span></span>}
                </button>)}
              </div>
              {selected.map(platform => renderNetworkPane(platform))}
            </>
            : <p className="ds-hint mp-empty">Escolha ao menos uma rede em “Redes” para escrever o texto.</p>}
        </fieldset>

        <fieldset className="mp-step">
          <legend className="mp-step__legend"><span className="mp-step__num" aria-hidden="true">4</span>Publicação</legend>
          {replacingFailureId && <div className="ds-alert ds-alert--quiet mp-replace" data-tone="info" role="status">
            <Icon name="refresh" className="ds-alert__icon" />
            <p className="ds-alert__text">Você está revisando uma publicação que falhou. Ao publicar, ela sai do calendário e fica só esta.</p>
            <div className="ds-alert__actions"><button type="button" className="ds-btn ds-btn--quiet ds-btn--sm" onClick={() => { sourceFailureId.current = null; setReplacingFailureId(null) }}>Manter as duas</button></div>
          </div>}
          {TEAM_APPROVAL_UI_ENABLED && workspaces.length > 0 && <div className="mp-approval">
            <label className="ds-check"><input type="checkbox" className="ds-switch" checked={Boolean(approvalWorkspaceId)} onChange={event => { setApprovalWorkspaceId(event.target.checked ? String(workspaces[0].id) : ''); if (event.target.checked) setPublishNow(false) }} /><span className="ds-check__text"><span>Revisar antes de publicar</span><span className="ds-check__hint">O post ficará bloqueado até um aprovador aceitar.</span></span></label>
            {approvalWorkspaceId && <SelectField id="mp-approval-space" label="Espaço de aprovação" value={approvalWorkspaceId} onChange={value => { setApprovalWorkspaceId(value); setPublishNow(false) }} options={workspaces.map(workspace => [String(workspace.id), workspace.name])} />}
          </div>}
          {!approvalWorkspaceId && <div className="mp-when" role="radiogroup" aria-label="Quando publicar">
            <label className="mp-when__opt" data-selected={!publishNow || undefined}>
              <input type="radio" className="ds-radio" name="mp-when" checked={!publishNow} onChange={() => setPublishNow(false)} />
              <span className="mp-when__text"><span className="mp-when__title">Agendar</span><span className="ds-hint">Em uma data e hora</span></span>
              <Icon name="calendar" className="mp-when__icon" />
            </label>
            <label className="mp-when__opt" data-selected={publishNow || undefined}>
              <input type="radio" className="ds-radio" name="mp-when" checked={publishNow} onChange={() => setPublishNow(true)} />
              <span className="mp-when__text"><span className="mp-when__title">Publicar agora</span><span className="ds-hint">Assim que você confirmar</span></span>
              <Icon name="send" className="mp-when__icon" />
            </label>
          </div>}
          {(!publishNow || approvalWorkspaceId) && <div className="ds-field mp-date">
            <label className="ds-label" htmlFor="mp-date">Data e hora</label>
            <DateTimeField id="mp-date" value={date} onChange={setDate} required disablePast describedBy="mp-date-hint" sheetTitle="Data e hora" />
            <p className="ds-hint" id="mp-date-hint">{selected.includes('instagram') ? 'No Instagram, pelo menos 20 minutos de antecedência. ' : ''}{timeZone ? `Fuso: ${timeZone}.` : ''}</p>
          </div>}
        </fieldset>

        <div className="mp-feedback" ref={feedbackRef}>
          {error && <SchedulerErrorCard title="Precisa de atenção" message={error} onReview={reviewError} onClose={() => setError('')} />}
          {savedMessage && !publicationStatus && <div className="ds-alert mp-alert" data-tone="success" role="status">
            <Icon name="checkCircle" className="ds-alert__icon" />
            <p className="ds-alert__title">{savedMessage.approval ? 'Enviado para aprovação' : 'Seu post está na agenda'}</p>
            <p className="ds-alert__text">{savedMessage.approval ? <>O post foi salvo no espaço <strong>{savedMessage.workspaceName}</strong> e ficará bloqueado até a aprovação.</> : <>Ele será publicado em <strong>{savedMessage.date}</strong>.</>}</p>
            <p className="ds-alert__text">{savedMessage.approval ? 'O aprovador pode analisar o conteúdo na área Equipe.' : 'Você pode acompanhar ou editar esse agendamento no calendário.'}</p>
            <button type="button" className="ds-btn ds-btn--quiet ds-btn--icon ds-btn--sm ds-alert__close" onClick={() => setSavedMessage(null)} aria-label="Fechar confirmação"><Icon name="close" size={16} /></button>
          </div>}
          {!phone && issuesOpen && blockingIssues.length > 0 && <div className="mp-issues" id="mp-issues">
            <p className="mp-sublabel">Antes de {submitVerb}</p>
            {issueList}
          </div>}
        </div>

        {/* Desktop: rodapé no fim do formulário. Celular: a barra de ação ocupa a borda de baixo (o shell tira a navegação inferior nesta tela). */}
        <div className="mp-bar">
          <div className="mp-bar__state">
          {blockingIssues.length > 0
            ? <button type="button" className="mp-bar__status mp-bar__issues" aria-expanded={issuesOpen} aria-controls={issuesOpen && !phone ? 'mp-issues' : undefined} aria-haspopup={phone ? 'dialog' : undefined} onClick={() => setIssuesOpen(open => !open)}>
              <Icon name="alertTriangle" size={18} />
              <span><strong>{blockingIssues.length} {blockingIssues.length === 1 ? 'pendência' : 'pendências'}</strong> antes de {submitVerb}</span>
              <Icon name={issuesOpen && !phone ? 'chevronDown' : 'chevronUp'} size={16} />
            </button>
            : dateMissing
              ? <button type="button" className="mp-bar__status mp-bar__issues" onClick={openDatePicker}>
                <Icon name="calendar" size={18} />
                <span><strong>Escolha a data e a hora</strong> para {submitVerb}</span>
                <Icon name="arrow" size={16} />
              </button>
              : <span className="mp-bar__status mp-bar__ready"><Icon name="checkCircle" size={18} />Pronto para {submitVerb}</span>}
          {saveStatus && <span className="mp-bar__save" role="status">{saveStatus}</span>}
          </div>
          <span className="mp-bar__actions">
            {compactLayout && <button type="button" className="ds-btn ds-btn--secondary mp-bar__preview" onClick={() => setPreviewOpen(true)} aria-haspopup="dialog"><Icon name="eye" />Prévia</button>}
            {phone
              ? <OverflowMenu label="Mais ações do post" sheetTitle="Mais ações" items={[{ label: savingTemplate ? 'Salvando modelo…' : 'Salvar como modelo', icon: 'bookmark', disabled: templateDisabled, onSelect: saveAsTemplate }]} />
              : <button type="button" className="ds-btn ds-btn--secondary mp-bar__template" onClick={saveAsTemplate} disabled={templateDisabled}>{savingTemplate ? 'Salvando…' : 'Salvar como modelo'}</button>}
            <button type="submit" className="ds-btn ds-btn--primary mp-bar__submit" disabled={submitDisabled}>
              {loading ? <><span className="ds-spinner" aria-hidden="true" />{progress || 'Processando...'}</> : <>{submitLabel}<Icon name={publishNow ? 'send' : 'arrow'} /></>}
            </button>
          </span>
        </div>
      </form>

      {!compactLayout && <aside className="mp-aside" aria-label="Prévia da publicação"><PostPreview {...previewProps} /></aside>}
    </div>

    {/* dentro da página: o simulador de cada rede herda os mesmos estilos da prévia lateral */}
    {compactLayout && <Sheet open={previewOpen} onClose={() => setPreviewOpen(false)} title="Prévia" size="lg" className="mp-previewsheet" closeLabel="Fechar prévia" container={pageRef.current}>
      <PostPreview {...previewProps} inSheet />
    </Sheet>}

    {phone && <Sheet open={issuesOpen && blockingIssues.length > 0} onClose={() => setIssuesOpen(false)} title={`Antes de ${submitVerb}`} description="Toque numa pendência para ir até o campo." className="mp-issuesheet">
      {issueList}
    </Sheet>}

    {publicationModalOpen && publicationStatus && <PublicationStatusModal status={publicationStatus} platforms={selected} progress={progress} onReview={reviewError} onClose={closePublicationModal} />}
    {confirmDialog}
  </div>
}
