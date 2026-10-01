import { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api.js'
import { INSTAGRAM_CAROUSEL_MAX_ITEMS, TIKTOK_PHOTO_MAX_ITEMS } from '../../lib/postValidation.js'
import { Icon } from '../ui/icon.jsx'
import { PLATFORMS } from '../../lib/platforms.js'
import { waitForDecodedVideoFrame } from '../../lib/video-frame.js'

// Sugestões de legenda e hashtags a partir da mídia (Meu Post): a imagem ou alguns quadros do vídeo
// são reduzidos no navegador e enviados para análise; a pessoa escolhe o que aplicar ao texto.

const MEDIA_AI_MODEL = 'openrouter'
const MEDIA_HASHTAG_LIMITS = { instagram: 5, facebook: 2, youtube: 3, tiktok: 2 }
const MEDIA_TEXT_LIMITS = { tiktok: 4000 }
function canvasToAnalysisData(canvas) {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.62)
  return { mediaBase64: dataUrl.split(',')[1], mimeType: 'image/jpeg' }
}

function compressImageForAnalysis(file) {
  return new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      try {
        const maxDimension = 768
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve({ ...canvasToAnalysisData(canvas), mediaKind: 'image' })
      } catch (error) { reject(error) } finally { URL.revokeObjectURL(sourceUrl) }
    }
    image.onerror = () => { URL.revokeObjectURL(sourceUrl); reject(new Error(`Não foi possível ler ${file.name}.`)) }
    image.src = sourceUrl
  })
}

function captureVideoFramesForAnalysis(file) {
  return new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(file)
    const video = document.createElement('video')
    let finished = false
    const cleanup = () => { URL.revokeObjectURL(sourceUrl); video.removeAttribute('src'); video.load() }
    const fail = error => { if (!finished) { finished = true; cleanup(); reject(error) } }
    let frameTimes = []
    let frameIndex = 0
    let duration = 0
    const frames = []
    let capturing = false
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    const seekToCurrentFrame = () => {
      const target = frameTimes[frameIndex] || 0
      if (Math.abs(video.currentTime - target) < 0.01) {
        void captureCurrentFrame()
      } else {
        video.currentTime = target
      }
    }
    async function captureCurrentFrame() {
      if (finished || capturing) return
      capturing = true
      try {
        await waitForDecodedVideoFrame(video)
        if (finished) return
        if (!video.videoWidth || !video.videoHeight) throw new Error(`Não foi possível capturar um frame de ${file.name}.`)
        const maxDimension = 768
        const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
        const context = canvas.getContext('2d')
        if (!context) throw new Error(`Não foi possível preparar um frame de ${file.name}.`)
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        const frame = { ...canvasToAnalysisData(canvas), mediaKind: 'video', timestamp: frameTimes[frameIndex] || 0, frameIndex: frameIndex + 1, frameCount: frameTimes.length, duration }
        frames.push(frame)
        frameIndex += 1
        if (frameIndex < frameTimes.length) {
          seekToCurrentFrame()
          return
        }
        finished = true
        resolve({ frames, duration })
        cleanup()
      } catch (error) {
        fail(error instanceof Error ? error : new Error(`Não foi possível capturar um frame de ${file.name}.`))
      } finally {
        capturing = false
      }
    }
    video.onloadedmetadata = () => {
      try {
        duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
        // Um único frame no meio do vídeo não representa uma ação. Amostramos
        // o começo, o desenvolvimento e o encerramento para o sistema inteligente entender a
        // sequência sem precisar enviar o arquivo de vídeo inteiro.
        const percentages = duration > 8 ? [0.04, 0.28, 0.52, 0.76, 0.96] : [0.05, 0.35, 0.65, 0.95]
        frameTimes = Array.from(new Set(percentages.map(percent => Math.min(Math.max(duration * percent, 0), Math.max(duration - 0.05, 0)))))
        seekToCurrentFrame()
      } catch { fail(new Error(`Não foi possível preparar ${file.name}.`)) }
    }
    video.onseeked = () => { void captureCurrentFrame() }
    video.onerror = () => fail(new Error(`Não foi possível ler ${file.name}.`))
    video.src = sourceUrl
    video.load()
  })
}

async function buildMediaAnalysisPayload(file) {
  if (!file.type.startsWith('video/')) return compressImageForAnalysis(file)
  const result = await captureVideoFramesForAnalysis(file)
  return result.frames
}

