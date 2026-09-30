// Quiet column chart: one series, the highest column labelled, values also exposed as text.
export function ColumnChart({ title, note, data, format = value => String(value), height = 110, tone, ariaLabel }) {
  const max = Math.max(...data.map(item => item.value), 1)
  const highlight = data.findIndex(item => item.value === max)
  return <figure className="ds-viz" role="img" aria-label={ariaLabel || title}>
    {title && <figcaption className="ds-viz__head">
      <span className="ds-viz__title">{title}</span>
      {note && <span className="ds-viz__note">{note}</span>}
    </figcaption>}
    <div className="ds-viz__cols" style={{ '--h': `${height}px` }}>
      {data.map((item, index) => {
        const percent = Math.max((item.value / max) * 100, item.value ? 3 : 1)
        return <div className="ds-viz__col" key={item.key || item.label} style={{ '--v': `${percent.toFixed(1)}%` }} title={`${item.label}: ${format(item.value)}`}>
          {index === highlight && item.value > 0 && <span className="ds-viz__val">{format(item.value)}</span>}
          <span className="ds-viz__bar" data-tone={tone} />
          <span className="ds-viz__x">{item.label}</span>
        </div>
      })}
    </div>
  </figure>
}
