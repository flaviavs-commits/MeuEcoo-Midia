import { Line, Bar } from 'react-chartjs-2'
import { EngagementTypeBar } from './engagement-type-bar.jsx'
import {
  filterByPeriod, filterByPeriodOffset, filterTikTokVideosByPeriod, filterTikTokVideosByPeriodOffset, tiktokVideoToMetric, latestOf, fmtNum, formatDiaBR, baseChartOptions, PLAT_LABELS, PLAT_COLORS, NETWORK_ORDER, ANALYTICS_PERIODS,
  accountAnalyticsPlatformTotals, vizColors,
} from '../../lib/analytics-format.js'
import { Icon, NetworkGlyph } from '../ui/icon.jsx'
import { useTheme } from '../ui/theme-selector.jsx'

function buildTrend(metrics) {
  const porDia = {}
  for (const m of metrics) {
    if (!m.publishedAt || !m.metrics) continue
    const dia = new Date(m.publishedAt).toISOString().slice(0, 10)
    porDia[dia] = porDia[dia] || { engagement: null, reach: null }
    const engagement = ['likes', 'comments', 'shares'].map(key => Number(m.metrics?.[key])).filter(Number.isFinite)
    if (engagement.length) porDia[dia].engagement = (porDia[dia].engagement || 0) + engagement.reduce((total, value) => total + value, 0)
    const views = Number(m.metrics?.views)
    if (Number.isFinite(views)) porDia[dia].reach = (porDia[dia].reach || 0) + views
  }
  return Object.keys(porDia).sort().slice(-7).map(dia => ({ dia, ...porDia[dia] }))
}

function buildPlatformCounts(metrics, tiktokVideos = []) {
  const porPlataforma = {}
  for (const m of metrics) porPlataforma[m.platform] = (porPlataforma[m.platform] || 0) + 1
  if (tiktokVideos.length) porPlataforma.tiktok = Math.max(porPlataforma.tiktok || 0, tiktokVideos.length)
  return Object.entries(porPlataforma)
}

function sumMetric(metrics, key) {
  const values = metrics.map(item => Number(item.metrics?.[key])).filter(Number.isFinite)
  return values.length ? values.reduce((total, value) => total + value, 0) : null
}

function sumKnown(values) {
  const known = values.filter(value => value != null && Number.isFinite(Number(value)))
  return known.length ? known.reduce((total, value) => total + Number(value), 0) : null
}

function hasMetricData(item) {
  return Object.values(item?.metrics || {}).some(value => value != null && Number.isFinite(Number(value)))
}

function audienceValue(data, platform) {
  const accountValues = (data.accountAnalytics?.followerStats?.accounts || [])
    .filter(account => account.platform === platform)
    .map(account => Number(account.currentFollowers))
    .filter(Number.isFinite)
  if (accountValues.length) return sumKnown(accountValues)

  const history = platform === 'instagram'
    ? data.instagramFollowers
    : platform === 'tiktok'
      ? data.tiktokStats
      : platform === 'youtube'
        ? data.youtubeSubscribers
        : {}
  const latest = latestOf(history)
  const value = Number(latest?.followerCount ?? latest?.subscriberCount)
  return Number.isFinite(value) ? value : null
}

function comparisonLabel(current, previous, enabled) {
  if (!enabled) return null
  if (current == null || previous == null || previous === 0) return 'Sem base anterior'
  const change = ((current - previous) / previous) * 100
  return `${change >= 0 ? '+' : ''}${change.toFixed(1)}% vs. período anterior`
}

function comparisonTrend(current, previous) {
  if (current == null || previous == null || previous === 0) return undefined
  return current >= previous ? 'up' : 'down'
}

function withAlpha(color, alpha) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(color || '').trim())
  if (!match) return color
  const value = parseInt(match[1], 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}

// Período e comparação valem para a página toda. A página usa este controle na
// barra de filtros; o resumo também pode exibi-lo (padrão, usado nos testes).
export function AnalyticsPeriodControl({ periodDays, comparePeriod = false, onSelectPeriod = () => {}, onToggleCompare = () => {} }) {
  const compareUnavailable = periodDays > 30
  return <div className="rel-period" role="group" aria-label="Período das métricas">
    <span className="rel-period__label">Período</span>
    <div className="ds-seg">
      {ANALYTICS_PERIODS.map(days => (
        <button key={days} type="button" className="ds-seg__opt" aria-pressed={days === periodDays} onClick={() => onSelectPeriod(days)}>{days} dias</button>
      ))}
    </div>
    <label className="ds-check rel-period__compare">
      <input type="checkbox" className="ds-switch" checked={comparePeriod} disabled={compareUnavailable} onChange={event => onToggleCompare(event.target.checked)} aria-describedby={compareUnavailable ? 'rel-compare-note' : undefined} />
      <span className="ds-check__text"><span>Comparar período anterior</span>{compareUnavailable && <span className="ds-check__hint" id="rel-compare-note">Disponível para períodos de até 30 dias.</span>}</span>
    </label>
  </div>
}

