-- Cria (ou atualiza) o papel meuecoo_app: o usuário com que a API atende as requisições, sem
-- superusuário, sem DDL e sem BYPASSRLS. As migrations continuam com o dono das tabelas
-- (DATABASE_MIGRATION_URL). Plano docs/superpowers/plans/2026-10-02-papel-banco-e-rls.md, Task 3.
--
-- Rodar como o DONO das tabelas (postgres), passando a senha por variável do psql, nunca no texto:
--   psql "$URL_DO_DONO" -v ON_ERROR_STOP=1 -v senha_app="$MEUECOO_APP_DB_PASSWORD" -f scripts/db/criar-papel-app.sql
-- Idempotente: pode rodar de novo (ex.: para trocar a senha ou repor grants).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'meuecoo_app') THEN
    CREATE ROLE meuecoo_app LOGIN;
  END IF;
END
$$;

ALTER ROLE meuecoo_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'senha_app';

-- Só uso do schema; criar objetos fica com o dono.
GRANT USAGE ON SCHEMA public TO meuecoo_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- DML em tudo que já existe.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO meuecoo_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO meuecoo_app;

-- E no que o dono criar depois (migrations futuras). Vale para objetos criados pelo papel que roda
-- este script, que precisa ser o mesmo que roda as migrations.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO meuecoo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO meuecoo_app;
