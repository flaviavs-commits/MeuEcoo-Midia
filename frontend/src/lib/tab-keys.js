// Setas, Home e End movem entre abas (padrão ARIA de tablist).
export function handleTabKeys(event, items, current, setCurrent, idPrefix) {
  const index = items.indexOf(current)
  const next = event.key === 'ArrowRight' ? items[(index + 1) % items.length]
    : event.key === 'ArrowLeft' ? items[(index - 1 + items.length) % items.length]
      : event.key === 'Home' ? items[0]
        : event.key === 'End' ? items[items.length - 1]
          : null
  if (!next) return
  event.preventDefault()
  setCurrent(next)
  document.getElementById(`${idPrefix}${next}`)?.focus()
}
