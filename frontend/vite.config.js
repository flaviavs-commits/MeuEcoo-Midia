import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import fs from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const certDir = fileURLToPath(new URL('../.certs', import.meta.url))
const certFile = `${certDir}/localhost.pem`
const keyFile = `${certDir}/localhost-key.pem`
const hasTrustedCert = fs.existsSync(certFile) && fs.existsSync(keyFile)

export default defineConfig(({ command }) => ({
  // Some machines' browsers have an HSTS policy cached for "localhost"
  // (Strict-Transport-Security with includeSubDomains, set by some other
  // local server at some point) that forces https:// for that host no
  // matter what — serving real TLS here satisfies that instead of fighting
  // it. When a mkcert-issued cert is present at ../.certs (run
  // `mkcert -install` once, then `mkcert -cert-file .certs/localhost.pem
  // -key-file .certs/localhost-key.pem localhost 127.0.0.1 ::1`) the browser
  // trusts it with no warning; otherwise this falls back to a plain
  // self-signed cert that triggers a one-time "not trusted" warning.
  plugins: [react(), ...(hasTrustedCert ? [] : [basicSsl()])],
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Os assets compartilhados ficam na pasta public da aplicação, um nível
  // acima do root do Vite. Servi-los somente no dev evita que o build copie
  // a pasta inteira para dentro de public/react.
  publicDir: command === 'serve' ? fileURLToPath(new URL('../public', import.meta.url)) : false,
  build: {
    outDir: fileURLToPath(new URL('../public/react', import.meta.url)),
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL('./index.html', import.meta.url)) }
  },
  server: {
    // Listen on every interface so "localhost" resolves correctly whether
    // this machine prefers ::1 or 127.0.0.1 for it.
    host: true,
    https: hasTrustedCert
      ? { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) }
      : true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '^/oauth/': 'http://localhost:3000',
      '/media-proxy': 'http://localhost:3000'
    }
  }
}))
