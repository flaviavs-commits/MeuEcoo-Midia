import { Icon, NetworkGlyph } from '../ui/icon.jsx'
import { latestOf, NETWORK_ORDER, PLAT_LABELS, fmtNum } from '../../lib/analytics-format.js'

function metricValue(profile, name) {
  const entry = profile?.totals?.metrics?.[name] ?? profile?.metrics?.[name]
  const value = entry?.total ?? entry
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function sumMetrics(profile, names) {
  const values = names.map(name => metricValue(profile, name)).filter(value => value != null)
  return values.length ? values.reduce((total, value) => total + value, 0) : null
}

function firstMetric(profile, names) {
  for (const name of names) {
    const value = metricValue(profile, name)
    if (value != null) return value
  }
  return null
}

function tiktokMetricTotal(tiktokVideos, accountId, names) {
  const values = tiktokVideos
    .filter(video => String(video.accountId) === String(accountId))
    .flatMap(video => names.map(name => Number(video[name])).filter(Number.isFinite))
  return values.length ? values.reduce((total, value) => total + value, 0) : null
}

function profileFor(data, account) {
  const profiles = data.accountAnalytics?.platforms?.[account.platform] || []
  const matchingProfile = profiles.find(profile => String(profile.localAccountId) === String(account.id))
  return matchingProfile || (profiles.length === 1 ? profiles[0] : null)
}

function audienceFor(data, account, profile, accountCount) {
  const follower = (data.accountAnalytics?.followerStats?.accounts || []).find(item => String(item.localAccountId || item.accountId) === String(account.id))
  if (follower?.currentFollowers != null && Number.isFinite(Number(follower.currentFollowers))) return Number(follower.currentFollowers)

  const legacy = account.platform === 'instagram'
    ? latestOf(data.instagramFollowers)
    : account.platform === 'tiktok'
      ? latestOf(data.tiktokStats)
      : account.platform === 'youtube'
        ? latestOf(data.youtubeSubscribers)
        : null
  if (legacy && accountCount === 1) {
    const value = Number(legacy.followerCount ?? legacy.subscriberCount)
    return Number.isFinite(value) ? value : null
  }
  return metricValue(profile, account.platform === 'tiktok' ? 'follower_count' : account.platform === 'facebook' ? 'page_follows' : 'subscriberCount')
}

function reachFor(account, profile, tiktokVideos) {
  if (account.platform === 'facebook') return sumMetrics(profile, ['page_media_view', 'page_video_views'])
  // Alcance (pessoas únicas) e visualizações (reproduções) não podem ser somados.
  if (account.platform === 'instagram') return firstMetric(profile, ['reach', 'views'])
  if (account.platform === 'youtube') return metricValue(profile, 'views')
  return tiktokMetricTotal(tiktokVideos, account.id, ['viewCount']) ?? metricValue(profile, 'views')
}

function interactionsFor(account, profile, tiktokVideos) {
  if (account.platform === 'facebook') return metricValue(profile, 'page_post_engagements')
  // total_interactions já inclui curtidas, comentários, compartilhamentos e
  // salvamentos; a soma dos itens só entra quando a rede não informa o total.
  if (account.platform === 'instagram') return metricValue(profile, 'total_interactions') ?? sumMetrics(profile, ['likes', 'comments', 'shares', 'saves'])
  if (account.platform === 'youtube') return sumMetrics(profile, ['likes', 'comments', 'shares'])
  return tiktokMetricTotal(tiktokVideos, account.id, ['likeCount', 'commentCount', 'shareCount']) ?? metricValue(profile, 'likes_count')
}

function accountStatus(account, profile) {
  const statuses = (account.tokens || []).map(token => token.status).filter(Boolean)
  if (statuses.includes('expired') || statuses.includes('error')) return { label: 'Atenção necessária', className: 'is-warning' }
  if (!statuses.length) return { label: 'Sem token ativo', className: 'is-warning' }
  if (profile?.errors?.length && !profile.totals && !profile.metrics) return { label: 'Analytics indisponível', className: 'is-warning' }
  return { label: 'Conectado', className: 'is-ready' }
}

function profileName(account) {
  const tokenName = (account.tokens || []).map(token => token.accountName).find(Boolean)
  return tokenName || account.handle || `Conta ${PLAT_LABELS[account.platform] || account.platform}`
}

export function AnalyticsAccountProfiles({ accounts, data, tiktokVideos, periodDays, onSelectNetwork, activeNet = null }) {
  const scopedAccounts = activeNet ? accounts.filter(account => account.platform === activeNet) : accounts
  const orderedAccounts = [...scopedAccounts].sort((a, b) => NETWORK_ORDER.indexOf(a.platform) - NETWORK_ORDER.indexOf(b.platform))
  if (!orderedAccounts.length) return null

  return <section className="ds-block rel-profiles" aria-labelledby="analytics-profiles-title">
    <div className="ds-head">
      <div className="ds-head__text">
        <p className="ds-eyebrow">Perfis conectados</p>
        <h2 className="ds-head__title" id="analytics-profiles-title">{activeNet ? `Perfil conectado do ${PLAT_LABELS[activeNet]}` : 'Sua operação em cada rede'}</h2>
        <p className="ds-head__desc">{activeNet ? 'Identidade, saúde da conexão e resultados somente desta rede.' : 'Identidade, saúde da conexão e os principais resultados por conta.'}</p>
      </div>
      <span className="ds-badge" data-tone="outline">Últimos {periodDays} dias</span>
    </div>
    <ul className="rel-profiles__list">
      {orderedAccounts.map(account => {
        const profile = profileFor(data, account)
        const status = accountStatus(account, profile)
        const audienceLabel = account.platform === 'youtube' ? 'Inscritos' : 'Seguidores'
        const accountCount = orderedAccounts.filter(item => item.platform === account.platform).length
        const name = profileName(account)
        const ready = status.className === 'is-ready'
        return <li className="rel-profile" key={account.id}>
          <div className="rel-profile__id">
            <span className="rel-profile__avatar">{account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : <NetworkGlyph network={account.platform} size={20} />}</span>
            <div className="rel-profile__name">
              <p className="rel-profile__title">{name}</p>
              <p className="ds-meta rel-profile__handle" id={`rel-profile-${account.id}`}>
                <NetworkGlyph network={account.platform} size={14} />
                {account.handle
                  ? <><span className="ds-sr-only">{PLAT_LABELS[account.platform] || account.platform}:</span> {account.handle.startsWith('@') ? account.handle : `@${account.handle}`}</>
                  : PLAT_LABELS[account.platform]}
              </p>
            </div>
          </div>
          <span className="ds-status" data-status={ready ? 'ok' : 'warning'}><Icon name={ready ? 'checkCircle' : 'alertTriangle'} />{status.label}</span>
          <dl className="rel-profile__metrics">
            <div><dt>{audienceLabel}</dt><dd>{fmtNum(audienceFor(data, account, profile, accountCount))}</dd></div>
            <div><dt>Alcance / views</dt><dd>{fmtNum(reachFor(account, profile, tiktokVideos))}</dd></div>
            <div><dt>Interações</dt><dd>{fmtNum(interactionsFor(account, profile, tiktokVideos))}</dd></div>
          </dl>
          <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm rel-profile__go" onClick={() => onSelectNetwork(account.platform, account.id)} aria-label={`Ver relatório de ${name}`} aria-describedby={`rel-profile-${account.id}`}>Ver relatório<Icon name="arrow" size={16} /></button>
        </li>
      })}
    </ul>
  </section>
}
