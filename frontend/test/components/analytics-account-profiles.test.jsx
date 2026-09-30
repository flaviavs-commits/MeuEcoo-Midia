import { render, screen, within } from '@testing-library/react'
import { AnalyticsAccountProfiles } from '../../src/components/analytics/analytics-account-profiles.jsx'

const account = { id: 7, platform: 'instagram', handle: 'ecoomidia', tokens: [{ status: 'valid', accountName: 'Ecoo Mídia' }] }

function dataWith(metrics) {
  return {
    instagramFollowers: {},
    tiktokStats: {},
    youtubeSubscribers: {},
    accountAnalytics: { platforms: { instagram: [{ localAccountId: 7, totals: { metrics } }] }, followerStats: { accounts: [] } },
  }
}

function metricOf(label) {
  const list = screen.getByText(label).closest('div')
  return within(list).getByRole('definition').textContent
}

describe('AnalyticsAccountProfiles', () => {
  it('não soma de novo itens que já estão no total de interações do Instagram', () => {
    render(<AnalyticsAccountProfiles
      accounts={[account]}
      data={dataWith({ total_interactions: 100, likes: 60, comments: 20, shares: 10, saves: 10, reach: 50, views: 80 })}
      tiktokVideos={[]}
      periodDays={7}
      onSelectNetwork={vi.fn()}
    />)

    expect(metricOf('Interações')).toBe('100')
    // Alcance (pessoas) e visualizações (reproduções) não são somados.
    expect(metricOf('Alcance / views')).toBe('50')
  })

  it('usa a soma dos itens quando a rede não informa o total', () => {
    render(<AnalyticsAccountProfiles
      accounts={[account]}
      data={dataWith({ likes: 60, comments: 20, shares: 10, saves: 10, views: 80 })}
      tiktokVideos={[]}
      periodDays={7}
      onSelectNetwork={vi.fn()}
    />)

    expect(metricOf('Interações')).toBe('100')
    expect(metricOf('Alcance / views')).toBe('80')
    expect(screen.getByRole('button', { name: 'Ver relatório de Ecoo Mídia' })).toBeInTheDocument()
  })
})
