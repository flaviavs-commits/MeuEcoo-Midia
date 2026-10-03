-- Confere o papel meuecoo_app depois de criar-papel-app.sql. Toda linha precisa sair com ok = true.
--   psql "$URL_DO_DONO" -f scripts/db/verificar-papel-app.sql
SELECT 'papel existe, sem superusuário, sem BYPASSRLS, sem criar banco/papel' AS verificacao,
       COALESCE(bool_and(NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND rolcanlogin), FALSE) AS ok
  FROM pg_roles WHERE rolname = 'meuecoo_app'
UNION ALL
SELECT 'DML em todas as tabelas do schema public',
       COALESCE(bool_and(has_table_privilege('meuecoo_app', c.oid, 'SELECT,INSERT,UPDATE,DELETE')), TRUE)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
UNION ALL
SELECT 'uso de todas as sequências do schema public',
       COALESCE(bool_and(has_sequence_privilege('meuecoo_app', c.oid, 'USAGE,SELECT,UPDATE')), TRUE)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'S'
UNION ALL
SELECT 'sem permissão de criar no schema public',
       NOT has_schema_privilege('meuecoo_app', 'public', 'CREATE')
UNION ALL
SELECT 'privilégios padrão para tabelas e sequências futuras',
       COUNT(*) = 2
  FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
 WHERE n.nspname = 'public' AND d.defaclobjtype IN ('r', 'S')
   AND array_to_string(d.defaclacl, ',') LIKE '%meuecoo_app=%';
