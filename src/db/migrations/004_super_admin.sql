-- Execute manualmente: psql $DATABASE_URL -f src/db/migrations/004_super_admin.sql

UPDATE users SET role = 'super_admin' WHERE email = 'tiago@vitissouls.com';
