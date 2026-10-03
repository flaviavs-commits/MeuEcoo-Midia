-- Reverte a 078: desliga o RLS e remove as políticas de contas, tokens, posts e logs.
--   psql "$URL_DO_DONO" -v ON_ERROR_STOP=1 -f src/db/migrations/078_rls_tabelas_principais.reverter.sql
BEGIN;
DROP POLICY IF EXISTS contas_do_usuario ON contas;
DROP POLICY IF EXISTS tokens_do_usuario ON tokens;
DROP POLICY IF EXISTS posts_do_usuario ON posts;
DROP POLICY IF EXISTS logs_leitura_do_usuario ON logs;
DROP POLICY IF EXISTS logs_escrita_do_usuario ON logs;
ALTER TABLE contas NO FORCE ROW LEVEL SECURITY;
ALTER TABLE contas DISABLE ROW LEVEL SECURITY;
ALTER TABLE tokens NO FORCE ROW LEVEL SECURITY;
ALTER TABLE tokens DISABLE ROW LEVEL SECURITY;
ALTER TABLE posts NO FORCE ROW LEVEL SECURITY;
ALTER TABLE posts DISABLE ROW LEVEL SECURITY;
ALTER TABLE logs NO FORCE ROW LEVEL SECURITY;
ALTER TABLE logs DISABLE ROW LEVEL SECURITY;
DROP FUNCTION IF EXISTS app_usuario_atual();
COMMIT;
