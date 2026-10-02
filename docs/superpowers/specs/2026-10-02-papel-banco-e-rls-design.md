# Papel de banco sem superusuário e Row-Level Security — design

Data: 02/10/2026 · Autor: agente Tasks do MeuEcoo Social Media (Claude Code) · Origem: task "MeuEcoo-Midia/Segurança — ativar Row-Level Security no PostgreSQL" (achado S-03 da auditoria de 23/09/2026) · Estado: aguardando revisão

## Decisões da usuária (02/10/2026)

1. Nesta entrega, **só planejar**: spec, plano e tasks; nada muda em produção.
2. Sem staging, a validação das mudanças de permissão é **em produção, com rollback pronto** (trocar uma variável de volta).
3. Cobertura do RLS: **primeiro as 4 tabelas da task** (`contas`, `tokens`, `posts`, `logs`) e **depois as demais** com `user_id`.

## Objetivo

Ter duas camadas de defesa no banco: (1) o app não roda mais como superusuário; (2) uma consulta que esqueça o filtro por usuário não devolve linhas de outro usuário. Critério de sucesso da fase 2: um `SELECT * FROM posts` feito pelo papel do app, no contexto de um usuário, devolve só as linhas dele.

## Estado atual (medido em 02/10/2026)

- O app conecta como `postgres`: `rolsuper = true`, `rolbypassrls = true`, dono das 50 tabelas de `public`. **Com isso, RLS não teria efeito nenhum**: superusuário e dono ignoram as políticas. E uma SQL injection, hoje, teria privilégio total: apagar o banco, ler `pg_authid`, `COPY ... TO PROGRAM`.
- O mesmo pool (`src/db/pool.js`) serve o app e as migrations do startup (`src/db/runtimeMigrations.js`, 148 comandos DDL; `runMigrations()` antes do `listen` em `src/server.js`).
- 351 chamadas `pool.query`/`client.query` em 40 arquivos; 12 transações com `pool.connect`. Advisory locks em `contasRepository.js:309`, `tokensRepository.js:93`, `workspaces.js:34` e `openrouterKeyService.js:76` (não exigem privilégio especial).
- 32 das 50 tabelas têm `user_id`. `tokens` não tem: liga em `contas` por `conta_id`. `logs` tem `user_id` nulo em 12.449 das ~14.551 linhas (logs de sistema).
- Fluxos que cruzam usuários de propósito: agendador e crons (`src/services/scheduler.js`, `src/routes/cron.js`), webhooks da Stripe e da Zernio, login e cadastro (antes de haver usuário), painel admin (`src/routes/admin.js`) e aprovação em workspace, em que o revisor atualiza o post de quem pediu (`src/routes/workspaces.js:95`).
- Testes de backend usam `pool` mockado: nenhum teste roda contra um Postgres real.
- Não há staging (task própria aberta).

## Fase 1 — papel mínimo para o app

### Papéis

- `meuecoo_app` (LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS): `CONNECT` no banco; `USAGE` no schema `public`; `SELECT, INSERT, UPDATE, DELETE` em todas as tabelas; `USAGE, SELECT, UPDATE` em todas as sequências; `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public` com os mesmos grants, para tabelas futuras.
- `postgres` continua dono das tabelas e passa a ser usado **só** pelas migrations.

### Conexões

- `DATABASE_URL` da API passa a apontar para `meuecoo_app`.
- Nova variável `DATABASE_MIGRATION_URL` (referência ao `DATABASE_URL` do serviço Postgres, com `postgres`). `runMigrations()` usa um pool próprio (`src/db/migrationPool.js`) quando ela existe e fecha esse pool ao terminar. Sem a variável, comportamento igual ao de hoje (dev local).
- A senha de `meuecoo_app` fica numa variável do serviço Postgres (`MEUECOO_APP_DB_PASSWORD`) e a `DATABASE_URL` da API é montada por referência a ela, sem literal.

### Validação e reversão

- Antes de trocar: com `psql` como `meuecoo_app`, confirmar SELECT/INSERT/UPDATE/DELETE numa tabela de teste e em `logs`; uso de sequência; advisory lock; e recusa de `CREATE TABLE`, `SELECT FROM pg_authid` e `COPY ... TO PROGRAM`.
- Depois de trocar: deploy SUCCESS, `/api/config` 200, login, criar e agendar um post, webhook de teste da Zernio, um tick do agendador. Logs sem `permission denied` por 30 min.
- Reverter: `DATABASE_URL` da API de volta para a referência do Postgres e redeploy (~1 min).

