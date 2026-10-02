# Papel de banco sem superusuário e RLS — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O app deixa de conectar como superusuário (fase 1) e o Postgres passa a isolar linhas por usuário com RLS, primeiro em `contas`, `tokens`, `posts` e `logs` (fase 2) e depois nas demais tabelas com `user_id` (fase 3).

**Architecture:** Três papéis: `postgres` (dono, só migrations), `meuecoo_app` (requisições, sujeito a RLS) e `meuecoo_sistema` (BYPASSRLS, só fluxos que cruzam usuários de propósito). O usuário da requisição chega ao banco por `AsyncLocalStorage` + `set_config('app.user_id', …, true)` em transação curta.

**Tech Stack:** Node.js (CommonJS), Express, `pg`, Jest, PostgreSQL 18, GitHub Actions, Railway.

**Spec:** `docs/superpowers/specs/2026-10-02-papel-banco-e-rls-design.md`

## Global Constraints

- Nada muda em produção sem a task de rollout da fase correspondente; rollout em produção com reversão pronta (decisão da usuária, sem staging).
- Nomes fixos: papéis `meuecoo_app` e `meuecoo_sistema`; variáveis `DATABASE_MIGRATION_URL`, `DATABASE_SISTEMA_URL`, `MEUECOO_APP_DB_PASSWORD`, `MEUECOO_SISTEMA_DB_PASSWORD`; GUCs `app.user_id` e `app.user_role`.
- Senhas geradas localmente, nunca impressas nem commitadas; variáveis por referência no Railway.
- Fase 2 cobre exatamente `contas`, `tokens`, `posts`, `logs`, com `ENABLE` e `FORCE ROW LEVEL SECURITY`.
- Sem contexto de usuário, o papel `meuecoo_app` não vê linhas das tabelas com RLS (falha fechada).
- Código, comentários, mensagens e commits em português; Conventional Commits direto no `main`.

## Review Focus

1. Tabela criada por migration futura sem grant para `meuecoo_app`: o app quebra com `permission denied`. O `ALTER DEFAULT PRIVILEGES` precisa de teste que crie uma tabela nova como `postgres` e consulte como `meuecoo_app` (Task 3).
2. Conexão devolvida ao pool com `app.user_id` de outra requisição: vazamento entre usuários. Teste com duas requisições alternadas no mesmo client (Task 6).
3. Login, callback OAuth e webhooks rodando sem contexto: zero linhas e falha silenciosa. Teste de integração por fluxo que exige `poolSistema` (Task 7).
4. Revisor aprovando post de outra pessoa depois do RLS: o `UPDATE` não pode virar 0 linhas sem erro. Teste no fluxo de aprovação (Task 8).
5. Log de sistema (`user_id` nulo) gravado pelo papel do app: `WITH CHECK` rejeita e a requisição falha. Teste de `registrarLog` sem usuário dentro de uma requisição (Task 8).

---

## Fase 1 — papel mínimo

### Task 1: Testes de integração contra Postgres real

**Files:** Create `tests/integration-db/setup.js`, `tests/integration-db/jest.config.js`; Modify `package.json` (script `test:db`), `.github/workflows/ci.yml` (serviço `postgres:18` e passo `npm run test:db`).

**Interfaces:** Produces `prepararBanco() -> Promise<{ urlDono: string, urlApp: string, urlSistema: string }>` (aplica `runMigrations`, cria os papéis com o SQL da Task 3 quando existir, devolve URLs); `limparBanco()`.

- [ ] Teste-sentinela `tests/integration-db/sanidade.test.js`: conecta em `urlDono` e `SELECT 1`.
- [ ] `npm run test:db` local com `docker run -d -p 5433:5432 -e POSTGRES_PASSWORD=teste postgres:18` e `TEST_DATABASE_URL`; sem a variável, a suíte é pulada com aviso (não quebra `npm test`).
- [ ] CI com `services.postgres` e o mesmo comando. Commit `test(db): roda testes de integração contra um Postgres real`.

### Task 2: Pool próprio para migrations

**Files:** Create `src/db/migrationPool.js`; Modify `src/db/runtimeMigrations.js:9` (`requiredQuery` usa o pool recebido), `src/server.js` (fecha o pool de migration depois de `runMigrations`); Test `tests/unit/migrationPool.test.js`.

