import { useCallback, useState } from 'react'
import { filterByPeriod, filterTikTokVideosByPeriod, fmtNum, fmtWatchTime, PLAT_LABELS } from '../../lib/analytics-format.js'
import { CommentsModal } from './comments-modal.jsx'
import { Icon, NetworkGlyph } from '../ui/icon.jsx'

function TiktokPostsList({ tiktokVideos }) {
  if (!tiktokVideos.length) return <p className="rel-empty">Nenhum vídeo publicado.</p>
  return (
    <ul className="rel-posts__list">
      {tiktokVideos.map((v, index) => {
        const timestamp = Number(v.createTime)
        const publishedAt = v.publishedAt || (Number.isFinite(timestamp) ? new Date(timestamp * 1000).toISOString() : null)
        return <li key={v.id || v.shareUrl || index} className="rel-post">
          {v.coverImageUrl
            ? <img className="rel-post__thumb" src={v.coverImageUrl} alt="" />
            : <span className="rel-post__thumb" aria-hidden="true"><NetworkGlyph network="tiktok" size={20} /></span>}
          <div className="rel-post__body">
            <p className="ds-meta">{publishedAt ? new Date(publishedAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Data não informada'}</p>
            <p className="rel-post__text">{v.title ? (v.title.length > 70 ? v.title.slice(0, 70) + '…' : v.title) : <span className="ds-meta">Sem título</span>}</p>
            <ul className="rel-post__nums">
              <li><Icon name="eye" size={16} /><span className="ds-sr-only">Visualizações:</span>{fmtNum(v.viewCount)}</li>
              <li><Icon name="heart" size={16} /><span className="ds-sr-only">Curtidas:</span>{fmtNum(v.likeCount)}</li>
              <li><Icon name="comment" size={16} /><span className="ds-sr-only">Comentários:</span>{fmtNum(v.commentCount)}</li>
              <li><Icon name="share" size={16} /><span className="ds-sr-only">Compartilhamentos:</span>{fmtNum(v.shareCount)}</li>
            </ul>
          </div>
          {v.shareUrl && <a className="ds-btn ds-btn--quiet ds-btn--sm rel-post__open" href={v.shareUrl} target="_blank" rel="noopener noreferrer">Abrir no TikTok<Icon name="external" size={16} /><span className="ds-sr-only"> (abre em nova aba)</span></a>}
        </li>
      })}
    </ul>
  )
}

function groupByPost(metrics) {
  const grupos = {}
  for (const m of metrics) {
    const key = m.postId || `${m.text || ''}${m.publishedAt || ''}`
    if (!grupos[key]) grupos[key] = { ...m, plataformas: [] }
    grupos[key].plataformas.push({ platform: m.platform, metrics: m.metrics, metricsStatus: m.metricsStatus, postId: m.postId })
  }
  return Object.values(grupos)
}

function PostThumb({ post }) {
  const itens = post.mediaItems?.length ? post.mediaItems : (post.mediaPath ? [{ path: post.mediaPath, type: post.mediaType }] : [])
  if (!itens.length) return <span className="rel-post__thumb" aria-hidden="true"><Icon name="compose" /></span>
  const item = itens[0]
  return item.type === 'video'
    ? <video className="rel-post__thumb" src={item.path} muted playsInline preload="metadata" />
    : <img className="rel-post__thumb" src={item.path} alt="" />
}

const METRIC_FIELDS = [
  { key: 'views', label: 'Visualizações' },
  { key: 'reach', label: 'Alcance' },
  { key: 'impressions', label: 'Impressões' },
  { key: 'likes', label: 'Curtidas' },
  { key: 'comments', label: 'Comentários' },
  { key: 'shares', label: 'Compartilhamentos' },
  { key: 'saves', label: 'Salvamentos' },
  { key: 'clicks', label: 'Cliques' },
  { key: 'follows', label: 'Seguidores ganhos' },
  { key: 'engagedViews', label: 'Visualizações engajadas' },
  { key: 'estimatedMinutesWatched', label: 'Minutos assistidos' },
  { key: 'averageViewDuration', label: 'Duração média' },
  { key: 'averageViewPercentage', label: 'Retenção média' },
  { key: 'dislikes', label: 'Não gostei' },
  { key: 'subscribersGained', label: 'Inscritos ganhos' },
  { key: 'subscribersLost', label: 'Inscritos perdidos' }
]

function metricIsAvailable(value) {
  return value !== null && value !== undefined
}

function formatMetricValue(key, value) {
  if (key === 'averageViewPercentage' || key === 'engagementRate') {
    return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
  }
  // A duração média chega em segundos; exibida como m:ss, igual ao cartão de tempo assistido.
  if (key === 'averageViewDuration') return fmtWatchTime(Number(value))
  return fmtNum(value)
}

function formatUpdatedAt(value) {
  if (!value) return 'Atualização não informada pela rede'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Atualização não informada pela rede'
  return `Atualizado em ${date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })}`
}

function PostNetworkMetrics({ platform, metrics, metricsStatus, postId, onOpenComments }) {
  const fields = METRIC_FIELDS.filter(field => metricIsAvailable(metrics?.[field.key]))
  if (metricIsAvailable(metrics?.engagementRate)) fields.push({ key: 'engagementRate', label: 'Taxa de engajamento' })

  return (
    <div className="rel-postnet">
      <p className="rel-postnet__head"><NetworkGlyph network={platform} size={16} /><strong>{PLAT_LABELS[platform] || platform}</strong><span className="ds-meta">{formatUpdatedAt(metrics?.lastUpdated)}</span></p>
      {metrics
        ? <>
            {fields.length
              ? <dl className="rel-postnet__figures">
                  {fields.map(field => <div key={field.key}><dt title={field.label}>{field.label}</dt><dd>{formatMetricValue(field.key, metrics[field.key])}</dd></div>)}
                </dl>
              : <p className="ds-hint">A rede ainda não retornou métricas para este post.</p>}
            {metrics.reactionBreakdown && (
              <p className="ds-meta">Reações: {Object.entries(metrics.reactionBreakdown).map(([type, value]) => `${type} ${fmtNum(value)}`).join(' · ')}</p>
            )}
            {(metrics.platformUrl || (platform === 'instagram' && postId)) && <div className="rel-postnet__actions">
              {metrics.platformUrl && (
                <a href={metrics.platformUrl} target="_blank" rel="noopener noreferrer" className="ds-btn ds-btn--quiet ds-btn--sm">Abrir na rede<Icon name="external" size={16} /><span className="ds-sr-only"> (abre em nova aba)</span></a>
              )}
              {platform === 'instagram' && postId && (
                <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={() => onOpenComments(postId)}><Icon name="comment" size={16} />Ver comentários</button>
              )}
            </div>}
          </>
        : <p className="ds-hint">
            {metricsStatus === 'missing_external_id'
              ? 'Sem ID externo: reconecte a conta ou publique novamente para sincronizar os dados.'
              : 'Não foi possível sincronizar os dados deste post agora.'}
          </p>}
    </div>
  )
}

function NetworkPostsList({ metrics, onOpenComments }) {
  const posts = groupByPost(metrics).sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
  if (!posts.length) return <p className="rel-empty">Nenhum post no período.</p>

  return (
    <ul className="rel-posts__list">
      {posts.map((post, i) => (
        <li key={post.postId || i} className="rel-post rel-post--full">
          <PostThumb post={post} />
          <div className="rel-post__body">
            <p className="ds-meta">{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}</p>
            <p className="rel-post__text">{post.text || post.youtubeTitle ? (post.text || post.youtubeTitle).slice(0, 70) : <span className="ds-meta">Sem texto</span>}</p>
            {post.plataformas.map((pl, j) => (
              <PostNetworkMetrics key={`${pl.platform}-${j}`} platform={pl.platform} metrics={pl.metrics} metricsStatus={pl.metricsStatus} postId={pl.postId} onOpenComments={onOpenComments} />
            ))}
          </div>
        </li>
      ))}
    </ul>
  )
}

export function AnalyticsPostsList({ net, tab, data, tiktokVideos, periodDays }) {
  const [commentsPostId, setCommentsPostId] = useState(null)
  // Função estável: o modal recarrega os comentários quando onClose muda.
  const closeComments = useCallback(() => setCommentsPostId(null), [])
  if (tab !== 'posts' && tab !== 'videos') return null

  if (net === 'tiktok') return <TiktokPostsList tiktokVideos={filterTikTokVideosByPeriod(tiktokVideos, periodDays)} />

  const metrics = filterByPeriod(data.metrics, periodDays).filter(m => m.platform === net)
  return <>
    <p className="ds-hint">Dados reais por publicação e rede. A lista é atualizada automaticamente.</p>
    <NetworkPostsList metrics={metrics} onOpenComments={setCommentsPostId} />
    {commentsPostId != null && <CommentsModal postId={commentsPostId} onClose={closeComments} />}
  </>
}
