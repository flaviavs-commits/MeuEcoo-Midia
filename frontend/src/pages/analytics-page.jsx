import '../lib/chart-setup.js'
import { useEffect, useState } from 'react'
import { useAnalytics } from '../hooks/use-analytics.js'
import { AnalyticsPeriodControl, AnalyticsSummary } from '../components/analytics/analytics-summary.jsx'
import { AnalyticsSidebar } from '../components/analytics/analytics-sidebar.jsx'
import { AnalyticsPanel } from '../components/analytics/analytics-panel.jsx'
import { filterByPeriod, filterTikTokVideosByPeriod, PLAT_LABELS, fmtNum } from '../lib/analytics-format.js'
import { useToast } from '../components/ui/toast.jsx'
import { AnalyticsAccountProfiles } from '../components/analytics/analytics-account-profiles.jsx'
import { AnalyticsExecutiveOverview } from '../components/analytics/analytics-executive-overview.jsx'
import { buildPerformanceReport, performanceReportActions, performanceReportConclusion } from '../components/analytics/analytics-performance-report.jsx'
import { ReportSchedulePanel } from '../components/analytics/report-schedule-panel.jsx'
import { AnalyticsDataVerification } from '../components/analytics/analytics-data-verification.jsx'
import { Icon, NetworkGlyph } from '../components/ui/icon.jsx'
import { Sheet } from '../components/ui/floating.jsx'
import { OverflowMenu } from '../components/ui/overflow-menu.jsx'
import { useIsPhone } from '../lib/breakpoints.js'

// Quanto tempo a URL do CSV exportado continua válida depois do clique (o navegador precisa lê-la).
export const CSV_URL_LIFETIME_MS = 10_000

