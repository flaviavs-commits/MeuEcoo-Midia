import { expect, test } from '@playwright/test'
import { mockApi, watchErrors } from './fixtures/api.js'

// Cada página do app, com o rótulo que o shell põe no título da aba ("<rótulo> · Meu Ecoo Mídia").
const APP_PAGES = [
  ['dashboard', 'Início'],
  ['ai', 'Assistente inteligente'],
  ['agendador', 'Meu Post'],
  ['calendario', 'Calendário'],
  ['rascunhos', 'Baú de Ideias'],
  ['biblioteca', 'Biblioteca'],
  ['filas', 'Repetidor de posts'],
  ['smartlinks', 'Smartlinks'],
  ['inbox', 'Inbox'],
  ['analytics', 'Relatórios'],
  ['integracoes', 'Contas'],
  ['seguranca', 'Segurança'],
  ['atividade', 'Atividades'],
  ['perfil', 'Perfil'],
]

const titleOf = label => `${label} · Meu Ecoo Mídia`

test.describe('sem sessão', () => {
  test('a landing abre e leva ao login', async ({ page }) => {
    const errors = watchErrors(page)
    await mockApi(page, { user: null })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('planejado')
    await page.getByRole('link', { name: 'Entrar' }).first().click()
    await expect(page).toHaveURL(/\/login\.html$/)
    await expect(page.getByLabel('E-mail')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('uma página do app manda para o login e guarda o caminho de volta', async ({ page }) => {
    // O 401 de /api/me aparece no console do navegador como recurso que falhou; é o esperado aqui.
    const errors = watchErrors(page, { allow: [/status of 401/] })
    await mockApi(page, { user: null })
    await page.goto('/app/calendario')
    await expect(page).toHaveURL(/\/login\.html\?next=calendario$/)
    await expect(page.getByLabel('E-mail')).toBeVisible()
    expect(errors).toEqual([])
  })
})

test.describe('com sessão', () => {
  test('cada página abre sem erro de script nem tela de falha', async ({ page }) => {
    const errors = watchErrors(page)
    await mockApi(page)
    for (const [key, label] of APP_PAGES) {
      await page.goto(`/app/${key}`)
      await expect(page, `título de /app/${key}`).toHaveTitle(titleOf(label))
      await expect(page.getByRole('navigation', { name: 'Página atual' })).toContainText(label)
      await expect(page.getByText('Não foi possível abrir esta página')).toHaveCount(0)
    }
    expect(errors).toEqual([])
  })

  test('o menu lateral troca de página e o voltar do navegador funciona', async ({ page }) => {
    const errors = watchErrors(page)
    await mockApi(page)
    await page.goto('/app/dashboard')
    await expect(page).toHaveTitle(titleOf('Início'))

    const nav = page.getByRole('navigation', { name: 'Navegação principal' })
    await nav.getByRole('button', { name: 'Calendário' }).click()
    await expect(page).toHaveURL(/\/app\/calendario$/)
    await expect(page).toHaveTitle(titleOf('Calendário'))
    await expect(nav.getByRole('button', { name: 'Calendário' })).toHaveAttribute('aria-current', 'page')

    await nav.getByRole('button', { name: 'Meu Post' }).click()
    await expect(page).toHaveURL(/\/app\/agendador$/)

    await page.goBack()
    await expect(page).toHaveURL(/\/app\/calendario$/)
    await expect(page).toHaveTitle(titleOf('Calendário'))
    expect(errors).toEqual([])
  })

  test('um endereço que não existe mostra a página 404 e volta ao Início', async ({ page }) => {
    const errors = watchErrors(page)
    await mockApi(page)
    await page.goto('/app/pagina-que-nao-existe')
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible()
    await page.getByRole('button', { name: 'Ir para o Início' }).click()
    await expect(page).toHaveURL(/\/app\/dashboard$/)
    await expect(page).toHaveTitle(titleOf('Início'))
    expect(errors).toEqual([])
  })

  test('com o servidor fora do ar, o aviso aparece e "Tentar de novo" recupera', async ({ page }) => {
    const errors = watchErrors(page, { allow: [/ERR_CONNECTION_REFUSED|Failed to load resource/] })
    const api = await mockApi(page, { serverDown: true })
    await page.goto('/app/dashboard')
    const banner = page.getByRole('alert').filter({ hasText: 'O servidor não respondeu' })
    await expect(banner).toBeVisible()

    api.serverDown = false
    await banner.getByRole('button', { name: 'Tentar de novo' }).click()
    await expect(banner).toHaveCount(0)
    await expect(page).toHaveTitle(titleOf('Início'))
    expect(errors).toEqual([])
  })

  test('no celular, a barra inferior navega entre as páginas', async ({ page }) => {
    const errors = watchErrors(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await page.goto('/app/dashboard')
    const bottom = page.getByRole('navigation', { name: 'Navegação principal' })
    await bottom.getByRole('button', { name: 'Calendário' }).click()
    await expect(page).toHaveURL(/\/app\/calendario$/)
    await expect(page).toHaveTitle(titleOf('Calendário'))
    // Sem rolagem horizontal da página no celular.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    expect(errors).toEqual([])
  })
})
