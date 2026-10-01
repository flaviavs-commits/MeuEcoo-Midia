import { useEffect, useMemo, useRef, useState } from 'react'
import { mediaFileKey } from '../../lib/postValidation.js'
import { Icon, NetworkGlyph } from '../ui/icon.jsx'
import { Select } from '../ui/select.jsx'
import { PlatformIcon } from '../ui/platform-icon.jsx'
import { TIKTOK_VIDEO_DIMENSIONS, mediaKindLabel, ratioLabel, resolvePreviewAspect, shouldUseFullBleedPreview, socialMediaResolutionHint } from '../../lib/mediaFormat.js'
import { HeartIcon, CommentIcon, ShareArrowIcon, BookmarkIcon, ThumbsUpIcon, GlobeIcon, MoreIcon, MusicNoteIcon, DislikeIcon, RemixIcon, SendPlaneIcon } from '../ui/preview-icons.jsx'
import { PLATFORMS, PLATFORM_LABELS } from '../../lib/platforms.js'
import { waitForDecodedVideoFrame } from '../../lib/video-frame.js'
import { handleTabKeys } from '../../lib/tab-keys.js'

// Prévia do post em cada rede (Meu Post): cartões que imitam Instagram, Facebook, YouTube e TikTok,
// com a mídia, o texto e a capa do vídeo escolhidos no editor.

