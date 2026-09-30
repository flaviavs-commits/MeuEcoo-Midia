import { Bar, Doughnut } from 'react-chartjs-2'
import { topN, baseChartOptions, chartThemeColors, DEMO_COLORS, GENDER_COLORS, fmtNum, vizColors, PLAT_LABELS, chartLabel } from '../../lib/analytics-format.js'
import { useTheme } from '../ui/theme-selector.jsx'

const AGE_ORDER = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+']

function genderLabel(value) {
  const key = String(value || '').toLowerCase()
  if (['m', 'male', 'homem', 'masculino'].includes(key)) return 'Homem'
  if (['f', 'female', 'woman', 'mulher', 'feminino'].includes(key)) return 'Mulher'
  if (['user_specified', 'other', 'outro', 'unknown', 'unspecified'].includes(key)) return 'Outro / não informado'
  return String(value || 'Não informado')
}

function ageLabel(value) {
  const raw = String(value || '').replace(/^age/i, '').replaceAll('–', '-')
  if (raw === '65-' || raw === '65+') return '65+ anos'
  if (/^\d{1,3}-\d{1,3}$/.test(raw)) return `${raw.replace('-', '–')} anos`
  return raw ? `${raw} anos` : 'Faixa não informada'
}

function ageKey(value) {
  const raw = String(value || '').replace(/^age/i, '').replaceAll('–', '-')
  return raw === '65-' ? '65+' : raw
}

function flattenValues(value, path = []) {
  if (value == null) return []
  if (typeof value === 'number' && Number.isFinite(value)) return [{ path, value }]
  if (Array.isArray(value)) {
    return value.flatMap(item => {
      if (item && typeof item === 'object' && item.value != null) {
        const dimensions = Array.isArray(item.dimensionValues)
          ? item.dimensionValues
          : [item.age, item.gender, item.country, item.city, item.label].filter(Boolean)
        return [{ path: [...path, ...dimensions], value: Number(item.value) }]
      }
      return flattenValues(item, path)
    }).filter(row => Number.isFinite(row.value))
  }
  if (typeof value !== 'object') return []
  if (value.value != null && Number.isFinite(Number(value.value))) return [{ path, value: Number(value.value) }]
  const nested = value.results || value.breakdowns
  if (nested) return flattenValues(nested, path)
  return Object.entries(value).flatMap(([key, child]) => flattenValues(child, [...path, key]))
}

function rowsFromSource(source) {
  if (!source) return { ageGender: [], age: [], gender: [], country: [] }
  const ageGender = Array.isArray(source.ageGender)
    ? source.ageGender.map(item => ({ age: item.age, gender: item.gender, value: Number(item.value) })).filter(item => Number.isFinite(item.value))
    : []
  const age = Array.isArray(source.age)
    ? source.age.map(item => ({ age: item.dimension ?? item.label ?? item.age, value: Number(item.value) })).filter(item => item.age != null && Number.isFinite(item.value))
    : []
  const gender = Array.isArray(source.gender)
    ? source.gender.map(item => ({ gender: item.dimension ?? item.label ?? item.gender, value: Number(item.value) })).filter(item => item.gender != null && Number.isFinite(item.value))
    : []
  const country = Array.isArray(source.country)
    ? source.country.map(item => ({ country: item.dimension ?? item.label ?? item.country, value: Number(item.value) })).filter(item => item.country != null && Number.isFinite(item.value))
    : []
  if (ageGender.length || age.length || gender.length || country.length) return { ageGender, age, gender, country }

  const rows = flattenValues(source)
  const ages = rows.filter(row => row.path.some(value => /^age?\d|^\d{1,3}[-–]\d{1,3}$|^\d{2,3}\+?$/.test(String(value).toLowerCase())))
  const genders = rows.filter(row => row.path.some(value => /^(m|f|male|female|man|woman|homem|mulher|masculino|feminino|user_specified|other)$/i.test(String(value))))
  const ageGenderRows = ages.filter(ageRow => {
    const age = ageRow.path.find(value => /^age?\d|^\d{1,3}[-–]\d{1,3}$|^\d{2,3}\+?$/.test(String(value).toLowerCase()))
    const gender = ageRow.path.find(value => /^(m|f|male|female|man|woman|homem|mulher|masculino|feminino|user_specified|other)$/i.test(String(value)))
    return age && gender
  }).map(row => ({
    age: row.path.find(value => /^age?\d|^\d{1,3}[-–]\d{1,3}$|^\d{2,3}\+?$/.test(String(value).toLowerCase())),
    gender: row.path.find(value => /^(m|f|male|female|man|woman|homem|mulher|masculino|feminino|user_specified|other)$/i.test(String(value))),
    value: row.value
  }))
  const countryRows = rows.filter(row => !row.path.some(value => /^(age|gender|male|female|m|f|user_specified|other)$/i.test(String(value))) && row.path.length > 0)
    .map(row => ({ country: row.path.at(-1), value: row.value }))
  return { ageGender: ageGenderRows, age: [], gender: [], country: countryRows }
}