export function AnalyticsSummary({ data, tiktokVideos, periodDays, activeNet = null, onSelectPeriod = () => {}, comparePeriod = false, onToggleCompare = () => {}, showPeriodControl = true }) {
  useTheme()
  const scopeNetworks = activeNet ? [activeNet] : NETWORK_ORDER
  const metrics = filterByPeriod(data.metrics, periodDays).filter(item => scopeNetworks.includes(item.platform))
  const videos = filterTikTokVideosByPeriod(tiktokVideos, periodDays).filter(video => !activeNet || activeNet === 'tiktok')
  const tiktokMetrics = metrics.filter(item => item.platform === 'tiktok' && hasMetricData(item))
  const tiktokVideoRows = videos.map(tiktokVideoToMetric)
  // O catálogo real de vídeos do TikTok inclui publicações que não foram
  // criadas pelo app. Ele é a fonte principal quando tem métricas; o relatório
  // local só entra como fallback se o catálogo não respondeu com valores.
  const tiktokRows = tiktokVideoRows.some(hasMetricData) ? tiktokVideoRows : tiktokMetrics
  const summaryMetrics = [...metrics.filter(item => item.platform !== 'tiktok'), ...tiktokRows]
  const previousMetrics = filterByPeriodOffset(data.metrics, periodDays, 1).filter(item => scopeNetworks.includes(item.platform))
  const previousVideos = filterTikTokVideosByPeriodOffset(tiktokVideos, periodDays, 1).filter(() => !activeNet || activeNet === 'tiktok')
  const accountTotals = accountAnalyticsPlatformTotals(data.accountAnalytics)

  function platformRows(platform) {
    return platform === 'tiktok' ? tiktokRows : metrics.filter(item => item.platform === platform)
  }

  function mergedPlatformTotal(platform, key) {
    const accountValue = accountTotals[platform]?.[key]
    if (accountValue?.hasData) return accountValue.value
    return sumMetric(platformRows(platform), key)
  }

  const totalViews = sumKnown(scopeNetworks.map(platform => mergedPlatformTotal(platform, 'views')))
  const totalLikes = sumKnown(scopeNetworks.map(platform => mergedPlatformTotal(platform, 'likes')))
  const totalComments = sumKnown(scopeNetworks.map(platform => mergedPlatformTotal(platform, 'comments')))
  const totalShares = sumKnown(scopeNetworks.map(platform => mergedPlatformTotal(platform, 'shares')))
  const totalEngagement = sumKnown(scopeNetworks.map(platform => {
    const accountValue = accountTotals[platform]?.engagement
    if (accountValue?.hasData) return accountValue.value
    return sumKnown([mergedPlatformTotal(platform, 'likes'), mergedPlatformTotal(platform, 'comments'), mergedPlatformTotal(platform, 'shares')])
  }))
  const engagementRate = totalViews > 0 && totalEngagement != null ? (totalEngagement / totalViews * 100) : null
  const recommendation = totalViews == null
    ? 'Publique um novo conteúdo para começar a construir uma base de comparação.'
    : engagementRate != null && engagementRate < 2
      ? 'Teste uma chamada mais direta e formatos diferentes para estimular comentários e compartilhamentos.'
      : 'Mantenha o formato que está funcionando e replique os temas com maior interação.'
  const previousViews = sumMetric(previousMetrics, 'views')
  const previousEngagement = sumKnown([
    sumMetric(previousMetrics, 'likes'),
    sumMetric(previousMetrics, 'comments'),
    sumMetric(previousMetrics.filter(m => m.platform !== 'tiktok'), 'shares'),
    sumKnown(previousVideos.map(video => Number(video.shareCount)).filter(Number.isFinite)),
  ])
  const previousEngagementRate = previousViews > 0 && previousEngagement != null ? (previousEngagement / previousViews * 100) : null

  const audienceByNetwork = {
    instagram: audienceValue(data, 'instagram'),
    facebook: audienceValue(data, 'facebook'),
    tiktok: audienceValue(data, 'tiktok'),
    youtube: audienceValue(data, 'youtube'),
  }
  const totalFollowers = activeNet
    ? audienceByNetwork[activeNet] ?? null
    : sumKnown(Object.values(audienceByNetwork))
  const previousAudienceByNetwork = {
    instagram: latestOf(filterByPeriodOffset(data.instagramFollowers, periodDays, 1))?.followerCount,
    tiktok: latestOf(filterByPeriodOffset(data.tiktokStats, periodDays, 1))?.followerCount,
    youtube: latestOf(filterByPeriodOffset(data.youtubeSubscribers, periodDays, 1))?.subscriberCount,
  }
  const previousFollowers = activeNet
    ? previousAudienceByNetwork[activeNet] ?? null
    : sumKnown(Object.values(previousAudienceByNetwork))
  const scopeLabel = activeNet ? PLAT_LABELS[activeNet] : 'todas as redes'
  const audienceLabel = activeNet === 'youtube' ? 'Inscritos' : activeNet ? 'Seguidores' : 'Seguidores e inscritos'
  const audienceHelp = activeNet
    ? `Total atual registrado pelo ${scopeLabel}.`
    : 'Soma dos totais atuais registrados nas redes com histórico; não representa pessoas únicas.'

  const trend = buildTrend(summaryMetrics)
  const platformCounts = buildPlatformCounts(metrics, videos)
  const topPlatform = [...platformCounts].sort(([, a], [, b]) => b - a)[0]
  const platformEngagement = scopeNetworks.map(platform => {
    return {
      platform,
      likes: mergedPlatformTotal(platform, 'likes'),
      comments: mergedPlatformTotal(platform, 'comments'),
      shares: mergedPlatformTotal(platform, 'shares'),
    }
  }).filter(item => metrics.some(metric => metric.platform === item.platform) || (item.platform === 'tiktok' && videos.length) || accountTotals[item.platform])

  const figures = [
    { label: 'Visualizações', value: fmtNum(totalViews), current: totalViews, previous: previousViews },
    { label: 'Interações', value: fmtNum(totalEngagement), current: totalEngagement, previous: previousEngagement },
    { label: audienceLabel, value: fmtNum(totalFollowers), current: totalFollowers, previous: previousFollowers },
    { label: 'Taxa de interação', value: engagementRate == null ? '—' : `${engagementRate.toFixed(1)}%`, current: engagementRate, previous: previousEngagementRate },
  ]
  const colors = vizColors()

  return <>
    <section className="ds-block rel-glance" aria-labelledby="analytics-overview-title">
      <div className="ds-head">
        <div className="ds-head__text">
          <p className="ds-eyebrow">Resumo do período</p>
          <h2 className="ds-head__title" id="analytics-overview-title">Visão geral</h2>
          <p className="ds-head__desc">Um panorama rápido para você saber se o conteúdo está sendo visto e provocando reações.</p>
        </div>
        {showPeriodControl && <AnalyticsPeriodControl periodDays={periodDays} comparePeriod={comparePeriod} onSelectPeriod={onSelectPeriod} onToggleCompare={onToggleCompare} />}
      </div>

      <div className="ds-stats rel-figures" style={{ '--cols': 4 }}>
        {figures.map(figure => {
          const comparison = comparisonLabel(figure.current, figure.previous, comparePeriod)
          const trend = comparisonTrend(figure.current, figure.previous)
          return <div className="ds-stat" key={figure.label}>
            <p className="ds-stat__label">{figure.label}</p>
            <p className="ds-stat__value" data-state={figure.value === '—' ? 'unavailable' : undefined}>{figure.value}</p>
            {comparison && <p className="ds-delta" data-trend={comparison === 'Sem base anterior' ? undefined : trend}>
              {comparison !== 'Sem base anterior' && <Icon name={trend === 'down' ? 'chevronDown' : 'chevronUp'} />}{comparison}
            </p>}
          </div>
        })}
      </div>

      <div className="rel-notes">
        {topPlatform && <p className="rel-note"><Icon name="sparkle" size={16} /><span><strong>Leitura rápida:</strong> {PLAT_LABELS[topPlatform[0]] || topPlatform[0]} concentrou mais publicações no período, com {topPlatform[1]} {topPlatform[1] === 1 ? 'conteúdo publicado' : 'conteúdos publicados'}.</span></p>}
        <p className="rel-note"><Icon name="arrow" size={16} /><span><strong>Próxima ação:</strong> {recommendation}</span></p>
      </div>

      <details className="ds-disclosure rel-explain">
        <summary>Como interpretar este resumo<Icon name="chevronDown" className="ds-disclosure__chev" /></summary>
        <div className="ds-disclosure__body rel-explain__body">
          <p className="ds-meta">Período: últimos {periodDays} dias · Escopo: {scopeLabel}</p>
          <dl className="rel-explain__list" aria-label="Explicação dos indicadores">
            <div><dt>Visualizações</dt><dd>Reproduções do conteúdo. Não são necessariamente pessoas diferentes.</dd></div>
            <div><dt>Interações</dt><dd>Reações que mostram participação: curtidas, comentários e compartilhamentos.</dd></div>
            <div><dt>Taxa de interação</dt><dd>Mostra a proporção de interações em relação às visualizações. Uma taxa maior indica maior reação proporcional ao conteúdo visto.</dd></div>
            <div><dt>{audienceLabel}</dt><dd>{audienceHelp}</dd></div>
          </dl>
        </div>
      </details>
    </section>

    <section className="ds-block rel-charts" aria-labelledby="analytics-trend-title">
      <div className="rel-charts__grid">
        <figure className="rel-chart rel-chart--wide">
          <figcaption className="rel-chart__head">
            <h3 className="rel-chart__title" id="analytics-trend-title">Resultados por dia de publicação</h3>
            <p className="ds-hint">Visualizações e interações somadas nos últimos 7 dias em que houve publicação.</p>
          </figcaption>
          <div className="rel-canvas">
            {trend.length
              ? <Line
                  data={{
                    labels: trend.map(t => formatDiaBR(t.dia)),
                    datasets: [
                      { label: 'Visualizações', data: trend.map(t => t.reach), borderColor: colors.primary, backgroundColor: withAlpha(colors.primary, 0.12), fill: true, tension: 0.35, pointRadius: 3 },
                      { label: 'Interações', data: trend.map(t => t.engagement), borderColor: colors.tertiary, backgroundColor: withAlpha(colors.tertiary, 0.08), fill: true, tension: 0.35, pointRadius: 3 },
                    ],
                  }}
                  options={baseChartOptions()}
                />
              : <p className="rel-empty">Sem dados suficientes.</p>}
          </div>
        </figure>
        <figure className="rel-chart">
          <figcaption className="rel-chart__head"><h3 className="rel-chart__title">Posts por plataforma</h3></figcaption>
          <div className="rel-canvas rel-canvas--sm">
            {platformCounts.length
              ? <Bar
                  data={{
                    labels: platformCounts.map(([p]) => PLAT_LABELS[p] || p),
                    datasets: [{ data: platformCounts.map(([, count]) => count), backgroundColor: colors.primary, borderRadius: 6, maxBarThickness: 48 }],
                  }}
                  options={{ ...baseChartOptions(), plugins: { ...baseChartOptions().plugins, legend: { display: false } } }}
                />
              : <p className="rel-empty">Nenhum post publicado no período.</p>}
          </div>
        </figure>
        <figure className="rel-chart">
          <figcaption className="rel-chart__head">
            <h3 className="rel-chart__title">Tipo de engajamento</h3>
            <p className="ds-hint">As barras comparam os tipos dentro de cada rede.</p>
          </figcaption>
          {platformEngagement.length
            ? <div className="rel-engage">
              {platformEngagement.map(item => {
                const max = Math.max(item.likes, item.comments, item.shares, 1)
                return <div className="rel-engage__net" key={item.platform}>
                  <p className="rel-engage__name"><NetworkGlyph network={item.platform} size={16} />{PLAT_LABELS[item.platform]}</p>
                  <div className="ds-hbars">
                    <EngagementTypeBar icon="heart" label="Curtidas" value={item.likes} max={max} />
                    <EngagementTypeBar icon="comment" label="Comentários" value={item.comments} max={max} />
                    <EngagementTypeBar icon="share" label="Compartilhamentos" value={item.shares} max={max} />
                  </div>
                </div>
              })}
            </div>
            : <p className="rel-empty">Nenhuma rede com interações no período.</p>}
        </figure>
      </div>
    </section>
  </>
}