function scheduleChipLabel(value) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 'Agendamento' : `Agendar · ${parsed.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
}

const IG_PREVIEW_ASPECT_CHOICES = [
  { value: 'auto', label: 'Automático · detectar' },
  { value: 'square', label: 'Foto · 1:1 · 1080 × 1080' },
  { value: 'portrait', label: 'Foto · 4:5 · 1080 × 1350' },
  { value: 'instagramWide', label: 'Foto · 1,91:1 · 1080 × 566' },
]

function PreviewVideo({ src, platform, coverUrl = '' }) {
  const [frame, setFrame] = useState('')

  useEffect(() => {
    let active = true
    let finished = false
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.crossOrigin = 'anonymous'

    setFrame('')

    const cleanup = () => {
      video.onloadedmetadata = null
      video.onseeked = null
      video.onerror = null
      video.removeAttribute('src')
      video.load()
    }

    const drawFrame = () => {
      if (finished || !active) return
      if (!video.videoWidth || !video.videoHeight) return
      try {
        const maxWidth = 1280
        const scale = Math.min(1, maxWidth / video.videoWidth)
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
        const context = canvas.getContext('2d')
        if (!context) return
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        finished = true
        if (active) setFrame(canvas.toDataURL('image/jpeg', 0.92))
        cleanup()
      } catch {
        // Alguns navegadores não permitem ler o frame em situações de decode
        // incompleto. O espaço fica com o placeholder nesse caso.
      }
    }

    // Usa a mesma confirmação de frame decodificado (requestVideoFrameCallback,
    // com fallback de dois paints) já validada na captura para o sistema inteligente — esperar
    // apenas dois paints de relógio, sem essa confirmação, podia render um
    // frame borrado/incompleto logo após o seek para perto do primeiro
    // keyframe do vídeo, especialmente em decodificadores acelerados por GPU.
    const captureFrame = async () => {
      if (finished || !active) return
      try {
        await waitForDecodedVideoFrame(video)
      } catch {
        // Sem confirmação do navegador, tentamos desenhar mesmo assim — o
        // placeholder cobre o caso de o desenho abaixo falhar de vez.
      }
      drawFrame()
    }

    video.onloadedmetadata = () => {
      // Só buscamos um frame específico depois que a metadata (dimensões e
      // duração reais) está disponível — buscar antes disso pode fazer o
      // navegador decodificar um frame incompleto/de baixa qualidade.
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
      const target = Math.min(0.3, duration ? duration / 2 : 0.3)
      if (target <= 0) { void captureFrame(); return }
      try {
        video.currentTime = target
      } catch {
        void captureFrame()
      }
    }
    video.onseeked = () => { void captureFrame() }
    video.onerror = () => cleanup()

    video.src = src
    video.load()

    return () => {
      active = false
      cleanup()
    }
  }, [src])

  return <div className={`social-preview-video social-preview-video-${platform}`}>
    {coverUrl || frame
      ? <img className="social-preview-video-frame" src={coverUrl || frame} alt={coverUrl ? 'Capa escolhida para o vídeo' : 'Quadro inicial do vídeo selecionado'}/>
      : <div className="social-preview-video-placeholder" aria-hidden="true" />}
    <span className="social-preview-video-badge">Vídeo detectado</span>
  </div>
}

export function VideoCoverPicker({ file, value, onChange, coverUrl, onCapture, onImageSelect, onClear }) {
  const videoRef = useRef(null)
  const [duration, setDuration] = useState(0)
  const [capturing, setCapturing] = useState(false)
  const videoUrl = useMemo(() => URL.createObjectURL(file), [file])

  useEffect(() => () => URL.revokeObjectURL(videoUrl), [videoUrl])

  useEffect(() => {
    setDuration(0)
    if (videoRef.current) videoRef.current.currentTime = 0
  }, [file])

  function handleMetadata(event) {
    const nextDuration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0
    setDuration(nextDuration)
    if (onChange && value === null && nextDuration > 0) onChange(0)
  }

  function handleTimeChange(event) {
    const nextTime = Number(event.target.value) || 0
    if (videoRef.current) videoRef.current.currentTime = nextTime
    onChange(nextTime)
  }

  function captureFrame() {
    const video = videoRef.current
    if (!video?.videoWidth || !video?.videoHeight || capturing) return
    setCapturing(true)
    const canvas = document.createElement('canvas')
    const maxWidth = 1920
    const scale = Math.min(1, maxWidth / video.videoWidth)
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) { setCapturing(false); return }
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(blob => {
      if (blob) {
        const basename = file.name.replace(/\.[^.]+$/, '') || 'video'
        onCapture(new File([blob], `${basename}-capa.jpg`, { type: 'image/jpeg', lastModified: Date.now() }))
      }
      setCapturing(false)
    }, 'image/jpeg', 0.92)
  }

  return <details className="ds-disclosure mp-cover">
    <summary><Icon name="image" /><span>Capa do vídeo</span><span className="ds-badge" data-tone={coverUrl ? 'gold' : 'outline'}>{coverUrl ? 'Personalizada' : 'Automática'}</span><Icon name="chevronDown" className="ds-disclosure__chev" /></summary>
    <div className="ds-disclosure__body mp-cover__body">
      <p className="ds-hint">Arraste o controle até o frame que deve aparecer na rede social, ou envie uma imagem.</p>
      <div className="mp-cover__stage">
        <video ref={videoRef} src={videoUrl} muted playsInline preload="metadata" onLoadedMetadata={handleMetadata} />
        {coverUrl && <figure className="mp-cover__chosen"><img src={coverUrl} alt="Frame escolhido como capa" /><figcaption className="ds-meta">Capa escolhida</figcaption></figure>}
      </div>
      <div className="ds-field">
        <div className="ds-field__top"><label className="ds-label" htmlFor="mp-cover-range">Frame selecionado</label><output className="ds-counter" htmlFor="mp-cover-range">{formatVideoTime(value || 0)}</output></div>
        <input id="mp-cover-range" className="mp-range" type="range" min="0" max={duration || 0.1} step="0.01" value={Math.min(value || 0, duration || 0.1)} onChange={handleTimeChange} disabled={!duration} />
      </div>
      <div className="mp-cover__actions">
        <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={captureFrame} disabled={!duration || capturing}>{capturing ? 'Criando capa…' : 'Usar este frame como capa'}</button>
        <label className="ds-btn ds-btn--quiet ds-btn--sm mp-filebtn"><Icon name="upload" size={16} />Escolher outra imagem<input className="mp-fileinput" type="file" accept="image/*" onChange={onImageSelect} /></label>
        {coverUrl && <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm" onClick={onClear}>Usar capa automática</button>}
      </div>
    </div>
  </details>
}

function formatVideoTime(value) {
  const total = Math.max(0, Math.round(Number(value) || 0))
  const minutes = Math.floor(total / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

function PreviewMedia({ platform, previews, igFormat, facebookFormat, aspectRequest, mediaProfile, fill = false, coverUrl = '' }) {
  const item = previews[0]
  const isVideo = item?.file.type.startsWith('video/')
  const aspect = resolvePreviewAspect({ platform, mediaKind: mediaProfile?.kind, sourceRatio: mediaProfile?.ratio, requested: aspectRequest, instagramFormat: igFormat, facebookFormat })
  const aspectClass = fill ? 'is-fill' : `is-${aspect.key}`
  const mediaClass = isVideo ? 'is-video' : item ? 'is-photo' : ''
  if (!item) return <div className={`social-preview-media social-preview-media-${platform} ${aspectClass} ${mediaClass} is-empty`} style={{ '--preview-aspect': String(aspect.ratio) }}><span aria-hidden="true">＋</span><small>Adicione uma imagem ou vídeo</small></div>
  const media = isVideo
    ? <PreviewVideo src={item.url} platform={platform} coverUrl={coverUrl}/>
    : <img src={item.url} alt="Prévia da publicação"/>
  return <div className={`social-preview-media social-preview-media-${platform} ${aspectClass} ${mediaClass}`} style={{ '--preview-aspect': String(aspect.ratio) }} data-media-kind={isVideo ? 'video' : 'image'} data-preview-aspect={aspect.label}>
    {media}
    {['instagram', 'tiktok'].includes(platform) && previews.length > 1 && <div className="social-preview-carousel-dots" aria-label={`${previews.length} fotos em carrossel`}>{previews.slice(0, 5).map((preview, index) => <span className={index === 0 ? 'is-active' : ''} key={preview.key}/>)}<small>{previews.length} fotos</small></div>}
  </div>
}

function PreviewAvatar({ platform, avatarUrl, size = '' }) {
  return <span className={`pv-avatar pv-avatar-${platform}${size ? ` pv-avatar-${size}` : ''}`}>{avatarUrl ? <img src={avatarUrl} alt=""/> : <PlatformIcon platform={platform} className="h-4 w-4"/>}</span>
}

// --- Instagram --------------------------------------------------------

function InstagramFeedCard({ accountLabel, accountHandle, avatarUrl, previews, igFormat, aspectRequest, mediaProfile, caption, coverUrl }) {
  return <>
    <div className="pv-header">
      <PreviewAvatar platform="instagram" avatarUrl={avatarUrl}/>
      <div className="pv-header-text"><strong>{accountLabel}</strong></div>
      <MoreIcon className="pv-more"/>
    </div>
    <PreviewMedia platform="instagram" previews={previews} igFormat={igFormat} aspectRequest={aspectRequest} mediaProfile={mediaProfile} coverUrl={coverUrl}/>
    <div className="pv-ig-actions">
      <div className="pv-ig-actions-left"><HeartIcon/><CommentIcon/><ShareArrowIcon/></div>
      <BookmarkIcon/>
    </div>
    <p className="pv-ig-likes">Curtido por <strong>0 pessoas</strong></p>
    <p className={`pv-ig-caption${caption ? '' : ' is-placeholder'}`}><strong>{accountHandle}</strong> {caption || 'O texto da sua publicação aparecerá aqui.'}</p>
    <span className="pv-ig-time">AGORA MESMO</span>
  </>
}

function InstagramFullBleedCard({ accountHandle, avatarUrl, previews, igFormat, aspectRequest, mediaProfile, caption, isStory, coverUrl }) {
  return <div className="pv-fullbleed">
    <PreviewMedia platform="instagram" previews={previews} igFormat={igFormat} aspectRequest={aspectRequest} mediaProfile={mediaProfile} fill coverUrl={coverUrl}/>
    {isStory && <div className="pv-story-progress" aria-hidden="true"><span/><span className="is-empty"/><span className="is-empty"/></div>}
    <div className="pv-fullbleed-top">
      <PreviewAvatar platform="instagram" avatarUrl={avatarUrl} size="sm"/>
      <strong>{accountHandle}</strong>
      {!isStory && <span className="pv-fullbleed-time">agora</span>}
      {!isStory && <span className="pv-fullbleed-follow">Seguir</span>}
      {isStory && <MoreIcon className="pv-more pv-more-light"/>}
    </div>
    {!isStory && <div className="pv-reel-rail">
      <span className="pv-reel-rail-item"><HeartIcon/><b>0</b></span>
      <span className="pv-reel-rail-item"><CommentIcon/><b>0</b></span>
      <span className="pv-reel-rail-item"><SendPlaneIcon/><b>0</b></span>
      <span className="pv-reel-rail-item pv-reel-rail-more"><MoreIcon/></span>
      <span className="pv-reel-disc" aria-hidden="true"><PlatformIcon platform="instagram" className="h-3 w-3"/></span>
    </div>}
    {!isStory ? <div className="pv-fullbleed-bottom">
      <p className={`pv-fullbleed-caption${caption ? '' : ' is-placeholder'}`}>{caption || 'O texto da sua publicação aparecerá aqui.'}</p>
      <span className="pv-fullbleed-audio"><MusicNoteIcon/> Áudio original · {accountHandle}</span>
    </div> : <div className="pv-story-replybar"><span>Enviar mensagem</span><HeartIcon className="pv-story-replybar-icon"/><ShareArrowIcon className="pv-story-replybar-icon"/></div>}
  </div>
}

// --- Facebook -----------------------------------------------------------

function FacebookCard({ accountLabel, avatarUrl, previews, mediaProfile, aspectRequest, facebookFormat, caption, coverUrl }) {
  return <>
    <div className="pv-header">
      <PreviewAvatar platform="facebook" avatarUrl={avatarUrl}/>
      <div className="pv-header-text"><strong>{accountLabel}</strong><small>Agora · <GlobeIcon/></small></div>
      <MoreIcon className="pv-more"/>
    </div>
    <p className={`pv-fb-text${caption ? '' : ' is-placeholder'}`}>{caption || 'O texto da sua publicação aparecerá aqui.'}</p>
      <PreviewMedia platform="facebook" previews={previews} facebookFormat={facebookFormat} aspectRequest={aspectRequest} mediaProfile={mediaProfile} coverUrl={coverUrl}/>
    <div className="pv-fb-stats"><span className="pv-fb-stats-reactions"><i className="pv-fb-reaction-dot"><ThumbsUpIcon/></i>0</span><span>0 comentários · 0 compartilhamentos</span></div>
    <div className="pv-fb-actions" aria-hidden="true">
      <button type="button" tabIndex={-1}><ThumbsUpIcon/> Curtir</button>
      <button type="button" tabIndex={-1}><CommentIcon/> Comentar</button>
      <button type="button" tabIndex={-1}><ShareArrowIcon/> Compartilhar</button>
    </div>
  </>
}

// --- YouTube --------------------------------------------------------------

function YoutubeVideoCard({ accountLabel, avatarUrl, previews, mediaProfile, aspectRequest, title, duration, coverUrl }) {
  return <>
    <div className="pv-yt-thumb-wrap">
      <PreviewMedia platform="youtube" previews={previews} aspectRequest={aspectRequest} mediaProfile={mediaProfile} coverUrl={coverUrl}/>
      {mediaProfile?.kind === 'video' && <span className="pv-yt-duration">{formatDuration(duration)}</span>}
    </div>
    <div className="pv-yt-meta">
      <PreviewAvatar platform="youtube" avatarUrl={avatarUrl}/>
      <div className="pv-yt-meta-text"><strong className={title ? '' : 'is-placeholder'}>{title || 'Título do seu vídeo aparecerá aqui'}</strong><small>{accountLabel} · 0 visualizações · agora</small></div>
      <MoreIcon className="pv-more"/>
    </div>
  </>
}

function YoutubeShortCard({ accountLabel, avatarUrl, previews, mediaProfile, aspectRequest, title, coverUrl }) {
  return <div className="pv-fullbleed pv-short">
    <PreviewMedia platform="youtube" previews={previews} aspectRequest={aspectRequest} mediaProfile={mediaProfile} fill coverUrl={coverUrl}/>
    <span className="pv-short-badge">Shorts</span>
    <div className="pv-short-rail">
      <span className="pv-reel-rail-item"><HeartIcon/><b>0</b></span>
      <span className="pv-reel-rail-item"><DislikeIcon/></span>
      <span className="pv-reel-rail-item"><CommentIcon/><b>0</b></span>
      <span className="pv-reel-rail-item"><ShareArrowIcon/></span>
      <span className="pv-reel-rail-item"><RemixIcon/></span>
      <PreviewAvatar platform="youtube" avatarUrl={avatarUrl} size="sm"/>
    </div>
    <div className="pv-fullbleed-bottom">
      <strong className={`pv-short-title${title ? '' : ' is-placeholder'}`}>{title || 'Título do seu vídeo aparecerá aqui'}</strong>
      <small>{accountLabel}</small>
    </div>
  </div>
}

// --- TikTok --------------------------------------------------------------

function TiktokCard({ accountHandle, avatarUrl, previews, mediaProfile, aspectRequest, caption, title, coverUrl }) {
  return <div className="pv-fullbleed pv-tt">
    <PreviewMedia platform="tiktok" previews={previews} aspectRequest={aspectRequest} mediaProfile={mediaProfile} fill coverUrl={coverUrl}/>
    <div className="pv-reel-rail pv-tt-rail">
      <span className="pv-tt-avatar"><PreviewAvatar platform="tiktok" avatarUrl={avatarUrl} size="sm"/><i className="pv-tt-plus" aria-hidden="true">+</i></span>
      <span className="pv-reel-rail-item"><HeartIcon/><b>0</b></span>
      <span className="pv-reel-rail-item"><CommentIcon/><b>0</b></span>
      <span className="pv-reel-rail-item"><BookmarkIcon/><b>0</b></span>
      <span className="pv-reel-rail-item"><ShareArrowIcon/><b>0</b></span>
      <span className="pv-tt-disc" aria-hidden="true"><MusicNoteIcon/></span>
    </div>
    <div className="pv-fullbleed-bottom">
      <strong>{accountHandle}</strong>
      {title && <p className="pv-tt-title">{title}</p>}
      <p className={`pv-fullbleed-caption${caption ? '' : ' is-placeholder'}`}>{caption || 'A descrição da sua publicação aparecerá aqui.'}</p>
      <span className="pv-fullbleed-audio"><MusicNoteIcon/> som original · {accountHandle}</span>
    </div>
  </div>
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

export function PostPreview({ textByPlatform, titleByPlatform, selected, files, filesByPlatform = {}, previews, publishNow, approvalRequested, date, youtubeTitle, igFormat, igAspect, onIgAspectChange, tiktokAspect, youtubeFormat, facebookFormat, mediaProfile, accounts, coverUrl = '', inSheet = false }) {
  const availablePlatforms = selected.length ? selected : PLATFORMS
  const [activePlatform, setActivePlatform] = useState(availablePlatforms[0])
  const platformsKey = availablePlatforms.join(',')
  useEffect(() => {
    const available = platformsKey.split(',')
    if (!available.includes(activePlatform)) setActivePlatform(available[0])
  }, [activePlatform, platformsKey])
  const activeFiles = filesByPlatform[activePlatform]?.length ? filesByPlatform[activePlatform] : files
  const activeFileKeys = new Set(activeFiles.map(file => mediaFileKey(file)))
  const activePreviews = previews.filter(preview => activeFileKeys.has(preview.key))
  const activeMediaProfile = activeFiles[0]
    ? { ...mediaProfile, kind: activeFiles[0].type.startsWith('video/') ? 'video' : 'image' }
    : mediaProfile
  const activeText = activePlatform === 'tiktok' ? (textByPlatform.tiktokDescription || '') : (textByPlatform[activePlatform] || '')
  const activeTitle = titleByPlatform[activePlatform] || ''
  const connectedAccount = accounts.find(account => account.platform === activePlatform)
  const rawHandle = connectedAccount?.handle || connectedAccount?.name || ''
  const accountLabel = rawHandle || 'Sua marca'
  const accountHandle = rawHandle ? (rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`) : '@sua_marca'
  const avatarUrl = connectedAccount?.avatarUrl || ''
  const requestedAspect = activePlatform === 'instagram' ? igAspect : activePlatform === 'tiktok' ? tiktokAspect : activePlatform === 'facebook' && facebookFormat === 'reel' ? 'vertical' : activePlatform === 'youtube' && youtubeFormat === 'short' ? 'vertical' : 'auto'
  const resolvedAspect = resolvePreviewAspect({ platform: activePlatform, mediaKind: activeMediaProfile?.kind, sourceRatio: activeMediaProfile?.ratio, requested: requestedAspect, instagramFormat: igFormat, facebookFormat })
  const instagramVideoIsReel = activePlatform === 'instagram' && activeMediaProfile?.kind === 'video' && igFormat !== 'story'
  const isInstagramStory = activePlatform === 'instagram' && igFormat === 'story'
  // Um vídeo no Feed pode ser publicado como Reels automaticamente, mas a
  // prévia deve continuar mostrando o cartão do Feed. O enquadramento vertical
  // fica reservado para Reels/Story escolhidos explicitamente.
  const isInstagramFullBleed = activePlatform === 'instagram' && (igFormat === 'reel' || isInstagramStory)
  const isYoutubeShort = activePlatform === 'youtube' && youtubeFormat === 'short'
  const isFullBleedCard = shouldUseFullBleedPreview({ platform: activePlatform, instagramFormat: igFormat, facebookFormat, youtubeFormat })
  // Cabeçalho curto ("Instagram · Feed" / "1:1 · 1080 × 1080 recomendado"); o resto
  // fica em "Sobre esta prévia".
  const formatName = activePlatform === 'instagram'
    ? (instagramVideoIsReel ? 'Reels automático' : igFormat === 'reel' ? 'Reels' : igFormat === 'story' ? 'Story' : 'Feed')
    : activePlatform === 'facebook'
      ? (facebookFormat === 'reel' ? 'Reels' : 'Feed')
      : activePlatform === 'youtube'
        ? (youtubeFormat === 'short' ? 'Short' : 'Vídeo')
        : activeMediaProfile?.kind === 'image' ? 'Foto' : 'Vídeo'
  const ratioText = resolvedAspect.key === 'instagramWide' ? '1,91:1' : resolvedAspect.label
  const sizeText = `${ratioText} · ${String(resolvedAspect.dimensions || '').replace(/\s*px$/, '')} recomendado`
  const resolutionHint = socialMediaResolutionHint(activePlatform, { instagramFormat: igFormat, facebookFormat, youtubeFormat, mediaKind: activeMediaProfile?.kind })
  const statusLabel = approvalRequested ? 'Aguardando aprovação' : publishNow ? 'Publicar agora' : date ? scheduleChipLabel(date) : 'Rascunho'
  const detectionText = activeMediaProfile
    ? `${mediaKindLabel(activeMediaProfile.kind)}${activeMediaProfile.ratio ? ` · original ${ratioLabel(activeMediaProfile.width, activeMediaProfile.height)}` : ''}`
    : 'Ainda sem mídia: a proporção é detectada quando você adicionar uma imagem ou vídeo.'
  return <section className="mp-preview" aria-labelledby={inSheet ? undefined : 'mp-preview-title'}>
    <div className="mp-preview__head">
      {inSheet ? <span className="ds-meta">Como vai aparecer em cada rede</span> : <h2 className="mp-preview__title" id="mp-preview-title">Prévia</h2>}
      <span className="ds-badge" data-tone={approvalRequested ? 'info' : publishNow ? 'gold' : date ? 'info' : 'outline'}>{statusLabel}</span>
    </div>
    <div className="ds-netswitch mp-preview__tabs" role="tablist" aria-label="Prévia por rede social" onKeyDown={event => handleTabKeys(event, availablePlatforms, activePlatform, setActivePlatform, 'mp-pv-tab-')}>
      {availablePlatforms.map(platform => <button type="button" role="tab" id={`mp-pv-tab-${platform}`} aria-controls="mp-preview-stage" aria-selected={activePlatform === platform} tabIndex={activePlatform === platform ? 0 : -1} className="ds-netswitch__opt" key={platform} onClick={() => setActivePlatform(platform)}><NetworkGlyph network={platform} size={16} />{PLATFORM_LABELS[platform]}</button>)}
    </div>
    <div className="mp-preview__stage" id="mp-preview-stage" role="tabpanel" aria-labelledby={`mp-pv-tab-${activePlatform}`}>
      <div className="mp-preview__format">
        <p className="mp-preview__formatname">{PLATFORM_LABELS[activePlatform]} · {formatName}</p>
        <p className="ds-meta">{sizeText}</p>
      </div>
      {activePlatform === 'instagram' && igFormat === 'post' && onIgAspectChange && <div className="ds-field mp-preview__aspect">
        <label className="ds-label" htmlFor="mp-pv-aspect">Proporção da prévia</label>
        <Select id="mp-pv-aspect" value={igAspect} onChange={onIgAspectChange} options={IG_PREVIEW_ASPECT_CHOICES} sheetTitle="Proporção da prévia" />
      </div>}
      <div className={`social-preview-card social-preview-card-${activePlatform}${isFullBleedCard ? ' is-fullbleed' : ''}`}>
      {activePlatform === 'instagram' ? (
        isInstagramFullBleed
           ? <InstagramFullBleedCard accountHandle={accountHandle} avatarUrl={avatarUrl} previews={activePreviews} igFormat={igFormat} aspectRequest={requestedAspect} mediaProfile={activeMediaProfile} caption={activeText} isStory={isInstagramStory} coverUrl={coverUrl}/>
           : <InstagramFeedCard accountLabel={accountLabel} accountHandle={accountHandle} avatarUrl={avatarUrl} previews={activePreviews} igFormat={igFormat} aspectRequest={requestedAspect} mediaProfile={activeMediaProfile} caption={activeText} coverUrl={coverUrl}/>
       ) : activePlatform === 'facebook' ? (
          <FacebookCard accountLabel={accountLabel} avatarUrl={avatarUrl} previews={activePreviews} mediaProfile={activeMediaProfile} aspectRequest={requestedAspect} facebookFormat={facebookFormat} caption={activeText} coverUrl={coverUrl}/>
       ) : activePlatform === 'youtube' ? (
         isYoutubeShort
           ? <YoutubeShortCard accountLabel={accountLabel} avatarUrl={avatarUrl} previews={activePreviews} mediaProfile={activeMediaProfile} aspectRequest={requestedAspect} title={youtubeTitle || activeText} coverUrl={coverUrl}/>
           : <YoutubeVideoCard accountLabel={accountLabel} avatarUrl={avatarUrl} previews={activePreviews} mediaProfile={activeMediaProfile} aspectRequest={requestedAspect} title={youtubeTitle || activeText} duration={activeMediaProfile?.duration} coverUrl={coverUrl}/>
       ) : (
        <TiktokCard accountHandle={accountHandle} avatarUrl={avatarUrl} previews={activePreviews} mediaProfile={activeMediaProfile} aspectRequest={requestedAspect} caption={activeText} title={activeTitle} coverUrl={coverUrl}/>
      )}
      </div>
      <details className="ds-disclosure mp-preview__about">
        <summary>Sobre esta prévia<Icon name="chevronDown" className="ds-disclosure__chev" /></summary>
        <div className="ds-disclosure__body mp-preview__aboutbody">
          <p className="ds-hint">{detectionText}</p>
          <p className="ds-hint">Tamanhos recomendados: {resolutionHint}.</p>
          {instagramVideoIsReel && <p className="ds-hint">Um vídeo único vai como Reels e também aparece no feed.</p>}
          {activePlatform === 'tiktok' && activeMediaProfile?.kind === 'image' && <p className="ds-hint">Fotos entram sem corte, ajustadas a {TIKTOK_VIDEO_DIMENSIONS.label}.</p>}
          {activeFiles.length > 1 && !['instagram', 'tiktok', 'facebook'].includes(activePlatform) && <p className="ds-hint">{activeFiles.length} mídias selecionadas: só a primeira aparece na prévia desta rede.</p>}
          <p className="ds-hint">A prévia simula a estrutura da rede; o resultado final pode variar conforme o formato e a conta.</p>
        </div>
      </details>
    </div>
  </section>
}
