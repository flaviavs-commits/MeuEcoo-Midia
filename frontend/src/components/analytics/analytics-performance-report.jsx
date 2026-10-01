import {
  accountAnalyticsPlatformTotals,
  filterByPeriodOffset,
  filterTikTokVideosByPeriod,
  filterTikTokVideosByPeriodOffset,
  fmtNum,
  NETWORK_ORDER,
  PLAT_LABELS,
} from '../../lib/analytics-format.js'

function numberValue(value) {
  const normalized = value && typeof value === 'object' ? value.total : value
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

function sumRows(rows, name) {
  const values = rows.map(row => numberValue(row.metrics?.[name])).filter(value => value != null)
  return values.length ? values.reduce((total, value) => total + value, 0) : null
}

function sumVideos(videos, name) {
  const values = videos.map(video => numberValue(video[name])).filter(value => value != null)
  return values.length ? values.reduce((total, value) => total + value, 0) : null
}

function hasMetricData(row) {
  return ['views', 'likes', 'comments', 'shares', 'saves'].some(name => numberValue(row.metrics?.[name]) != null)
}

function rowsFor(data, tiktokVideos, periodDays, platform, offset = 0) {
  const rows = filterByPeriodOffset(data.metrics, periodDays, offset).filter(item => item.platform === platform && hasMetricData(item))
  if (platform === 'tiktok') {
    const videos = filterTikTokVideosByPeriodOffset(tiktokVideos, periodDays, offset).map(video => ({
      publishedAt: video.publishedAt || (video.createTime ? new Date(Number(video.createTime) * 1000).toISOString() : null),
      text: video.title || '',
      metrics: { views: video.viewCount, likes: video.likeCount, comments: video.commentCount, shares: video.shareCount, saves: video.saveCount },
    }))
    if (videos.some(hasMetricData) || !rows.length) return videos
  }
  return rows
}

function audienceFor(data, platform) {
  const followerAccounts = (data.accountAnalytics?.followerStats?.accounts || []).filter(item => item.platform === platform)
  if (followerAccounts.length) {
    const current = followerAccounts.map(item => numberValue(item.currentFollowers)).filter(value => value != null)
    const growth = followerAccounts.map(item => numberValue(item.growth)).filter(value => value != null)
    return {
      current: current.length ? current.reduce((total, value) => total + value, 0) : null,
      growth: growth.length ? growth.reduce((total, value) => total + value, 0) : null,
    }
  }

  const history = platform === 'instagram' ? data.instagramFollowers : platform === 'tiktok' ? data.tiktokStats : platform === 'youtube' ? data.youtubeSubscribers : {}
  const entries = Object.entries(history || {}).sort(([a], [b]) => a.localeCompare(b))
  if (!entries.length) return { current: null, growth: null }
  const valueOf = value => numberValue(value?.followerCount ?? value?.subscriberCount)
  const current = valueOf(entries.at(-1)[1])
  const first = valueOf(entries[0][1])
  return { current, growth: current != null && first != null ? current - first : null }
}

function fallbackTotal(platformTotals, platform, key) {
  const entry = platformTotals[platform]?.[key]
  return entry?.hasData ? entry.value : null
}

function interactionScore(row) {
  return ['likes', 'comments', 'shares', 'saves']
    .reduce((sum, name) => sum + (numberValue(row.metrics?.[name]) || 0), 0)
}

function interactionTotal(row) {
  const values = ['likes', 'comments', 'shares', 'saves']
    .map(name => numberValue(row?.metrics?.[name]))
    .filter(value => value != null)
  return values.length ? values.reduce((sum, current) => sum + current, 0) : null
}

function contentTitle(row) {
  return row?.text || row?.title || row?.youtubeTitle || row?.caption || 'Conteúdo sem descrição'
}

function contentFormat(row) {
  return {
    image: 'imagem',
    video: 'vídeo',
    carousel: 'carrossel',
  }[row?.mediaType] || 'conteúdo'
}

function shortContentTitle(row, maxLength = 84) {
  const title = contentTitle(row).replace(/\s+/g, ' ').trim()
  return title.length > maxLength ? `${title.slice(0, maxLength - 1).trimEnd()}…` : title
}

function interactionBreakdown(row) {
  return {
    likes: numberValue(row?.metrics?.likes),
    comments: numberValue(row?.metrics?.comments),
    shares: numberValue(row?.metrics?.shares),
    saves: numberValue(row?.metrics?.saves),
  }
}

export function buildPerformanceReport(data, tiktokVideos, periodDays, activeNet = null) {
  const platformTotals = accountAnalyticsPlatformTotals(data.accountAnalytics)
  const platforms = NETWORK_ORDER
    .filter(platform => !activeNet || platform === activeNet)
    .map(platform => {
      const rows = rowsFor(data, tiktokVideos, periodDays, platform)
      const previousRows = rowsFor(data, tiktokVideos, periodDays, platform, 1)
      const views = sumRows(rows, 'views') ?? sumVideos(platform === 'tiktok' ? filterTikTokVideosByPeriod(tiktokVideos, periodDays) : [], 'viewCount') ?? fallbackTotal(platformTotals, platform, 'views')
      const likes = sumRows(rows, 'likes') ?? fallbackTotal(platformTotals, platform, 'likes')
      const comments = sumRows(rows, 'comments') ?? fallbackTotal(platformTotals, platform, 'comments')
      const shares = sumRows(rows, 'shares') ?? fallbackTotal(platformTotals, platform, 'shares')
      const saves = sumRows(rows, 'saves')
      const impressions = sumRows(rows, 'impressions')
      const interactions = [likes, comments, shares, saves].some(value => value != null)
        ? [likes, comments, shares, saves].reduce((total, value) => total + (value || 0), 0)
        : fallbackTotal(platformTotals, platform, 'engagement')
      const previousViews = sumRows(previousRows, 'views')
      const previousInteractions = [sumRows(previousRows, 'likes'), sumRows(previousRows, 'comments'), sumRows(previousRows, 'shares'), sumRows(previousRows, 'saves')]
        .some(value => value != null)
        ? [sumRows(previousRows, 'likes'), sumRows(previousRows, 'comments'), sumRows(previousRows, 'shares'), sumRows(previousRows, 'saves')].reduce((total, value) => total + (value || 0), 0)
        : null
      const audience = audienceFor(data, platform)
      const contentRows = rows.filter(hasMetricData)
      const bestContent = [...contentRows]
        .sort((a, b) => interactionScore(b) - interactionScore(a) || (numberValue(b.metrics?.views) || 0) - (numberValue(a.metrics?.views) || 0))[0] || null
      return {
        platform,
        rows,
        bestContent,
        content: rows.length,
        views,
        likes,
        comments,
        shares,
        saves,
        impressions,
        interactions,
        rate: views > 0 && interactions != null ? interactions / views * 100 : null,
        audience: audience.current,
        growth: audience.growth,
        previousViews,
        previousInteractions,
      }
    })

  const total = key => {
    const values = platforms.map(item => item[key]).filter(value => value != null)
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null
  }
  const totals = {
    content: platforms.reduce((sum, item) => sum + item.content, 0),
    views: total('views'),
    interactions: total('interactions'),
    audience: total('audience'),
    growth: total('growth'),
    impressions: total('impressions'),
    saves: total('saves'),
  }
  totals.rate = totals.views > 0 && totals.interactions != null ? totals.interactions / totals.views * 100 : null

  const contentRows = platforms.flatMap(item => item.rows.map(row => ({ ...row, platform: item.platform }))).filter(hasMetricData)
  const bestContent = [...contentRows].sort((a, b) => interactionScore(b) - interactionScore(a) || (numberValue(b.metrics?.views) || 0) - (numberValue(a.metrics?.views) || 0))[0] || null
  const previousViewValues = platforms.map(item => item.previousViews).filter(value => value != null)
  const previousInteractionValues = platforms.map(item => item.previousInteractions).filter(value => value != null)
  const previousViews = previousViewValues.length ? previousViewValues.reduce((sum, value) => sum + value, 0) : null
  const previousInteractions = previousInteractionValues.length ? previousInteractionValues.reduce((sum, value) => sum + value, 0) : null
  return { platforms, totals, previousViews, previousInteractions, bestContent }
}

export function performanceReportConclusion(report) {
  const { totals } = report
  if (!totals.content && totals.views == null) return 'Ainda não há dados suficientes para explicar o desempenho. Publique ou conecte uma conta para formar a primeira base de comparação.'
  if (totals.rate == null) return 'Há volume de conteúdo, mas as redes não forneceram dados suficientes para calcular a taxa de interação.'
  if (totals.rate < 1) return 'O conteúdo está alcançando pessoas, porém poucas estão reagindo. O próximo teste deve priorizar chamadas para comentar, salvar ou compartilhar.'
  if (totals.rate < 3) return 'O conteúdo já gera reação, mas há espaço para aumentar a participação. Vale repetir os temas que mais provocaram comentários e compartilhamentos.'
  return 'A audiência está reagindo de forma consistente. Preserve os formatos de melhor resultado e teste variações sem perder o tema que já funciona.'
}

export function performanceReportActions(report) {
  const { totals, bestContent } = report
  if (!totals.content && totals.views == null) return ['Publique um novo conteúdo para criar uma base real de comparação.', 'Mantenha o mesmo período de análise após a publicação para medir a evolução.']
  const actions = []
  if (totals.rate != null && totals.rate < 2) actions.push('Use uma chamada objetiva no texto ou no vídeo para estimular comentários, salvamentos e compartilhamentos.')
  if (bestContent) {
    const interactions = interactionBreakdown(bestContent)
    const totalInteractions = interactionTotal(bestContent)
    const interactionDetails = [
      ['likes', 'curtidas'],
      ['comments', 'comentários'],
      ['shares', 'compartilhamentos'],
      ['saves', 'salvamentos'],
    ]
      .filter(([name]) => interactions[name] != null)
      .map(([name, label]) => `${fmtNum(interactions[name])} ${label}`)
      .join(' + ')
    const date = bestContent.publishedAt
      ? new Date(bestContent.publishedAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      : 'data não informada'
    const views = numberValue(bestContent.metrics?.views)
    actions.push(`Analise e replique este ${contentFormat(bestContent)} de ${PLAT_LABELS[bestContent.platform] || bestContent.platform}, publicado em ${date}: “${shortContentTitle(bestContent)}”. ${totalInteractions == null ? 'A rede confirmou o conteúdo, mas não informou interações.' : `Ele gerou ${fmtNum(totalInteractions)} ${totalInteractions === 1 ? 'interação' : 'interações'}${interactionDetails ? ` (${interactionDetails})` : ''}`}${views == null ? '.' : ` em ${fmtNum(views)} visualizações.`}`)
  }
  if (totals.growth != null && totals.growth < 0) actions.push('Revise os conteúdos que coincidiram com a queda de audiência e teste temas ou horários diferentes.')
  if (!actions.length) actions.push('Repita os temas e formatos que trouxeram mais interações, acompanhando a taxa para validar a evolução.')
  return actions.slice(0, 3)
}
