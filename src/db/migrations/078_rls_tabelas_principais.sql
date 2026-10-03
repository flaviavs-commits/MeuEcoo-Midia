-- RLS em contas, tokens, posts e logs (fase 2 do plano docs/superpowers/plans/2026-10-02-papel-banco-e-rls.md, Task 8).
--
-- NÃO roda no startup: aplicar à mão no rollout (Task 9), depois que a API estiver com
-- DB_CONTEXTO_USUARIO=ligado e DATABASE_SISTEMA_URL (papel meuecoo_sistema, BYPASSRLS):
--   psql "$URL_DO_DONO" -v ON_ERROR_STOP=1 -f src/db/migrations/078_rls_tabelas_principais.sql
-- Reverter: 078_rls_tabelas_principais.reverter.sql.
--
-- O usuário vem de app.user_id, que o pool (src/db/pool.js) aplica em cada consulta de uma
-- requisição autenticada. Sem app.user_id, NULLIF devolve NULL, a comparação nunca é verdadeira e
-- o papel do app não vê nem grava linha nenhuma (falha fechada). O dono (superusuário) e o
-- meuecoo_sistema (BYPASSRLS) não são afetados.

BEGIN;

CREATE OR REPLACE FUNCTION app_usuario_atual() RETURNS integer
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::integer $$;

-- contas: só as do próprio usuário.
ALTER TABLE contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contas_do_usuario ON contas;
CREATE POLICY contas_do_usuario ON contas
  USING (user_id = app_usuario_atual())
  WITH CHECK (user_id = app_usuario_atual());

-- tokens: não têm user_id; pertencem ao dono da conta.
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tokens_do_usuario ON tokens;
CREATE POLICY tokens_do_usuario ON tokens
  USING (EXISTS (SELECT 1 FROM contas c WHERE c.id = tokens.conta_id AND c.user_id = app_usuario_atual()))
  WITH CHECK (EXISTS (SELECT 1 FROM contas c WHERE c.id = tokens.conta_id AND c.user_id = app_usuario_atual()));

-- posts: só os do próprio usuário. A aprovação em workspace (revisor mexendo no post de outro
-- membro) roda como sistema no handler, depois de conferir o papel no workspace.
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS posts_do_usuario ON posts;
CREATE POLICY posts_do_usuario ON posts
  USING (user_id = app_usuario_atual())
  WITH CHECK (user_id = app_usuario_atual());

-- logs: o usuário lê os seus e os das próprias contas (como listarLogs já fazia) e só grava os seus;
-- log de sistema (user_id nulo) é gravado pelo meuecoo_sistema (registrarLog).
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS logs_leitura_do_usuario ON logs;
DROP POLICY IF EXISTS logs_escrita_do_usuario ON logs;
CREATE POLICY logs_leitura_do_usuario ON logs FOR SELECT
  USING (user_id = app_usuario_atual() OR conta_id IN (SELECT c.id FROM contas c WHERE c.user_id = app_usuario_atual()));
CREATE POLICY logs_escrita_do_usuario ON logs FOR ALL
  USING (user_id = app_usuario_atual())
  WITH CHECK (user_id = app_usuario_atual());

COMMIT;
