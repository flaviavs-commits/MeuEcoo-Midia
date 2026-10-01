import { defineConfig } from '@playwright/test'
import { fileURLToPath, URL } from 'node:url'

// E2E de fumaça: o app de verdade (servidor de desenvolvimento do Vite) num navegador de verdade,
// com a API respondida por fixtures (e2e/fixtures/api.js). Não precisa de backend nem de banco.
// Usa uma porta própria (5174) para não esbarrar num `npm run frontend:dev` já aberto na 5173.
const PORT = Number(process.env.E2E_PORT || 5174)
const BASE_URL = `https://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: fileURLToPath(new URL('../tmp/e2e-results', import.meta.url)),
  use: {
    baseURL: BASE_URL,
    ignoreHTTPSErrors: true,
    // Edge instalado na máquina, sem baixar navegador. Para usar o Chromium do Playwright:
    // E2E_BROWSER_CHANNEL=chromium (depois de `npx playwright install chromium`).
    channel: process.env.E2E_BROWSER_CHANNEL || 'msedge',
    headless: true,
    viewport: { width: 1440, height: 900 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite --config frontend/vite.config.js --port ${PORT} --strictPort`,
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    url: BASE_URL,
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 90_000,
  },
})
