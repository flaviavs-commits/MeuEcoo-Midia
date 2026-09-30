// Páginas do app autenticado (o mesmo conjunto que o servidor entrega em
// /app/<página>). Também é a lista fechada de destinos aceitos depois do
// login: o parâmetro ?next= carrega só a chave da página, nunca uma URL.
export const APP_PAGES = new Set([
  'dashboard', 'agendador', 'calendario', 'rascunhos', 'analytics', 'inbox', 'integracoes',
  'seguranca', 'atividade', 'ai', 'perfil', 'biblioteca', 'filas', 'smartlinks', 'equipe',
])

const ADMIN_PAGE = 'admin'

export function isReturnPage(value) {
  return value === ADMIN_PAGE || APP_PAGES.has(value)
}

// Chave da página atual, para voltar a ela depois de entrar de novo.
export function returnPageFor(pathname = '') {
  if (pathname === '/admin.html') return ADMIN_PAGE
  if (!pathname.startsWith('/app/')) return null
  const segment = pathname.slice('/app/'.length).split('/')[0]
  return APP_PAGES.has(segment) && segment !== 'dashboard' ? segment : null
}

export function pathForReturnPage(page) {
  if (page === ADMIN_PAGE) return '/admin.html'
  return APP_PAGES.has(page) ? `/app/${page}` : '/app.html'
}
