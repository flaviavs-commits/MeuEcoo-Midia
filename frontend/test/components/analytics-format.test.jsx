import { chartLabel, detectNetworks, filterTikTokVideosByPeriod, fmtNum, formatDataBR, formatDataDelay, labelForMetric } from '../../src/lib/analytics-format.js'

describe('analytics formatting helpers', () => {
  it('uses labels that explain common provider metrics', () => {
    expect(labelForMetric('views')).toBe('Visualizações')
    expect(labelForMetric('page_follows')).toBe('Novos seguidores')
    expect(labelForMetric('watchTimeSeconds')).toBe('Tempo médio assistido')
  })

  it('filters TikTok videos using the selected period', () => {
    const now = Math.floor(Date.now() / 1000)
    const recent = { createTime: now, title: 'Recente' }
    const old = { createTime: now - (10 * 86400), title: 'Antigo' }

    expect(filterTikTokVideosByPeriod([recent, old], 7)).toEqual([recent])
  })

  it('keeps a connected network available when its metrics are temporarily empty', () => {
    expect(detectNetworks({ accounts: [{ platform: 'tiktok' }] })).toEqual(['tiktok'])
  })

  it('limits metric values to one decimal without exposing floating-point noise', () => {
    expect(fmtNum(2.666666666666665)).toBe('2.6')
    expect(fmtNum(28)).toBe('28')
    expect(fmtNum(2666.6666666666665)).toBe('2.6k')
  })

  it('names a chart with its values, or a summary when there are many points', () => {
    expect(chartLabel('Seguidores', { labels: ['01/09', '02/09', '03/09'], datasets: [{ label: 'Seguidores', data: [1200, null, 1500] }] }))
      .toBe('Seguidores. Seguidores: 01/09 1.2k, 03/09 1.5k')
    const labels = Array.from({ length: 10 }, (_, index) => `${index + 1}/09`)
    expect(chartLabel('Views', { labels, datasets: [{ label: 'Views', data: [5, 9, 30, 7, 6, 5, 4, 3, 2, 8] }, { label: 'Curtidas', data: [] }] }))
      .toBe('Views. Views: 10 pontos, de 5 em 1/09 a 8 em 10/09; máximo de 30 em 3/09. Curtidas: sem dados')
  })

  it('translates profile metrics and formats report dates in Brazilian Portuguese', () => {
    expect(labelForMetric('total_interactions')).toBe('Interações totais')
    expect(labelForMetric('accounts_engaged')).toBe('Contas engajadas')
    expect(labelForMetric('profile_links_taps')).toBe('Cliques em links do perfil')
    expect(formatDataBR('2026-08-31')).toBe('31/08/2026')
    expect(formatDataDelay('Data may be delayed up to 48 hours')).toBe('Os dados podem atrasar até 48 horas')
  })
})