function csvValue(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function reportRows(data, periodDays, activeNet) {
  return filterByPeriod(data.metrics, periodDays).filter(item => !activeNet || item.platform === activeNet)
}

function hasMetricData(item) {
  return Object.values(item?.metrics || {}).some(value => value != null && Number.isFinite(Number(value)))
}

function interactionTotal(item) {
  const values = ['likes', 'comments', 'shares', 'saves']
    .map(name => item?.metrics?.[name])
    .filter(value => value != null && Number.isFinite(Number(value)))
    .map(Number)
  return values.length ? values.reduce((total, value) => total + value, 0) : null
}

function catalogReportRows(tiktokVideos, periodDays) {
  return filterTikTokVideosByPeriod(tiktokVideos, periodDays).map(video => ({
    platform: 'tiktok',
    publishedAt: video.publishedAt || (video.createTime ? new Date(Number(video.createTime) * 1000).toISOString() : null),
    text: video.title || '',
    mediaType: 'video',
    metrics: {
      views: video.viewCount,
      likes: video.likeCount,
      comments: video.commentCount,
      shares: video.shareCount,
      saves: video.saveCount,
    },
  }))
}

function outputRows(data, tiktokVideos, periodDays, activeNet) {
  const rows = reportRows(data, periodDays, activeNet)
  if (activeNet && activeNet !== 'tiktok') return rows

  const catalogRows = catalogReportRows(tiktokVideos, periodDays)
  if (!catalogRows.some(hasMetricData)) return rows
  return [...rows.filter(item => item.platform !== 'tiktok'), ...catalogRows]
}

function sumKnown(values) {
  const known = values.filter(value => value != null && Number.isFinite(Number(value)))
  return known.length ? known.reduce((total, value) => total + Number(value), 0) : null
}

function htmlValue(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

export function AnalyticsPage({ onNavigate } = {}) {
  const [comparePeriod, setComparePeriod] = useState(false)
  const [reportAccountId, setReportAccountId] = useState(null)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [revealId, setRevealId] = useState(null)
  const phone = useIsPhone()
  const {
    data, accounts, tiktokVideos, networks, activeNet, activeTab, periodDays,
    loading, error, sourceErrors, lastUpdated, setActiveTab, setPeriodDays, selectNetwork, reload,
  } = useAnalytics({ comparePeriod })
  const notify = useToast()
  // Só a primeira carga troca o conteúdo por esqueletos. Nas atualizações
  // seguintes (período, comparação, ciclo de 15 min) os dados continuam na
  // tela, com um aviso de atualização, para não fechar detalhes nem modais.
  const firstLoad = loading && !hasLoaded

  useEffect(() => { if (!loading) setHasLoaded(true) }, [loading])
  // O botão usado para escolher a rede some com a troca (a lista vira o painel
  // da rede, que fica mais acima): rola até o que apareceu e leva o foco ao
  // título, para o teclado e o leitor de tela não ficarem no vazio.
  useEffect(() => {
    if (!revealId) return
    setRevealId(null)
    const title = document.getElementById(revealId) || document.getElementById('rel-net-title')
    if (!title) return
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    title.closest('section')?.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    title.focus({ preventScroll: true })
  }, [revealId])

  function chooseNetwork(net) {
    setReportAccountId(null)
    selectNetwork(net)
  }

  function revealNetwork(net) {
    chooseNetwork(net)
    setRevealId(net === 'all' ? 'analytics-all-network-title' : 'rel-net-title')
  }

  function selectPeriod(days) {
    setPeriodDays(days)
    if (days > 30) setComparePeriod(false)
  }
  const selectedPlatform = activeNet === 'all' ? null : activeNet
  const selectedRows = reportRows(data, periodDays, selectedPlatform)
  const selectedTikTokVideos = filterTikTokVideosByPeriod(tiktokVideos, periodDays)
  const selectedTikTokRows = selectedTikTokVideos.map(video => ({ metrics: {
    views: video.viewCount,
    likes: video.likeCount,
    comments: video.commentCount,
    shares: video.shareCount,
  } }))
  const useTikTokCatalog = selectedTikTokRows.some(hasMetricData)
  const selectedContentRows = useTikTokCatalog && (!selectedPlatform || selectedPlatform === 'tiktok')
    ? [
        ...selectedRows.filter(item => item.platform !== 'tiktok'),
        ...selectedTikTokRows,
      ]
    : selectedRows
  const selectedViews = sumKnown(selectedContentRows.map(item => item.metrics?.views))
  const selectedEngagement = sumKnown(selectedContentRows.map(item => sumKnown([
    item.metrics?.likes,
    item.metrics?.comments,
    item.metrics?.shares,
  ])))
  const performanceReport = buildPerformanceReport(data, tiktokVideos, periodDays, selectedPlatform)

  function openAccountReport(platform, accountId) {
    setReportAccountId(accountId)
    selectNetwork(platform)
    setRevealId('analytics-account-report-title')
  }

  function exportReport() {
    const rows = outputRows(data, tiktokVideos, periodDays, selectedPlatform)
    const header = ['Data', 'Rede', 'Publicação', 'Visualizações', 'Curtidas', 'Comentários', 'Compartilhamentos', 'Salvamentos']
    const lines = rows.map(item => [
      item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('pt-BR') : '',
      PLAT_LABELS[item.platform] || item.platform,
      item.text || item.youtubeTitle || '',
      item.metrics?.views ?? '',
      item.metrics?.likes ?? '',
      item.metrics?.comments ?? '',
      item.metrics?.shares ?? '',
      item.metrics?.saves ?? '',
    ].map(csvValue).join(';'))
    const csv = `\uFEFF${[header.map(csvValue).join(';'), ...lines].join('\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `relatorio-${selectedPlatform || 'todas-as-redes'}-${periodDays}dias.csv`
    link.click()
    // Firefox e Safari leem o arquivo depois do clique; liberar a URL na mesma hora pode cancelar o download.
    window.setTimeout(() => URL.revokeObjectURL(url), CSV_URL_LIFETIME_MS)
  }

  function printReport() {
    const rows = outputRows(data, tiktokVideos, periodDays, selectedPlatform)
    const performanceReport = buildPerformanceReport(data, tiktokVideos, periodDays, selectedPlatform)
    const target = window.open('', '_blank', 'width=1000,height=800')
    if (!target) { notify('Permita pop-ups para gerar o relatório imprimível.', 'error'); return }
    const title = `Relatório ${selectedPlatform ? PLAT_LABELS[selectedPlatform] || selectedPlatform : 'todas as redes'}`
    const tableRows = rows.map(item => `<tr><td>${htmlValue(item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('pt-BR') : '')}</td><td>${htmlValue(PLAT_LABELS[item.platform] || item.platform)}</td><td>${htmlValue(item.text || item.youtubeTitle || 'Publicação')}</td><td>${item.metrics?.views ?? '—'}</td><td>${item.metrics?.likes ?? '—'}</td><td>${item.metrics?.comments ?? '—'}</td><td>${item.metrics?.shares ?? '—'}</td></tr>`).join('')
    const reportRowsHtml = performanceReport.platforms.map(item => `<tr><td>${htmlValue(PLAT_LABELS[item.platform] || item.platform)}</td><td>${item.content}</td><td>${item.views == null ? '—' : fmtNum(Math.round(item.views))}</td><td>${item.interactions == null ? '—' : fmtNum(Math.round(item.interactions))}</td><td>${item.rate == null ? '—' : `${item.rate.toFixed(1)}%`}</td></tr>`).join('')
    const bestContentRowsHtml = performanceReport.platforms.map(item => {
      const best = item.bestContent
      const metricNumber = value => {
        const normalized = value && typeof value === 'object' ? value.total : value
        const number = Number(normalized)
        return Number.isFinite(number) ? number : null
      }
      const interactions = best ? interactionTotal(best) : null
      const views = best ? metricNumber(best.metrics?.views) : null
      const title = best?.text || best?.title || best?.youtubeTitle || best?.caption || 'Nenhum post com métricas confirmadas no período.'
      return `<tr><td>${htmlValue(PLAT_LABELS[item.platform] || item.platform)}</td><td>${htmlValue(title)}</td><td>${views == null ? '—' : fmtNum(Math.round(views))}</td><td>${interactions == null ? '—' : fmtNum(Math.round(interactions))}</td></tr>`
    }).join('')
    const actionRows = performanceReportActions(performanceReport).map(action => `<li>${htmlValue(action)}</li>`).join('')
    const explainedReport = `<section class="interpretation"><h2>Desempenho explicado</h2><p>${htmlValue(performanceReportConclusion(performanceReport))}</p><div class="explanation-grid"><div><strong>Visualizações</strong><span>${performanceReport.totals.views == null ? '—' : fmtNum(Math.round(performanceReport.totals.views))}</span><small>Quantidade de vezes que o conteúdo foi visto; não representa necessariamente pessoas únicas.</small></div><div><strong>Interações</strong><span>${performanceReport.totals.interactions == null ? '—' : fmtNum(Math.round(performanceReport.totals.interactions))}</span><small>Curtidas, comentários, compartilhamentos e salvamentos disponíveis.</small></div><div><strong>Taxa de interação</strong><span>${performanceReport.totals.rate == null ? '—' : `${performanceReport.totals.rate.toFixed(1)}%`}</span><small>Interações divididas pelas visualizações, para medir a reação proporcional.</small></div><div><strong>Crescimento da audiência</strong><span>${performanceReport.totals.growth == null ? '—' : fmtNum(Math.round(performanceReport.totals.growth))}</span><small>Variação de seguidores ou inscritos no período.</small></div></div><h3>Leitura por rede</h3><table><thead><tr><th>Rede</th><th>Conteúdos</th><th>Visualizações</th><th>Interações</th><th>Taxa</th></tr></thead><tbody>${reportRowsHtml || '<tr><td colspan="5">Nenhum dado disponível.</td></tr>'}</tbody></table><h3>Melhor conteúdo por rede</h3><table><thead><tr><th>Rede</th><th>Conteúdo</th><th>Visualizações</th><th>Interações</th></tr></thead><tbody>${bestContentRowsHtml || '<tr><td colspan="4">Nenhum dado disponível.</td></tr>'}</tbody></table><h3>Próximos passos recomendados</h3><ol>${actionRows}</ol></section>`
    target.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${htmlValue(title)}</title><style>body{font-family:Arial,sans-serif;color:#20242c;margin:36px}h1{margin:0 0 6px;font-size:24px}h2{margin:0 0 8px;font-size:18px}h3{margin:20px 0 8px;font-size:13px}p{color:#616875;margin:0 0 22px;line-height:1.5}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px}.card,.explanation-grid>div{padding:12px;background:#f2f4f7;border-radius:8px}.card strong,.explanation-grid span{display:block;font-size:20px}.card span,.explanation-grid small{font-size:11px;color:#616875}.interpretation{margin:0 0 28px;padding:18px;border:1px solid #dfe3e8;border-radius:10px}.interpretation>p{margin-bottom:14px}.explanation-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.explanation-grid strong{display:block;font-size:11px;margin-bottom:5px}.explanation-grid small{display:block;margin-top:5px;line-height:1.4}.interpretation table,table{width:100%;border-collapse:collapse;font-size:11px}.interpretation th,.interpretation td,body>table th,body>table td{padding:8px;border-bottom:1px solid #dfe3e8;text-align:left}.interpretation th,th{background:#f2f4f7}.interpretation ol{margin:0;padding-left:20px;color:#616875;font-size:11px;line-height:1.6}@media print{body{margin:18px}.card,.explanation-grid>div,th{background:#f2f4f7}.interpretation{break-inside:avoid}}</style></head><body><h1>${htmlValue(title)}</h1><p>Período: últimos ${periodDays} dias · Gerado em ${htmlValue(new Date().toLocaleString('pt-BR'))}</p>${explainedReport}<h2>Publicações detalhadas</h2><table><thead><tr><th>Data</th><th>Rede</th><th>Publicação</th><th>Visualizações</th><th>Curtidas</th><th>Comentários</th><th>Compartilhamentos</th></tr></thead><tbody>${tableRows || '<tr><td colspan="7">Nenhum dado encontrado no período.</td></tr>'}</tbody></table></body></html>`)
    target.document.close()
    target.focus()
    setTimeout(() => { target.print() }, 250)
  }

  const exportDisabled = loading || !networks.length
  const networkSection = activeNet === 'all'
    ? <section className="ds-block rel-pick" aria-labelledby="analytics-all-network-title">
        <div className="ds-empty rel-pick__inner">
          <h2 className="ds-empty__title ds-empty__title--sm rel-focustitle" id="analytics-all-network-title" tabIndex={-1}>Escolha uma rede para ver o relatório detalhado</h2>
          <p className="ds-empty__text">Gráficos, publicações e crescimento aparecem para uma rede por vez.</p>
          <div className="ds-empty__actions">{networks.map(net => <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" key={net} onClick={() => revealNetwork(net)}><NetworkGlyph network={net} size={16} />{PLAT_LABELS[net] || net}</button>)}</div>
        </div>
      </section>
    : networks.includes(activeNet)
      ? <AnalyticsPanel
          net={activeNet}
          tab={activeTab}
          onSelectTab={setActiveTab}
          data={data}
          tiktokVideos={tiktokVideos}
          periodDays={periodDays}
          lastUpdated={lastUpdated}
          reportAccountId={reportAccountId}
        />
      : <section className="ds-block rel-pick" aria-labelledby="analytics-no-network-title">
          <div className="ds-empty rel-pick__inner">
            <h2 className="ds-empty__title ds-empty__title--sm" id="analytics-no-network-title">Nenhuma rede conectada</h2>
            <p className="ds-empty__text">{PLAT_LABELS[activeNet] || 'Esta rede'} ainda não tem conta conectada. Conecte uma conta para liberar o relatório desta rede.</p>
            <div className="ds-empty__actions">
              <button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={() => revealNetwork('all')}>Ver todas as redes</button>
              {onNavigate && <button type="button" className="ds-go" onClick={() => onNavigate('integracoes')}>Conectar conta<Icon name="arrow" /></button>}
            </div>
          </div>
        </section>

  return <div className="ds-page rel" data-ds-root>
    <header className="ds-pagehead rel-head">
      <div className="ds-pagehead__text">
        <p className="ds-eyebrow">Desempenho</p>
        <h1 className="ds-pagehead__title">Relatórios</h1>
        <p className="ds-pagehead__lede">Veja o que chamou atenção, quais publicações performaram melhor e como sua audiência está evoluindo.</p>
      </div>
      <div className="ds-pagehead__actions">
        <button type="button" className="ds-btn ds-btn--secondary" onClick={() => setScheduleOpen(true)}><Icon name="mail" />Relatórios por e-mail</button>
        {phone
          ? <OverflowMenu label="Exportar relatório" sheetTitle="Exportar relatório" icon="download" size="md" items={[
              { label: 'Exportar CSV', icon: 'download', onSelect: exportReport, disabled: exportDisabled },
              { label: 'Imprimir / PDF', icon: 'printer', onSelect: printReport, disabled: exportDisabled },
            ]} />
          : <>
              <button type="button" className="ds-btn ds-btn--secondary" onClick={exportReport} disabled={exportDisabled}><Icon name="download" />Exportar CSV</button>
              <button type="button" className="ds-btn ds-btn--secondary" onClick={printReport} disabled={exportDisabled}><Icon name="printer" />Imprimir / PDF</button>
            </>}
      </div>
    </header>

    <section className="rel-filters" aria-label="Filtros do relatório">
      <AnalyticsSidebar networks={networks} activeNet={activeNet} onSelect={chooseNetwork} />
      <div className="rel-filters__line">
        <AnalyticsPeriodControl periodDays={periodDays} comparePeriod={comparePeriod} onSelectPeriod={selectPeriod} onToggleCompare={setComparePeriod} />
        <div className="rel-filters__status">
          <span className="rel-sync" aria-live="polite">
            {loading
              ? <><span className="ds-spinner" aria-hidden="true" />{firstLoad ? 'Carregando métricas...' : 'Atualizando…'}</>
              : lastUpdated && `Atualizado às ${lastUpdated.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`}
          </span>
          <button type="button" className="ds-btn ds-btn--quiet ds-btn--sm" onClick={() => reload()} disabled={loading}><Icon name="refresh" size={16} />Atualizar</button>
        </div>
      </div>
      <div className="rel-snapshot" role="group" aria-label="Resumo do relatório filtrado">
        <span className="rel-snapshot__lead">No recorte</span>
        <span><strong>{firstLoad ? '—' : selectedContentRows.length}</strong> {selectedContentRows.length === 1 ? 'conteúdo' : 'conteúdos'}</span>
        <span><strong>{firstLoad ? '—' : fmtNum(selectedViews)}</strong> visualizações</span>
        <span><strong>{firstLoad ? '—' : fmtNum(selectedEngagement)}</strong> interações</span>
        <span className="ds-meta rel-snapshot__note">Base do CSV e do PDF · rede e período ficam salvos neste dispositivo</span>
      </div>
    </section>

    {error && <div className="ds-alert rel-alert" data-tone="danger" role="alert">
      <Icon name="alertCircle" className="ds-alert__icon" />
      <p className="ds-alert__text">{error}</p>
      <div className="ds-alert__actions"><button type="button" className="ds-btn ds-btn--secondary ds-btn--sm" onClick={() => reload()} disabled={loading}><Icon name="refresh" size={16} />Tentar novamente</button></div>
    </div>}

    {firstLoad
      ? <div className="rel-skeleton" aria-hidden="true">
          <div className="ds-stats" style={{ '--cols': 4 }}>{[1, 2, 3, 4].map(item => <div className="ds-stat" key={item}><span className="ds-skel ds-skel--text" style={{ width: '55%' }} /><span className="ds-skel ds-skel--figure" /></div>)}</div>
          <span className="ds-skel ds-skel--block" />
          <span className="ds-skel ds-skel--block" />
        </div>
      : !networks.length && (error || sourceErrors.length > 0)
        ? <div className="ds-empty ds-empty--center rel-nodata">
            <span className="ds-icontile ds-icontile--lg" aria-hidden="true"><Icon name="alertTriangle" /></span>
            <h2 className="ds-empty__title" id="analytics-empty-title">Não foi possível conferir suas redes agora</h2>
            <p className="ds-empty__text">Sem essa conferência o relatório não mostra números, para não exibir dados incompletos.</p>
            {sourceErrors.length > 0 && <ul className="rel-nodata__issues">{sourceErrors.map(issue => <li key={issue.source}><strong>{issue.source}:</strong> {issue.message}</li>)}</ul>}
            {!error && <div className="ds-empty__actions"><button type="button" className="ds-btn ds-btn--secondary" onClick={() => reload()} disabled={loading}><Icon name="refresh" />Tentar novamente</button></div>}
          </div>
      : !networks.length
        ? <div className="ds-empty ds-empty--center rel-nodata">
            <span className="ds-icontile ds-icontile--lg" aria-hidden="true"><Icon name="chart" /></span>
            <h2 className="ds-empty__title" id="analytics-empty-title">Ainda não há métricas para mostrar</h2>
            <p className="ds-empty__text">Conecte uma rede social e publique conteúdo para começar a acompanhar visualizações, interações e crescimento.</p>
            {onNavigate && <div className="ds-empty__actions"><button type="button" className="ds-btn ds-btn--primary" onClick={() => onNavigate('integracoes')}><Icon name="plug" />Conectar conta</button></div>}
          </div>
        : <div className="rel-content" aria-busy={loading}>
            <AnalyticsSummary
              data={data}
              tiktokVideos={tiktokVideos}
              periodDays={periodDays}
              activeNet={selectedPlatform}
              onSelectPeriod={selectPeriod}
              comparePeriod={comparePeriod}
              onToggleCompare={setComparePeriod}
              showPeriodControl={false}
            />
            {selectedPlatform && networkSection}
            <AnalyticsExecutiveOverview data={data} tiktokVideos={tiktokVideos} periodDays={periodDays} activeNet={selectedPlatform} recommendedActions={performanceReportActions(performanceReport)} onSelectNetwork={revealNetwork} />
            {accounts.length > 0 && <AnalyticsAccountProfiles accounts={accounts} data={data} tiktokVideos={tiktokVideos} periodDays={periodDays} activeNet={selectedPlatform} onSelectNetwork={openAccountReport} />}
            <AnalyticsDataVerification verification={data.verification} activeNet={selectedPlatform} sourceErrors={sourceErrors} tiktokVideos={tiktokVideos} periodDays={periodDays} />
            {!selectedPlatform && networkSection}
          </div>}

    <Sheet open={scheduleOpen} onClose={() => setScheduleOpen(false)} eyebrow="Automação" title="Relatórios por e-mail" closeLabel="Fechar relatórios por e-mail" className="rel-mailsheet">
      <ReportSchedulePanel />
    </Sheet>
  </div>
}
