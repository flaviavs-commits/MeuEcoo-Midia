import { Button } from '../ui/button.jsx'
import { ThemeSelector } from '../ui/theme-selector.jsx'

export function SiteHeader() {
  return <header className="site-header"><a className="brand" href="/" aria-label="Meu Ecoo Mídia - início"><img src="/logo.png" alt="Meu Ecoo Mídia" /></a><div className="site-header-actions"><a className="landing-how-link" href="#como-funciona">Como funciona</a><ThemeSelector /><Button href="/login.html" size="lg">Entrar</Button><Button href="/login.html?register=1" size="lg">Criar conta</Button></div></header>
}
