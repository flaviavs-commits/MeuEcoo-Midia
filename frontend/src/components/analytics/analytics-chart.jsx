import { Line, Bar } from 'react-chartjs-2'
import { filterByPeriod, filterTikTokVideosByPeriod, tiktokVideoToMetric, formatDiaBR, baseChartOptions, vizColors, chartLabel } from '../../lib/analytics-format.js'
import { useTheme } from '../ui/theme-selector.jsx'

function EmptyChart({ message }) {
  return <p className="rel-empty">{message}</p>
}

function hasMetricValue(metrics) {
  return Object.values(metrics || {}).some(value => value != null && value !== '' && Number.isFinite(Number(value)))
}

function GrowthChart({ net, title, instagramFollowers, tiktokStats, youtubeSubscribers }) {
  const colors = vizColors()
  const line = color => ({ borderColor: color, backgroundColor: 'transparent', fill: false, tension: 0.3, pointRadius: 3 })
  let data = null
  if (net === 'instagram') {
    const dias = Object.keys(instagramFollowers).sort()
    if (!dias.length) return <EmptyChart message="Sem dados de seguidores."/>
    data = { labels: dias.map(formatDiaBR), datasets: [{ label: 'Seguidores', data: dias.map(d => instagramFollowers[d].followerCount), ...line(colors.primary) }] }
  } else if (net === 'tiktok') {
    const dias = Object.keys(tiktokStats).sort()
    if (!dias.length) return <EmptyChart message="Sem dados do TikTok."/>
    data = {
      labels: dias.map(formatDiaBR),
      datasets: [
        { label: 'Seguidores', data: dias.map(d => tiktokStats[d].followerCount), ...line(colors.primary) },
        { label: 'Curtidas Totais', data: dias.map(d => tiktokStats[d].likesCount), ...line(colors.secondary) },
      ],
    }
  } else if (net === 'youtube') {
    const dias = Object.keys(youtubeSubscribers).sort()
    if (!dias.length) return <EmptyChart message="Sem dados de inscritos."/>
    data = { labels: dias.map(formatDiaBR), datasets: [{ label: 'Inscritos', data: dias.map(d => youtubeSubscribers[d].subscriberCount), ...line(colors.primary) }] }
  }
  if (!data) return null
  return <Line data={data} options={baseChartOptions()} aria-label={chartLabel(title, data)}/>
}

function PostsBarChart({ title, metrics }) {
  const colors = vizColors()
  const postsSorted = metrics.filter(m => m.publishedAt && hasMetricValue(m.metrics)).sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt))
  if (!postsSorted.length) return <EmptyChart message="Nenhum dado no período."/>

  const labels = postsSorted.map(m => {
    const data = new Date(m.publishedAt)
    const dd = String(data.getDate()).padStart(2, '0')
    const mm = String(data.getMonth() + 1).padStart(2, '0')
    const texto = (m.text || m.youtubeTitle || 'Sem texto').slice(0, 20)
    return `${dd}/${mm} · ${texto}…`
  })

  const hasViews = postsSorted.some(m => m.metrics.views != null)
  const hasLikes = postsSorted.some(m => m.metrics.likes != null)
  const hasComments = postsSorted.some(m => m.metrics.comments != null)

  const datasets = []
  if (hasViews) datasets.push({ label: 'Visualizações', data: postsSorted.map(m => m.metrics.views ?? null), backgroundColor: colors.primary, borderRadius: 4 })
  if (hasLikes) datasets.push({ label: 'Curtidas', data: postsSorted.map(m => m.metrics.likes ?? null), backgroundColor: colors.tertiary, borderRadius: 4 })
  if (hasComments) datasets.push({ label: 'Comentários', data: postsSorted.map(m => m.metrics.comments ?? null), backgroundColor: colors.secondary, borderRadius: 4 })
  if (!datasets.length) return <EmptyChart message="A rede não confirmou métricas para os posts deste período."/>

  const options = {
    ...baseChartOptions(),
    plugins: {
      ...baseChartOptions().plugins,
      tooltip: { callbacks: { title: items => (postsSorted[items[0].dataIndex].text || postsSorted[items[0].dataIndex].youtubeTitle || 'Sem texto').slice(0, 60) } },
    },
    scales: {
      ...baseChartOptions().scales,
      x: { ...baseChartOptions().scales.x, ticks: { ...baseChartOptions().scales.x.ticks, maxRotation: 35, font: { size: 10 } } },
    },
  }

  const data = { labels, datasets }
  return <Bar data={data} options={options} aria-label={chartLabel(title, data)}/>
}

export function AnalyticsChart({ net, tab, data, tiktokVideos = [], periodDays, title = 'Gráfico' }) {
  useTheme()
  const metrics = filterByPeriod(data.metrics, periodDays).filter(m => m.platform === net)
  const videos = filterTikTokVideosByPeriod(tiktokVideos, periodDays)
  const chartMetrics = net === 'tiktok' && !metrics.some(item => hasMetricValue(item.metrics))
    ? videos.map(tiktokVideoToMetric)
    : metrics
  const instagramFollowers = filterByPeriod(data.instagramFollowers, periodDays)
  const tiktokStats = filterByPeriod(data.tiktokStats, periodDays)
  const youtubeSubscribers = filterByPeriod(data.youtubeSubscribers, periodDays)

  const isGrowthView = tab === 'growth' || (tab === 'community' && (net === 'instagram' || net === 'tiktok' || net === 'youtube'))

  return (
    <div className="rel-canvas">
      {isGrowthView
        ? <GrowthChart net={net} title={title} instagramFollowers={instagramFollowers} tiktokStats={tiktokStats} youtubeSubscribers={youtubeSubscribers}/>
        : <PostsBarChart title={title} metrics={chartMetrics}/>}
    </div>
  )
}
