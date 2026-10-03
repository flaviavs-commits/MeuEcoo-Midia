// Lint do backend: `npm run backend:lint` (e `npm run lint`, que o CI chama, roda backend e frontend).
// Mesmo estilo do frontend (frontend/eslint.config.mjs): as regras recomendadas do JavaScript,
// agora para o Node em CommonJS. Sem tipos no backend, é a primeira rede contra variável não
// declarada, import errado ou código morto. O frontend tem a própria configuração.
import js from '@eslint/js'
import globals from 'globals'

export default [
  { ignores: ['node_modules/**', 'frontend/**', 'public/**', 'coverage/**'] },
  {
    files: ['src/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      // catch vazio é o padrão "melhor esforço" do backend (ex.: JSON opcional que não parseia, log que
      // não pode derrubar a requisição); bloco vazio fora de catch continua sendo erro.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
    },
  },
]
