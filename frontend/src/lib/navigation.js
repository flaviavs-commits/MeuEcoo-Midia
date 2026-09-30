// Navegações de página inteira (saem do React). Ficam num módulo próprio para
// os testes conseguirem observá-las sem depender do window.location do jsdom.
export function navigateTo(url) {
  window.location.assign(url)
}

export function replaceWith(url) {
  window.location.replace(url)
}