**Interfaces:** Produces `criarPoolMigracao(env = process.env) -> Pool | null` (null sem `DATABASE_MIGRATION_URL`); `runMigrations({ pool } = {})`.

- [ ] Testes: sem a variável, `runMigrations` usa o pool padrão; com a variável, as queries vão ao pool de migration e ele é encerrado (`end()` chamado uma vez), inclusive quando uma migration falha.
- [ ] Implementar com a mesma configuração TLS de `src/db/pool.js` (CA/fingerprint). Commit `feat(db): roda as migrations com conexão própria`.

### Task 3: Papel `meuecoo_app`

**Files:** Create `scripts/db/criar-papel-app.sql` (idempotente: `DO $$ … IF NOT EXISTS … CREATE ROLE`, `ALTER ROLE … PASSWORD` via `\set`/variável psql, grants e `ALTER DEFAULT PRIVILEGES`), `scripts/db/verificar-papel-app.sql`; Test `tests/integration-db/papelApp.test.js`.

- [ ] Testes (Postgres real): como `meuecoo_app`, SELECT/INSERT/UPDATE/DELETE em `logs` funcionam; `nextval` funciona; `pg_advisory_xact_lock` funciona; `CREATE TABLE`, `SELECT FROM pg_authid` e `COPY (SELECT 1) TO PROGRAM 'true'` falham com permissão negada; tabela nova criada por `postgres` depois do script é legível por `meuecoo_app` (Review Focus 1).
- [ ] Rodar o script duas vezes seguidas sem erro. Commit `feat(db): cria o papel meuecoo_app sem superusuário`.

### Task 4: Rollout da fase 1

- [ ] Gerar senha (32 caracteres) e gravar `MEUECOO_APP_DB_PASSWORD` no serviço Postgres sem imprimir; aplicar `criar-papel-app.sql` via `railway ssh` + `psql` no socket; rodar `verificar-papel-app.sql`.
- [ ] Na API: `DATABASE_MIGRATION_URL=${{meuecoo-midia-postgres.DATABASE_URL}}` e `DATABASE_URL=postgresql://meuecoo_app:${{meuecoo-midia-postgres.MEUECOO_APP_DB_PASSWORD}}@${{meuecoo-midia-postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{meuecoo-midia-postgres.PGDATABASE}}`; redeploy.
- [ ] Validar: deploy SUCCESS, `/api/config` 200, `pg_stat_activity` mostrando `usename = meuecoo_app`, login, criar e agendar um post de teste, `POST /v1/webhooks/test` da Zernio 200, 30 min sem `permission denied` nos logs.
- [ ] Reversão documentada e testada até o comando (não executada se tudo passar). README (acesso ao banco) e IA.md. Commit `docs: registra o app rodando sem superusuário no banco`.

## Fase 2 — RLS em `contas`, `tokens`, `posts`, `logs`

### Task 5: Contexto do usuário por requisição

**Files:** Create `src/db/requestContext.js`; Modify `src/middleware/requireAuth.js` e o middleware de chave da API v1; Test `tests/unit/requestContext.test.js`.

**Interfaces:** Produces `executarComUsuario({ userId, role }, fn)`, `usuarioAtual() -> { userId, role } | null`.

- [ ] Testes: dentro de `executarComUsuario`, `usuarioAtual()` devolve o usuário mesmo depois de `await`; fora, `null`; duas execuções concorrentes não se misturam.
- [ ] `requireAuth` envolve `next()` em `executarComUsuario`. Commit `feat(db): propaga o usuário da requisição até a camada de banco`.

### Task 6: Pool que aplica `app.user_id`

**Files:** Modify `src/db/pool.js`; Test `tests/unit/poolContexto.test.js` e `tests/integration-db/poolContexto.test.js`.

**Interfaces:** `pool.query(text, params)` e `pool.connect()` com a mesma assinatura do `pg`; com contexto, `query` roda `BEGIN` → `set_config('app.user_id', $1, true), set_config('app.user_role', $2, true)` → consulta → `COMMIT` (`ROLLBACK` em erro) num client do pool; `connect()` devolve um client que aplica `set_config` no primeiro `BEGIN` do chamador ou em escopo de sessão, com `RESET app.user_id; RESET app.user_role` no `release()`.

- [ ] Testes de integração: `current_setting('app.user_id', true)` dentro de uma requisição devolve o id; depois do `release`, o mesmo client numa requisição sem usuário devolve vazio (Review Focus 2); erro na consulta faz `ROLLBACK` e devolve o erro original.
- [ ] Medir no teste de integração o tempo de 1000 consultas com e sem contexto e registrar no commit. Commit `feat(db): aplica o usuário da requisição em cada consulta`.