function sourceFor(data, net) {
  if (net === 'instagram' && data.instagramDemographics) {
    return { demo: data.instagramDemographics, audience: 'Seguidores da conta', source: 'Instagram Insights' }
  }
  if (net === 'youtube' && data.youtubeDemographics) {
    return { demo: data.youtubeDemographics, audience: 'Espectadores dos vídeos', source: 'YouTube Analytics' }
  }

  const accounts = data.accountAnalytics?.platforms?.[net] || []
  for (const account of accounts) {
    const demographics = account.demographics || {}
    const demo = net === 'instagram'
      ? demographics.followers || demographics.engagedAudience
      : demographics
    const rows = rowsFromSource(demo)
    if (rows.ageGender.length || rows.age.length || rows.gender.length || rows.country.length) {
      return {
        demo,
        audience: net === 'instagram' && demographics.followers ? 'Seguidores da conta' : net === 'instagram' ? 'Audiência engajada' : 'Audiência da rede',
        source: 'API oficial'
      }
    }
  }
  return null
}

function summarize(rows, key, label) {
  const totals = new Map()
  for (const row of rows) {
    const value = row[key]
    if (value == null) continue
    totals.set(value, (totals.get(value) || 0) + Number(row.value))
  }
  return [...totals.entries()].map(([value, total]) => ({ label: label(value), value: total }))
}

