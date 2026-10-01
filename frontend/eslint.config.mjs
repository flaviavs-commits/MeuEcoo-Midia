// Lint do frontend: `npm run frontend:lint` (na raiz).
// Regras: as recomendadas do JavaScript + as duas regras clássicas de hooks do React
// (regras de hooks e dependências de efeito, ambas como erro). As regras novas do
// eslint-plugin-react-hooks 7 voltadas ao React Compiler ficam de fora: o projeto não usa o
// compilador e elas apontam padrões válidos sem ele (ex.: setState num efeito de "reset").
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['node_modules/**', 'test-results/**', 'playwright-report/**'] },
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
    },
  },
  {
    files: ['test/**', 'e2e/**', '**/*.test.{js,jsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.vitest } },
  },
  {
    files: ['**/*.config.{js,mjs}', 'mock-api/**'],
    languageOptions: { globals: { ...globals.node } },
  },
]
