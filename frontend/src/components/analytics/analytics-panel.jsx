import { NET_TABS, PLAT_LABELS, TAB_HELP } from '../../lib/analytics-format.js'
import { NetworkGlyph } from '../ui/icon.jsx'
import { AnalyticsCards } from './analytics-cards.jsx'
import { AnalyticsChart } from './analytics-chart.jsx'
import { AnalyticsDemographics } from './analytics-demographics.jsx'
import { AnalyticsPostsList } from './analytics-posts-list.jsx'
import { AnalyticsAccountInsights } from './analytics-account-insights.jsx'

export function AnalyticsPanel({ net, tab, onSelectTab, data, tiktokVideos, periodDays, lastUpdated, reportAccountId = null }) {
  const tabs = NET_TABS[net] || []
  const selectedTab = tabs.some(item => item.key === tab) ? tab : tabs[0]?.key || 'community'
  const tabDescription = TAB_HELP[selectedTab] || ''
  const listTab = selectedTab === 'posts' || selectedTab === 'videos'
  // Mesma regra do AnalyticsChart: na aba Comunidade, Instagram, TikTok e
  // YouTube mostram a evolução da audiência; o título descreve o que é plotado.
  const growthChart = selectedTab === 'growth' || (selectedTab === 'community' && net !== 'facebook')
  const chartTitle = growthChart ? 'Evolução da audiência' : selectedTab === 'community' ? 'Reações por publicação' : 'Desempenho por publicação'
  const chartDescription = growthChart
    ? 'Observe se sua base de seguidores ou inscritos está crescendo.'
    : selectedTab === 'community'
      ? 'Veja como a audiência reagiu a cada conteúdo publicado.'
      : 'Compare os resultados de cada conteúdo para encontrar os melhores formatos.'
  const tabKeys = tabs.map(item => item.key)

  function onTabKeyDown(event) {
    const index = tabKeys.indexOf(selectedTab)
    const next = event.key === 'ArrowRight' ? tabKeys[(index + 1) % tabKeys.length]
      : event.key === 'ArrowLeft' ? tabKeys[(index - 1 + tabKeys.length) % tabKeys.length]
        : event.key === 'Home' ? tabKeys[0]
          : event.key === 'End' ? tabKeys[tabKeys.length - 1]
            : null
    if (!next) return
    event.preventDefault()
    onSelectTab(next)
    document.getElementById(`rel-tab-${next}`)?.focus()
  }

  return (
    <section className="ds-block rel-net" aria-labelledby="rel-net-title">
      <div className="rel-net__head">
        <div className="rel-net__id">
          <span className="ds-icontile" aria-hidden="true"><NetworkGlyph network={net} size={22} /></span>
          <div>
            <p className="ds-eyebrow">Relatório da rede</p>
            <h2 className="ds-head__title rel-focustitle" id="rel-net-title" tabIndex={-1}>{PLAT_LABELS[net]}</h2>
          </div>
        </div>
        {lastUpdated && <span className="ds-meta">Atualizado às {lastUpdated.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}</span>}
      </div>

      <div className="ds-tabs rel-tabs" role="tablist" aria-label={`Visões de analytics do ${PLAT_LABELS[net]}`} onKeyDown={onTabKeyDown}>
        {tabs.map(t => (
          <button
            key={t.key}
            id={`rel-tab-${t.key}`}
            type="button"
            role="tab"
            aria-selected={t.key === selectedTab}
            aria-controls="rel-tabpanel"
            tabIndex={t.key === selectedTab ? 0 : -1}
            className="ds-tab"
            onClick={() => onSelectTab(t.key)}
          >{t.label}</button>
        ))}
      </div>

      <div className="rel-tabpanel" id="rel-tabpanel" role="tabpanel" aria-labelledby={`rel-tab-${selectedTab}`}>
        <p className="ds-hint">{tabDescription}</p>

        <AnalyticsCards net={net} tab={selectedTab} data={data} tiktokVideos={tiktokVideos} periodDays={periodDays} />

        <section className="rel-chart rel-chart--panel" aria-labelledby="analytics-network-chart-title">
          <div className="rel-chart__head">
            <h3 className="rel-chart__title" id="analytics-network-chart-title">{chartTitle}</h3>
            <p className="ds-hint">{chartDescription}</p>
          </div>
          <AnalyticsChart net={net} tab={selectedTab} data={data} tiktokVideos={tiktokVideos} periodDays={periodDays} title={`${chartTitle} — ${PLAT_LABELS[net]}`} />
        </section>

        <AnalyticsDemographics net={net} tab={selectedTab} data={data} />

        {reportAccountId != null && <AnalyticsAccountInsights net={net} data={data} accountId={reportAccountId} />}

        {listTab && <section className="rel-posts" aria-labelledby="analytics-content-list-title">
          <div className="rel-subhead">
            <div>
              <h3 className="rel-subhead__title" id="analytics-content-list-title">Conteúdos publicados</h3>
              <p className="ds-hint">Use esta lista para identificar quais conteúdos merecem ser repetidos ou melhorados.</p>
            </div>
          </div>
          <AnalyticsPostsList net={net} tab={selectedTab} data={data} tiktokVideos={tiktokVideos} periodDays={periodDays} />
        </section>}
      </div>
    </section>
  )
}