### Task 7: Papel e pool de sistema

**Files:** Create `src/db/poolSistema.js`, `scripts/db/criar-papel-sistema.sql`; Modify os chamadores intencionais (lista abaixo); Test `tests/integration-db/poolSistema.test.js`.

- Chamadores que passam a `poolSistema`: `src/services/scheduler.js`, `src/infra/db/postsRepository.js` (só `reservarPostsPendentes`, `recuperarPostsProcessingStale`, finalizações e primeiros comentários), `src/routes/cron.js` e serviços que ele chama, `src/services/zernioWebhookService.js` e `src/repositories/zernioWebhooksRepository.js`, o webhook da Stripe (`src/routes/billing.js` e serviço), `src/routes/auth.js` (login, cadastro, reset), `src/routes/oauth.js` (callbacks), `src/routes/admin.js`, `src/services/platformHealth.js`, `src/services/mediaCleanupService.js`, `src/repositories/logsRepository.js` (`registrarLog` sem usuário e `limparAntigos`). Qualquer outro só com justificativa no commit.

- [ ] Testes: `meuecoo_sistema` vê linhas de todos os usuários com RLS ativo; o login de um usuário existente funciona sem contexto (Review Focus 3); um tick do agendador reserva posts de dois usuários.
- [ ] Commit `feat(db): separa o acesso de sistema que cruza usuários`.

### Task 8: Políticas nas 4 tabelas

**Files:** Create `src/db/migrations/078_rls_tabelas_principais.sql` e `src/db/migrations/078_rls_tabelas_principais.reverter.sql`; **não** espelhar a 078 em `src/db/runtimeMigrations.js` (as `.sql` versionadas são aplicadas à mão com `psql`, como o README já descreve; assim o RLS entra na hora escolhida no rollout, não no boot); o `prepararBanco()` da Task 1 aplica a 078 nos testes; Test `tests/integration-db/rls.test.js`.

- [ ] Testes (usuários A e B, papel `meuecoo_app`): A não lê, não altera e não apaga linhas de B em `contas`, `posts`, `tokens` (via `contas`) e `logs`; `SELECT * FROM posts` sem `WHERE` devolve só as de A; sem contexto, zero linhas; `INSERT` em `posts` com `user_id` de B é recusado; revisor do workspace aprova o post de A pelo fluxo de `workspaces.js` (Review Focus 4); `registrarLog` de sistema dentro de uma requisição grava pelo `poolSistema` (Review Focus 5).
- [ ] Migration de reversão testada (desliga RLS e remove as políticas). Commit `feat(db): ativa RLS em contas, tokens, posts e logs`.

### Task 9: Rollout da fase 2

- [ ] Criar `meuecoo_sistema` em produção (mesma rotina da Task 4) e `DATABASE_SISTEMA_URL` na API; deploy com o código das Tasks 5–7 **antes** da migration 078 (sem RLS ainda, nada muda).
- [ ] Aplicar a 078; validar com `SET ROLE meuecoo_app; SELECT set_config('app.user_id', '<id de teste>', false); SELECT count(*) FROM posts;` (só as linhas do usuário) e com os fluxos da Task 4 mais aprovação em workspace.
- [ ] Medir p95 dos logs HTTP antes e depois. Reverter com a 078 de reversão se algo quebrar. README e IA.md. Commit `docs: registra o RLS ativo em produção`.

## Fase 3 — demais tabelas com `user_id`

### Task 10: Estender o RLS tabela por tabela

- [ ] Para cada grupo (IA: `ai_*`; mídia: `media_assets`, `media_folders`; conteúdo: `drafts`, `saved_texts`, `content_queues`, `smartlinks`, `platform_presets`, `report_schedules`; conta: `api_keys`, `push_subscriptions`, `user_*`, `webhook_endpoints`; cobrança: `subscriptions`, `billing_plan_changes`; demais), uma migration `ENABLE/FORCE` + política + reversão e um teste de isolamento A/B no padrão da Task 8. `credentials`, `oauth_flow_states` e `zernio_oauth_pending` ficam com acesso só via `poolSistema`.
- [ ] Um commit por grupo, com rollout curto (deploy + fluxos principais do grupo).