function cleanAiTag(tag) {
  return String(tag || '').trim().replace(/^#+/, '').replace(/\s+/g, '')
}

function uniqueAiTags(suggestion) {
  return Array.from(new Set([
    ...(suggestion.hashtagsEmAlta || []),
    ...(suggestion.hashtagsNicho || []),
    ...(suggestion.hashtags || []),
  ].map(cleanAiTag).filter(Boolean))).slice(0, MEDIA_HASHTAG_LIMITS[suggestion.plataforma] || 3)
}

function trimAiCaption(value, max) {
  if (value.length <= max) return value
  const cut = value.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()
}

export function composeAiCaption(suggestion) {
  const body = String(suggestion.texto || '').trim()
  const tags = uniqueAiTags(suggestion)
  const max = MEDIA_TEXT_LIMITS[suggestion.plataforma]
  if (!max) return [body, tags.length ? tags.map(tag => `#${tag}`).join(' ') : ''].filter(Boolean).join('\n\n')

  let caption = trimAiCaption(body, max)
  for (const tag of tags) {
    const separator = caption ? '\n\n' : ''
    const candidate = `${caption}${separator}#${tag}`
    if (candidate.length > max) break
    caption = candidate
  }
  return caption
}

export function MediaAiSuggestions({ files, selected, contexto, previews, onApply }) {
  const [busy, setBusy] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [analysisNotes, setAnalysisNotes] = useState([])
  const [videoDescription, setVideoDescription] = useState('')
  const analysisLimit = selected.includes('instagram')
    ? INSTAGRAM_CAROUSEL_MAX_ITEMS
    : selected.includes('tiktok')
      ? TIKTOK_PHOTO_MAX_ITEMS
      : 1
  const hasVideo = files.some(file => file.type.startsWith('video/'))
  const hasVideoContext = Boolean(videoDescription.trim())
  const analysisContext = hasVideo ? videoDescription.trim() : contexto.trim()

  useEffect(() => {
    if (!hasVideo) setVideoDescription('')
  }, [hasVideo])

  async function analyzeMedia() {
    if (!files.length || !selected.length) return
    const requestedPlatforms = [...new Set(selected.filter(platform => PLATFORMS.includes(platform)))]
    if (!requestedPlatforms.length || requestedPlatforms.length > 4) {
      setAnalysisError('Selecione entre 1 e 4 redes sociais antes de gerar a descrição.')
      return
    }
    if (hasVideo && !hasVideoContext) {
      setAnalysisError('Escreva em uma frase sobre o que o vídeo fala antes de gerar a descrição.')
      return
    }
    setBusy(true)
    setAnalysisError('')
    setSuccessMessage('')
    setAnalysisNotes([])
    try {
      // Envia a sequência inteira em uma única análise para o sistema inteligente entender a
      // narrativa do carrossel, escolher a melhor capa e evitar uma legenda
      // baseada apenas na primeira foto.
      const targets = files.slice(0, analysisLimit)
      const payloads = await Promise.all(targets.map(buildMediaAnalysisPayload))
      const mediaItems = payloads.flat().slice(0, 35)
      const targetHasVideo = targets.some(file => file.type.startsWith('video/'))
      const isCarousel = !targetHasVideo && targets.length > 1
      const response = await apiFetch('/api/ai/analyze-media', {
        method: 'POST',
        // A análise de vídeo extrai até cinco frames e passa por um modelo de
        // visão. O backend aceita até 45s; o cliente precisa sobreviver além
        // desse limite para não abortar uma resposta válida.
        timeoutMs: 60_000,
        body: JSON.stringify({
          mediaItems,
          mediaKind: targetHasVideo ? 'video' : 'image',
          mediaCount: targets.length,
          videoFrameCount: targetHasVideo ? mediaItems.filter(item => item.mediaKind === 'video').length : 0,
          carousel: isCarousel,
          plataformas: requestedPlatforms,
          contexto: analysisContext,
          melhorar: Boolean(analysisContext),
          modelo: MEDIA_AI_MODEL,
        }),
      })
      const suggestions = requestedPlatforms
        .map(platform => response.sugestoes?.find(item => item.plataforma === platform))
        .filter(Boolean)
      const missingPlatforms = requestedPlatforms.filter(platform => !suggestions.some(suggestion => suggestion.plataforma === platform))
      if (missingPlatforms.length) {
        setAnalysisError(`O sistema inteligente não retornou uma sugestão para: ${missingPlatforms.join(', ')}. Tente novamente.`)
      } else {
        onApply(suggestions, { silent: true })
        setAnalysisNotes([
          response.descricao_midia,
          ...(response.analise_carrossel?.recomendacoes || []),
        ].filter(Boolean))
        const mediaLabel = targetHasVideo ? (mediaItems.length > 1 ? `${mediaItems.length} cenas do vídeo` : 'o vídeo') : `${targets.length} ${targets.length === 1 ? 'mídia' : 'fotos'}`
        setSuccessMessage(`${analysisContext ? 'Descrição melhorada' : 'Descrição gerada'} e aplicada aos campos de ${suggestions.length} rede(s), considerando ${mediaLabel}.`)
      }
    } catch (caught) {
      const message = caught?.message || ''
      const hasVideo = files.some(file => file.type.startsWith('video/'))
      const mediaLabel = hasVideo ? 'vídeo' : files.length > 1 ? 'imagens' : 'imagem'
      setAnalysisError(caught?.status === 408 || message.toLowerCase().includes('tempo esgotado')
        ? `A análise do ${mediaLabel} demorou mais que o esperado. Tente novamente em instantes.`
        : message.includes('limite') || message.includes('429')
        ? 'O modelo do sistema atingiu o limite de requisições. Tente novamente em instantes.'
        : message.startsWith('O navegador não conseguiu') || message.startsWith('Não foi possível')
          ? message
          : `Não foi possível analisar o ${mediaLabel}. Confira o arquivo e tente novamente.`)
    }
    setBusy(false)
  }

  const ready = files.length > 0 && selected.length > 0 && (!hasVideo || hasVideoContext)
  const needs = [
    !files.length && 'Selecione uma imagem ou vídeo',
    !selected.length && 'Selecione ao menos uma rede social',
    hasVideo && !hasVideoContext && 'Escreva uma frase sobre o vídeo',
  ].filter(Boolean)

  // Something to say below the bar: what is missing, the result or the error.
  const status = analysisError
    ? <p className="ds-fieldmsg" role="alert"><Icon name="alertCircle" size={16} />{analysisError}</p>
    : successMessage
      ? <p className="ds-fieldmsg" data-tone="success" role="status"><Icon name="checkCircle" size={16} />{successMessage}</p>
      : null

  return <section className="mp-ai" aria-labelledby="mp-ai-title" aria-busy={busy}>
    <div className="mp-ai__bar">
      <span className="mp-ai__mark" aria-hidden="true"><Icon name="sparkle" size={18} /></span>
      <div className="mp-ai__intro">
        <h3 className="mp-ai__title" id="mp-ai-title">Descrição a partir da mídia</h3>
        <p className="ds-hint">{!files.length
          ? 'Adicione uma imagem ou vídeo em “Mídia” para gerar a legenda de cada rede.'
          : hasVideo
            ? 'Descreva o vídeo em uma frase e gere a legenda de cada rede.'
            : contexto.trim()
              ? 'Melhora os textos abaixo com base na mídia. Substitui o que está escrito.'
              : 'Cria a legenda de cada rede selecionada a partir da mídia. Substitui o que está escrito.'}</p>
      </div>
      <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm mp-ai__btn" onClick={analyzeMedia} disabled={busy || !ready} title={!ready && needs.length ? needs.join(' · ') : undefined}>
        {busy ? <span className="ds-spinner" aria-hidden="true" /> : <Icon name="sparkle" size={16} />}{busy ? 'Analisando mídia…' : analysisContext ? 'Melhorar descrição' : 'Gerar descrição'}
      </button>
    </div>
    {hasVideo && <div className="ds-field mp-ai__video">
      <div className="ds-field__top"><label className="ds-label" htmlFor="mp-ai-video">Sobre o que é este vídeo?</label><span className="ds-counter">{videoDescription.length}/500</span></div>
      <textarea id="mp-ai-video" className="ds-textarea mp-ai__context" value={videoDescription} onChange={event => { setVideoDescription(event.target.value); setAnalysisError(''); setSuccessMessage('') }} maxLength={500} placeholder="Ex.: Mostro como organizar uma rotina de estudos em poucos passos." aria-describedby="mp-ai-video-hint" />
      <p className="ds-hint" id="mp-ai-video-hint">Uma frase curta já basta. Ela orienta o sistema inteligente e não substitui os textos finais.</p>
    </div>}
    <div className="mp-ai__status" aria-live="polite">
      {status}
      {!status && files.length > analysisLimit && <p className="ds-hint">As primeiras {analysisLimit} mídias serão analisadas.</p>}
      {successMessage && analysisNotes.length > 0 && <p className="ds-hint">{analysisNotes.slice(0, 2).join(' · ')}</p>}
    </div>
  </section>
}

// Categorias da YouTube Data API v3 — espelha src/domain/posts/post.js
// (YOUTUBE_CATEGORIES), fonte da verdade no backend.
