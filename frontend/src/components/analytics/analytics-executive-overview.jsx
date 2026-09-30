import { filterByPeriod, filterTikTokVideosByPeriod, fmtNum, NETWORK_ORDER, PLAT_LABELS } from '../../lib/analytics-format.js'
import { Icon, NetworkGlyph } from '../ui/icon.jsx'

function metricNumber(metrics, name) {
  const value = metrics?.[name]
  const normalized = value && typeof value === 'object' ? value.total : value
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

function sumNullable(rows, name) {
  const values = rows.map(row => metricNumber(row.metrics, name)).filter(value => value != null)
  return values.length ? values.reduce((total, value) => total + value, 0) : null
}

function hasMetricData(row) {
  return ['views', 'likes', 'comments', 'shares', 'saves'].some(name => metricNumber(row.metrics, name) != null)
}

function profileMetricSum(profiles, names) {
  const values = profiles.flatMap(profile => names.map(name => metricNumber(profile.totals?.metrics, name)).filter(value => value != null))
  return values.length ? values.reduce((total, value) => total + value, 0) : null
}

function profileMetricFirst(profiles, names) {
  const values = profiles.map(profile => names.map(name => metricNumber(profile.totals?.metrics, name)).find(value => value != null)).filter(value => value != null)
  return values.length ? values.reduce((total, value) => total + value, 0) : null
}

function audienceStats(data, platform) {
  const accounts = (data.accountAnalytics?.followerStats?.accounts || []).filter(item => item.platform === platform)
  if (accounts.length) {
    const current = accounts.map(item => Number(item.currentFollowers)).filter(Number.isFinite)
    const growth = accounts.map(item => Number(item.growth)).filter(Number.isFinite)
    return {
      current: current.length ? current.reduce((total, value) => total + value, 0) : null,
      growth: growth.length ? growth.reduce((total, value) => total + value, 0) : null
    }
  }

  const history = platform === 'instagram' ? data.instagramFollowers : platform === 'tiktok' ? data.tiktokStats : platform === 'youtube' ? data.youtubeSubscribers : {}
  const entries = Object.entries(history || {}).sort(([a], [b]) => a.localeCompare(b))
  if (!entries.length) return { current: null, growth: null }
  const valueOf = value => Number(value?.followerCount ?? value?.subscriberCount)
  const current = valueOf(entries.at(-1)[1])
  const first = valueOf(entries[0][1])
  return { current: Number.isFinite(current) ? current : null, growth: Number.isFinite(current) && Number.isFinite(first) ? current - first : null }
}

function networkRows(data, tiktokVideos, periodDays, platform) {
  const rows = filterByPeriod(data.metrics, periodDays).filter(item => item.platform === platform && hasMetricData(item))
  if (platform === 'tiktok') {
    const videos = filterTikTokVideosByPeriod(tiktokVideos, periodDays).map(video => ({
      publishedAt: video.publishedAt || (video.createTime ? new Date(Number(video.createTime) * 1000).toISOString() : null),
      text: video.title || '',
      metrics: { views: video.viewCount, likes: video.likeCount, comments: video.commentCount, shares: video.shareCount }
    }))
    if (videos.some(hasMetricData) || !rows.length) return videos
  }
  return rows
}

function buildNetworkStats(data, tiktokVideos, periodDays, activeNet = null) {
  return NETWORK_ORDER.filter(platform => !activeNet || platform === activeNet).map(platform => {
    const rows = networkRows(data, tiktokVideos, periodDays, platform)
    const profiles = data.accountAnalytics?.platforms?.[platform] || []
    const reachFromContent = sumNullable(rows, 'reach') ?? sumNullable(rows, 'views')
    const reach = reachFromContent ?? profileMetricFirst(profiles, platform === 'facebook' ? ['page_media_view', 'page_video_views'] : ['reach', 'views'])
    const impressions = sumNullable(rows, 'impressions') ?? profileMetricFirst(profiles, ['impressions', 'account_impressions'])
    const likes = sumNullable(rows, 'likes') ?? profileMetricSum(profiles, ['likes'])
    const comments = sumNullable(rows, 'comments') ?? profileMetricSum(profiles, ['comments'])
    const shares = sumNullable(rows, 'shares') ?? profileMetricSum(profiles, ['shares'])
    const saves = sumNullable(rows, 'saves') ?? profileMetricSum(profiles, ['saves'])
    const interactions = [likes, comments, shares, saves].some(value => value != null)
      ? [likes, comments, shares, saves].reduce((total, value) => total + (value || 0), 0)
      : null
    const audience = audienceStats(data, platform)
    return {
      platform,
      rows,
      content: rows.length,
      reach,
      impressions,
      interactions,
      saves,
      audience: audience.current,
      growth: audience.growth,
      rate: reach > 0 && interactions != null ? interactions / reach * 100 : null
    }
  }).filter(item => item.content || item.reach != null || item.audience != null)
}

function Kpi({ label, value, help }) {
  return <div className="ds-stat">
    <p className="ds-stat__label">{label}</p>
    <p className="ds-stat__value ds-stat__value--sm" data-state={value === '—' ? 'unavailable' : undefined}>{value}</p>
    <p className="ds-stat__caption">{help}</p>
  </div>
}

function formatRate(value) {
  return value == null ? '—' : `${value.toFixed(1)}%`
}

function interactionBreakdown(item) {
  return ['likes', 'comments', 'shares', 'saves'].reduce((total, name) => {
    const value = metricNumber(item.metrics, name)
    return { ...total, [name]: value }
  }, {})
}

export function AnalyticsExecutiveOverview({ data, tiktokVideos, periodDays, activeNet = null, recommendedActions = [], onSelectNetwork = null }) {
  const stats = buildNetworkStats(data, tiktokVideos, periodDays, activeNet)
  if (!stats.length) return null

  const totalReach = stats.some(item => item.reach != null) ? stats.reduce((total, item) => total + (item.reach || 0), 0) : null
  const totalImpressions = stats.some(item => item.impressions != null) ? stats.reduce((total, item) => total + (item.impressions || 0), 0) : null
  const totalInteractions = stats.some(item => item.interactions != null) ? stats.reduce((total, item) => total + (item.interactions || 0), 0) : null
  const totalSaves = stats.some(item => item.saves != null) ? stats.reduce((total, item) => total + (item.saves || 0), 0) : null
  const totalContent = stats.reduce((total, item) => total + item.content, 0)
  const totalGrowth = stats.some(item => item.growth != null) ? stats.reduce((total, item) => total + (item.growth || 0), 0) : null
  const avgInteractions = totalInteractions != null && totalContent ? totalInteractions / totalContent : null
  const bestNetwork = [...stats]
    .filter(item => item.interactions != null)
    .sort((a, b) => b.interactions - a.interactions)[0] || null
  const contentRows = stats.flatMap(item => item.rows.map(row => ({ ...row, platform: item.platform })))
  const bestContent = contentRows
    .filter(hasMetricData)
    .sort((a, b) => {
      const score = row => ['likes', 'comments', 'shares', 'saves'].reduce((total, name) => total + (metricNumber(row.metrics, name) || 0), 0)
      return score(b) - score(a)
    })[0]

  const bestNetworkNote = bestNetwork && (() => {
    const breakdown = bestContent && bestContent.platform === bestNetwork.platform
      ? contentRows
        .filter(row => row.platform === bestNetwork.platform && hasMetricData(row))
        .reduce((total, row) => {
          const rowBreakdown = interactionBreakdown(row)
          return Object.fromEntries(Object.keys(rowBreakdown).map(name => [
            name,
            rowBreakdown[name] == null ? total[name] : (total[name] == null ? rowBreakdown[name] : total[name] + rowBreakdown[name])
          ]))
        }, { likes: null, comments: null, shares: null, saves: null })
      : null
    const detail = breakdown
      ? ` (${fmtNum(breakdown.likes)} curtidas + ${fmtNum(breakdown.comments)} comentários + ${fmtNum(breakdown.shares)} compartilhamentos + ${fmtNum(breakdown.saves)} salvamentos)`
      : ''
    return <p className="rel-standout__note"><b>{activeNet ? 'Rede analisada:' : 'Melhor rede:'}</b> {PLAT_LABELS[bestNetwork.platform]} concentrou {fmtNum(bestNetwork.interactions)} interações no recorte{detail}.</p>
  })()

  return <section className="ds-block rel-exec" aria-labelledby="analytics-executive-title">
    <div className="ds-head">
      <div className="ds-head__text">
        <p className="ds-eyebrow">Painel executivo</p>
        <h2 className="ds-head__title" id="analytics-executive-title">{activeNet ? `Performance do ${PLAT_LABELS[activeNet]}` : 'Performance consolidada'}</h2>
        <p className="ds-head__desc">{activeNet ? `Resultados somente do ${PLAT_LABELS[activeNet]} no período selecionado.` : 'Resultados de todas as contas no período selecionado, rede a rede.'}</p>
      </div>
      <span className="ds-badge" data-tone="outline">Dados das integrações conectadas</span>
    </div>

    <div className="ds-stats rel-exec__figures" style={{ '--cols': 3 }}>
      <Kpi label="Alcance / visualizações" value={totalReach == null ? '—' : fmtNum(totalReach)} help="Soma do alcance ou das visualizações disponíveis." />
      <Kpi label="Interações" value={totalInteractions == null ? '—' : fmtNum(totalInteractions)} help="Curtidas, comentários, compartilhamentos e salvamentos." />
      <Kpi label="Média por conteúdo" value={avgInteractions == null ? '—' : fmtNum(Math.round(avgInteractions))} help="Interações médias por conteúdo analisado." />
      <Kpi label="Impressões" value={totalImpressions == null ? '—' : fmtNum(totalImpressions)} help="Exibido quando a rede fornece esse dado." />
      <Kpi label="Salvamentos" value={totalSaves == null ? '—' : fmtNum(totalSaves)} help="Conteúdos salvos pela audiência." />
      <Kpi label="Crescimento da audiência" value={totalGrowth == null ? '—' : `${totalGrowth >= 0 ? '+' : ''}${fmtNum(totalGrowth)}`} help="Variação de seguidores ou inscritos no histórico disponível." />
    </div>

    <div className="rel-exec__body">
      <div className="rel-exec__compare">
        <div className="rel-subhead">
          <div>
            <h3 className="rel-subhead__title">{activeNet ? `Resultado do ${PLAT_LABELS[activeNet]}` : 'Comparativo por rede'}</h3>
            <p className="ds-hint">{activeNet ? 'Alcance, audiência e eficiência desta rede.' : 'Alcance, audiência e eficiência do conteúdo.'}</p>
          </div>
          <span className="ds-badge" data-tone="outline">{totalContent} conteúdos</span>
        </div>
        <div className="ds-scrollx"><table className="ds-datatable ds-datatable--stack rel-exec__table">
          <thead><tr>
            <th scope="col">Rede</th><th scope="col" className="ds-cellnum">Conteúdos</th><th scope="col" className="ds-cellnum">Alcance</th><th scope="col" className="ds-cellnum">Audiência</th><th scope="col" className="ds-cellnum">Interações</th><th scope="col" className="ds-cellnum">Taxa</th>
            {onSelectNetwork && !activeNet && <th scope="col"><span className="ds-sr-only">Abrir rede</span></th>}
          </tr></thead>
          <tbody>{stats.map(item => <tr key={item.platform}>
            <th scope="row"><span className="ds-cellname"><NetworkGlyph network={item.platform} size={16} />{PLAT_LABELS[item.platform]}</span></th>
            <td className="ds-cellnum" data-label="Conteúdos">{item.content || '—'}</td>
            <td className="ds-cellnum" data-label="Alcance">{item.reach == null ? '—' : fmtNum(item.reach)}</td>
            <td className="ds-cellnum" data-label="Audiência">{item.audience == null ? '—' : fmtNum(item.audience)}</td>
            <td className="ds-cellnum" data-label="Interações">{item.interactions == null ? '—' : fmtNum(item.interactions)}</td>
            <td className="ds-cellnum" data-label="Taxa">{formatRate(item.rate)}</td>
            {onSelectNetwork && !activeNet && <td className="rel-exec__go"><button type="button" className="ds-go" onClick={() => onSelectNetwork(item.platform)} aria-label={`Ver rede ${PLAT_LABELS[item.platform]}`}>Ver rede<Icon name="arrow" size={16} /></button></td>}
          </tr>)}</tbody>
        </table></div>
      </div>

      <div className="rel-standout">
        <p className="ds-eyebrow">Destaque do período</p>
        {bestContent
          ? <>
            <p className="rel-standout__net"><NetworkGlyph network={bestContent.platform} size={16} />{PLAT_LABELS[bestContent.platform]}</p>
            <p className="rel-standout__title">{bestContent.text || bestContent.title || 'Conteúdo sem descrição'}</p>
            <p className="ds-meta">{bestContent.publishedAt ? new Date(bestContent.publishedAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Data não informada'}</p>
            <ul className="rel-standout__metrics">
              <li><Icon name="heart" size={16} /><span className="ds-sr-only">Curtidas:</span>{fmtNum(metricNumber(bestContent.metrics, 'likes'))}</li>
              <li><Icon name="comment" size={16} /><span className="ds-sr-only">Comentários:</span>{fmtNum(metricNumber(bestContent.metrics, 'comments'))}</li>
              <li><Icon name="share" size={16} /><span className="ds-sr-only">Compartilhamentos:</span>{fmtNum(metricNumber(bestContent.metrics, 'shares'))}</li>
              <li><Icon name="bookmark" size={16} /><span className="ds-sr-only">Salvamentos:</span>{fmtNum(metricNumber(bestContent.metrics, 'saves'))}</li>
            </ul>
          </>
          : <p className="ds-hint">Ainda não há dados de conteúdo suficientes para destacar uma publicação.</p>}
        {bestNetworkNote}
      </div>

      {recommendedActions.length > 0 && <div className="rel-steps">
        <h3 className="rel-subhead__title">Próximos passos recomendados</h3>
        <ol className="rel-steps__list">{recommendedActions.map(action => <li key={action}>{action}</li>)}</ol>
      </div>}
    </div>

  </section>
}