## Fase 2 — RLS em `contas`, `tokens`, `posts`, `logs`

### Contexto por requisição

- `src/db/requestContext.js` (novo): `AsyncLocalStorage` com `{ userId, role }`, preenchido por `requireAuth` (`src/middleware/requireAuth.js`) e pelas rotas da API v1 com chave.
- `src/db/pool.js` passa a exportar um pool que, quando há contexto, executa cada consulta numa transação curta: `BEGIN` → `SELECT set_config('app.user_id', $1, true), set_config('app.user_role', $2, true)` → consulta → `COMMIT`. Em `pool.connect()` (transações do código), o `set_config` é aplicado no `BEGIN` do chamador ou, se o chamador não abrir transação, com escopo de sessão e `RESET` no `release`.
- Sem contexto, a consulta roda sem `app.user_id`: as políticas devolvem zero linhas (falha fechada).

### Papel de sistema

- `meuecoo_sistema` (LOGIN, NOSUPERUSER, **BYPASSRLS**, mesmos grants de `meuecoo_app`) e um segundo pool, `src/db/poolSistema.js`, usado **explicitamente** só onde cruzar usuários é intencional: agendador e crons, webhooks (Stripe, Zernio), login/cadastro/recuperação de senha, painel admin e o handler de aprovação em workspace.
- Toda troca de um `require('../db/pool')` por `poolSistema` é revisada uma a uma e listada no plano.

### Políticas (`ENABLE` + `FORCE ROW LEVEL SECURITY`)

- `contas`, `posts`: `USING/WITH CHECK (user_id = current_setting('app.user_id', true)::int)`.
- `posts` (aprovação): leitura e `UPDATE` também para membros `owner/admin/reviewer` do workspace com `approval_requests` pendente do post. Pode ser evitado se o handler de aprovação usar `poolSistema`; o plano escolhe, com teste.
- `tokens`: `USING/WITH CHECK (EXISTS (SELECT 1 FROM contas c WHERE c.id = tokens.conta_id AND c.user_id = current_setting('app.user_id', true)::int))`.
- `logs`: o usuário lê e grava só onde `user_id` é o dele; logs de sistema (`user_id IS NULL`) só pelo `poolSistema`.

### Testes

- Novo conjunto de integração contra **Postgres real** (serviço `postgres` no GitHub Actions e `docker run postgres:18` local), aplicando as migrations, criando os papéis e provando: usuário A não vê nem altera linhas de B nas 4 tabelas; consulta sem filtro devolve só as próprias linhas; sem contexto devolve zero; `poolSistema` vê tudo.
- A suíte atual (mocks) continua verde.

### Validação e reversão

- Mesma rotina da fase 1, mais: em produção, `SET ROLE meuecoo_app; SELECT set_config('app.user_id', '<id de teste>', false); SELECT count(*) FROM posts;` devolve só as linhas desse usuário.
- Reverter: `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` nas 4 tabelas (migration de reversão pronta) ou `DATABASE_URL` de volta a `meuecoo_sistema`.

## Fase 3 — demais tabelas com `user_id`

As outras 28 (`ai_*`, `api_keys`, `app_events`, `billing_plan_changes`, `content_queues`, `credentials`, `drafts`, `media_*`, `oauth_flow_states`, `push_subscriptions`, `report_schedules`, `saved_texts`, `smartlinks`, `subscriptions`, `user_*`, `webhook_endpoints`, `workspace_members`, `zernio_oauth_pending`, entre outras), uma por vez ou em pequenos grupos, com o mesmo padrão e um teste de isolamento por tabela. `credentials` e `oauth_flow_states` são lidas antes de haver usuário (login, callback OAuth): vão pelo `poolSistema`.

## Fora do escopo

- Separar as migrations do startup num passo de pré-deploy do Railway (pode vir depois; a fase 1 só separa a conexão).
- RLS em tabelas sem `user_id` (`users`, `platform_health`, `rate_limit_counters`, `zernio_webhook_events`, etc.).

## Riscos

- **Fase 1:** um caminho que dependa de privilégio de superusuário fora das migrations quebra em produção. Mitigação: teste com `psql` antes, monitoramento de `permission denied` e reversão em 1 min.
- **Fase 2:** consulta esquecida no `poolSistema` devolve zero linhas e parece bug. É o comportamento desejado (falha fechada), mas precisa de teste por fluxo crítico.
- **Fase 2:** latência extra de 2 idas e voltas por consulta (rede privada, ~1 ms cada). Medir o p95 antes e depois.
