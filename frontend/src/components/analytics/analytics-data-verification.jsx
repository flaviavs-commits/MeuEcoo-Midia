import { filterTikTokVideosByPeriod, NETWORK_ORDER, PLAT_LABELS } from '../../lib/analytics-format.js'
import { Icon, NetworkGlyph } from '../ui/icon.jsx'

const STATUS_ICONS = { verified: 'checkCircle', partial: 'alertTriangle', no_data: 'info' }
const STATUS_TONES = { verified: 'ok', partial: 'warning', no_data: 'muted' }

function numericOrNull(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function periodLabel(period) {
  if (!period?.since || !period?.until) return `${period?.days || 'período selecionado'} dias`
  const format = value => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR')
  return `${format(period.since)} a ${format(period.until)}`
}

function platformEntries(verification, activeNet = null) {
  return NETWORK_ORDER
    .filter(platform => !activeNet || platform === activeNet)
    .map(platform => [platform, verification?.platforms?.[platform]])
    .filter(([, item]) => item && (item.content?.total || item.accounts?.connected || item.status === 'verified'))
}

function hasVideoMetric(video) {
  return ['viewCount', 'likeCount', 'commentCount', 'shareCount'].some(key => video?.[key] != null && Number.isFinite(Number(video[key])))
}

function withTikTokVideoCoverage(verification, tiktokVideos, periodDays, activeNet) {
  if (activeNet !== 'tiktok' || !Array.isArray(tiktokVideos) || !tiktokVideos.length) return verification
  const videos = filterTikTokVideosByPeriod(tiktokVideos, periodDays)
  if (!videos.length) return verification
  const withData = videos.filter(hasVideoMetric).length
  const status = withData === videos.length ? 'verified' : withData ? 'partial' : 'no_data'
  const platform = verification.platforms?.tiktok || {}
  return {
    ...verification,
    platforms: {
      ...verification.platforms,
      tiktok: {
        ...platform,
        status,
        label: status === 'verified' ? 'Dados verificados' : status === 'partial' ? 'Dados parciais' : 'Sem dados no período',
        description: withData
          ? 'Os números dos vídeos vieram do catálogo real sincronizado pelo TikTok/Zernio.'
          : 'Os vídeos foram encontrados, mas a rede não confirmou métricas para este período.',
        content: {
          total: videos.length,
          withData,
          withoutData: videos.length - withData,
          coveragePercent: Math.round(withData / videos.length * 100),
        },
      },
    },
  }
}

export function AnalyticsDataVerification({ verification, activeNet = null, sourceErrors = [], tiktokVideos = [], periodDays = 7 }) {
  if (!verification) return null

  const scopedVerification = withTikTokVideoCoverage(verification, tiktokVideos, periodDays, activeNet)
  const selected = activeNet ? scopedVerification.platforms?.[activeNet] : null
  const content = selected?.content || verification.coverage?.content || {}
  const entries = platformEntries(scopedVerification, activeNet)
  const status = selected?.status || scopedVerification.overall?.status || 'no_data'
  const label = selected?.label || scopedVerification.overall?.label || 'Status dos dados'
  const description = selected?.description || verification.overall?.description
  const coveragePercent = content.percent ?? content.coveragePercent
  const contentWithData = numericOrNull(content.withData)
  const contentTotal = numericOrNull(content.total)
  const contentWithoutData = numericOrNull(content.withoutData)
  const visibleSourceErrors = sourceErrors.filter(issue => !activeNet || String(issue.source || '').toLowerCase().includes(String(PLAT_LABELS[activeNet] || activeNet).toLowerCase()))

  return <section className="ds-block rel-verify" data-status={status} aria-labelledby="analytics-data-verification-title">
    <div className="ds-head">
      <div className="ds-head__text">
        <p className="ds-eyebrow">Conferência dos dados</p>
        <div className="rel-verify__title">
          <span className="rel-verify__mark" aria-hidden="true"><Icon name={STATUS_ICONS[status] || 'info'} /></span>
          <h2 className="ds-head__title" id="analytics-data-verification-title">{label}{activeNet ? ` · ${PLAT_LABELS[activeNet] || activeNet}` : ''}</h2>
        </div>
        {description && <p className="ds-head__desc">{description}</p>}
      </div>
      <span className="ds-badge" data-tone="outline">{periodLabel(verification.period)}</span>
    </div>
    {visibleSourceErrors.length > 0 && <div className="ds-alert rel-verify__alert" data-tone="warning" role="status">
      <Icon name="alertTriangle" className="ds-alert__icon" />
      <p className="ds-alert__text"><strong>Também não foi possível conferir:</strong> {visibleSourceErrors.map(issue => `${issue.source}: ${issue.message}`).join(' · ')}</p>
    </div>}

    <div className="ds-stats rel-verify__facts" style={{ '--cols': 3 }}>
      <div className="ds-stat"><p className="ds-stat__label">Cobertura de publicações</p><p className="ds-stat__value ds-stat__value--sm">{coveragePercent == null ? '—' : `${coveragePercent}%`}</p><p className="ds-stat__caption">{contentWithData == null ? '—' : contentWithData} de {contentTotal == null ? '—' : contentTotal} com métrica confirmada</p></div>
      <div className="ds-stat"><p className="ds-stat__label">Sem métrica confirmada</p><p className="ds-stat__value ds-stat__value--sm">{contentWithoutData == null ? '—' : contentWithoutData}</p><p className="ds-stat__caption">Não entram como zero no cálculo.</p></div>
      <div className="ds-stat"><p className="ds-stat__label">Redes com fonte</p><p className="ds-stat__value ds-stat__value--sm">{entries.length}</p><p className="ds-stat__caption">API conectada ou histórico local.</p></div>
    </div>

    {entries.length > 0 && <ul className="rel-verify__nets">
      {entries.map(([platform, item]) => <li className="rel-verify__net" key={platform}>
        <p className="rel-verify__netname"><NetworkGlyph network={platform} size={16} />{PLAT_LABELS[platform] || platform}</p>
        <span className="ds-status" data-status={STATUS_TONES[item.status] || 'muted'}><Icon name={STATUS_ICONS[item.status] || 'info'} />{item.label}</span>
        {item.description && <p className="ds-hint">{item.description}</p>}
        <p className="ds-meta">{item.content?.total != null ? `${item.content.withData == null ? '—' : item.content.withData}/${item.content.total} publicações com dado` : `${item.accounts?.withAnalytics == null ? '—' : item.accounts.withAnalytics} conta(s) com analytics`}</p>
      </li>)}
    </ul>}

    <details className="ds-disclosure rel-explain">
      <summary>Como interpretar esta conferência?<Icon name="chevronDown" className="ds-disclosure__chev" /></summary>
      <div className="ds-disclosure__body rel-explain__body">
        <p><strong>Dados verificados</strong> significa que a rede respondeu ou que o valor veio de um snapshot local identificado. <strong>Dados parciais</strong> significa que parte das publicações ou consultas não respondeu.</p>
        <p>“—” significa que não existe valor confirmado para aquele indicador. Isso é diferente de zero: zero é um resultado informado pela rede.</p>
        <p>Visualizações são reproduções e podem contar a mesma pessoa mais de uma vez. Seguidores e inscritos são totais por rede, não pessoas únicas.</p>
      </div>
    </details>
  </section>
}