export function AnalyticsDemographics({ net, tab, data }) {
  useTheme()
  if (tab !== 'growth') return null
  const chartColors = chartThemeColors()
  const source = sourceFor(data, net)
  const rows = rowsFromSource(source?.demo)

  if (!source || (!rows.ageGender.length && !rows.age.length && !rows.gender.length && !rows.country.length)) {
    const text = ['instagram', 'youtube'].includes(net)
      ? `O ${PLAT_LABELS[net] || net} não informou idade, gênero ou país desta audiência até agora.`
      : `A API oficial do ${net === 'tiktok' ? 'TikTok' : 'Facebook'} conectada ao app não fornece sexo e faixa etária para esta conta.`
    return <section className="rel-demo rel-demo--none" aria-label="Demografia da audiência">
      <h3 className="rel-subhead__title">Perfil da audiência</h3>
      <p className="ds-hint">{text}</p>
    </section>
  }

  const ageGenderTitle = net === 'instagram' ? 'Seguidores por idade e gênero' : 'Espectadores por idade e gênero'
  const ageRows = rows.age.length ? rows.age : rows.ageGender.filter(item => item.age != null)
  const genderRows = rows.gender.length ? rows.gender : rows.ageGender.filter(item => item.gender != null)
  const ageGenderRows = rows.ageGender.filter(item => item.age != null && item.gender != null)
  const faixas = [...new Set(ageRows.map(item => ageKey(item.age)))].sort((a, b) => (AGE_ORDER.indexOf(a) < 0 ? 99 : AGE_ORDER.indexOf(a)) - (AGE_ORDER.indexOf(b) < 0 ? 99 : AGE_ORDER.indexOf(b)))
  const generos = [...new Set(ageGenderRows.map(item => genderLabel(item.gender)))]
  const genderSummary = summarize(genderRows, 'gender', genderLabel)
  const ageSummary = summarize(ageRows, 'age', ageLabel)
  const geoTop = topN(rows.country.map(item => ({ label: item.country, value: item.value })), 8)
  const primary = vizColors().primary
  const ageData = {
    labels: faixas.map(ageLabel),
    datasets: ageGenderRows.length
      ? generos.map(gender => ({ label: gender, data: faixas.map(age => ageGenderRows.filter(item => ageKey(item.age) === age && genderLabel(item.gender) === gender).reduce((total, item) => total + Number(item.value), 0)), backgroundColor: GENDER_COLORS[gender] || primary, borderRadius: 4 }))
      : [{ label: 'Audiência', data: faixas.map(age => ageRows.filter(item => ageKey(item.age) === age).reduce((total, item) => total + Number(item.value), 0)), backgroundColor: primary, borderRadius: 4 }],
  }
  const geoTitle = net === 'instagram' ? 'Seguidores por país' : 'Espectadores por país'
  const geoData = { labels: geoTop.map(item => item.label), datasets: [{ data: geoTop.map(item => item.value), backgroundColor: DEMO_COLORS }] }

  return <section className="rel-demo" aria-label="Perfil da audiência">
    <div className="rel-subhead">
      <div>
        <h3 className="rel-subhead__title">Perfil da audiência</h3>
        <p className="ds-hint">Dados reais de {source.audience.toLowerCase()} · fonte: {source.source}.</p>
      </div>
      <span className="ds-badge" data-tone="outline">Não identifica pessoas individualmente</span>
    </div>
    <div className="rel-demo__sums">
      <div className="rel-demo__sum"><p className="rel-demo__label">Gênero</p>{genderSummary.length ? <ul>{genderSummary.map(item => <li key={item.label}><span>{item.label}</span><strong>{fmtNum(item.value)}</strong></li>)}</ul> : <p className="ds-hint">Sem dados disponíveis.</p>}</div>
      <div className="rel-demo__sum"><p className="rel-demo__label">Faixa etária</p>{ageSummary.length ? <ul>{ageSummary.map(item => <li key={item.label}><span>{item.label}</span><strong>{fmtNum(item.value)}</strong></li>)}</ul> : <p className="ds-hint">Sem dados disponíveis.</p>}</div>
    </div>
    <div className="rel-demo__charts">
      <figure className="rel-chart">
        <figcaption className="rel-chart__head">
          <h4 className="rel-chart__title">{ageGenderTitle}</h4>
          <p className="ds-hint">A rede agrupa a audiência em faixas; não mostra nomes ou perfis individuais.</p>
        </figcaption>
        <div className="rel-canvas">
          {ageRows.length
            ? <Bar data={ageData} options={baseChartOptions()} aria-label={chartLabel(ageGenderTitle, ageData)}/>
            : <p className="rel-empty">Sem dados disponíveis.</p>}
        </div>
      </figure>
      <figure className="rel-chart">
        <figcaption className="rel-chart__head">
          <h4 className="rel-chart__title">{geoTitle}</h4>
          <p className="ds-hint">Veja de onde vêm as pessoas da audiência informada pela rede.</p>
        </figcaption>
        <div className="rel-canvas">
          {geoTop.length
            ? <Doughnut data={geoData} aria-label={chartLabel(geoTitle, geoData)} options={{ responsive: true, maintainAspectRatio: false, color: chartColors.tick, plugins: { legend: { position: 'right', labels: { color: chartColors.tick, boxWidth: 12, font: { size: 11 } } }, tooltip: { backgroundColor: chartColors.tooltipBackground, titleColor: chartColors.tooltipText, bodyColor: chartColors.tooltipText, borderColor: chartColors.tooltipBorder, borderWidth: 1 } } }}/>
            : <p className="rel-empty">Sem dados disponíveis.</p>}
        </div>
      </figure>
    </div>
  </section>
}
