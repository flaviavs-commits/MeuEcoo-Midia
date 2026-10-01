import { useEffect, useState } from 'react'
import { Icon } from './icon.jsx'

export const THEME_STORAGE_KEY = 'meu-ecoo:theme:v2'

export function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function applyTheme(theme) {
  const nextTheme = theme === 'light' ? 'light' : 'dark'
  document.documentElement.dataset.theme = nextTheme
  document.documentElement.style.colorScheme = nextTheme
  return nextTheme
}

// Troca o tema de qualquer lugar (menu da conta, folha da conta no celular):
// aplica, guarda e avisa os demais controles pelo mesmo evento global.
export function setAppTheme(theme) {
  const nextTheme = applyTheme(theme)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
  } catch {
    // A preferência continua funcionando mesmo quando o storage está indisponível.
  }
  window.dispatchEvent(new CustomEvent('meu-ecoo:themechange', { detail: nextTheme }))
  return nextTheme
}

export function useTheme() {
  const [theme, setTheme] = useState(getStoredTheme)

  useEffect(() => {
    const handleThemeChange = event => setTheme(event.detail === 'light' ? 'light' : 'dark')
    window.addEventListener('meu-ecoo:themechange', handleThemeChange)
    return () => window.removeEventListener('meu-ecoo:themechange', handleThemeChange)
  }, [])

  return theme
}

// variant="toggle": um botão que alterna claro/escuro (login, admin).
// variant="segmented": as duas opções lado a lado (menu da conta no app).
export function ThemeSelector({ variant = 'toggle' }) {
  const [theme, setTheme] = useState(getStoredTheme)

  useEffect(() => {
    const nextTheme = applyTheme(theme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    } catch {
      // A preferência continua funcionando mesmo quando o storage está indisponível.
    }
    window.dispatchEvent(new CustomEvent('meu-ecoo:themechange', { detail: nextTheme }))
  }, [theme])

  useEffect(() => {
    const handleThemeChange = event => setTheme(event.detail === 'light' ? 'light' : 'dark')
    window.addEventListener('meu-ecoo:themechange', handleThemeChange)
    return () => window.removeEventListener('meu-ecoo:themechange', handleThemeChange)
  }, [])

  if (variant === 'segmented') {
    return <div className="ds-seg" role="group" aria-label="Tema da interface" data-tutorial-target="tema">
      <button type="button" className="ds-seg__opt" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}><Icon name="sun" />Claro</button>
      <button type="button" className="ds-seg__opt" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}><Icon name="moon" />Escuro</button>
    </div>
  }

  const isLight = theme === 'light'
  return <button
    type="button"
    className="ds-btn ds-btn--quiet ds-btn--icon"
    data-tutorial-target="tema"
    aria-label={isLight ? 'Mudar para o tema escuro' : 'Mudar para o tema claro'}
    title={isLight ? 'Tema escuro' : 'Tema claro'}
    onClick={() => setTheme(isLight ? 'dark' : 'light')}
  >
    <Icon name={isLight ? 'moon' : 'sun'} />
  </button>
}
