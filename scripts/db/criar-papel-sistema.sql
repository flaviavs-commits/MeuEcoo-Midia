-- Cria (ou atualiza) o papel meuecoo_sistema: a conexão dos fluxos que cruzam usuários de propósito
-- (agendador, cron, webhooks, login, callbacks de OAuth), marcados com executarComoSistema em
-- src/db/requestContext.js. Igual ao meuecoo_app (só DML, sem superusuário, sem DDL), mas com
-- BYPASSRLS. Plano docs/superpowers/plans/2026-10-02-papel-banco-e-rls.md, Task 7.
--
-- Rodar como o DONO das tabelas (postgres), com a senha por variável do psql:
--   psql "$URL_DO_DONO" -v ON_ERROR_STOP=1 -v senha_sistema="$MEUECOO_SISTEMA_DB_PASSWORD" -f scripts/db/criar-papel-sistema.sql
-- Idempotente.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'meuecoo_sistema') THEN
    CREATE ROLE meuecoo_sistema LOGIN;
  END IF;
END
$$;

ALTER ROLE meuecoo_sistema WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS PASSWORD :'senha_sistema';

GRANT USAGE ON SCHEMA public TO meuecoo_sistema;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO meuecoo_sistema;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO meuecoo_sistema;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO meuecoo_sistema;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO meuecoo_sistema;
