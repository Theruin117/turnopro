-- ─────────────────────────────────────────────────────────────
-- TurnoPro — endurecimiento de un proyecto Supabase
--
-- La API accede con Prisma usando el rol `postgres` (dueño de las
-- tablas). La Data API de Supabase (PostgREST) queda expuesta con los
-- roles `anon` y `authenticated`, que NO se usan en esta aplicación.
--
-- Este script:
--   1. Activa RLS en todas las tablas de `public`.
--   2. Revoca privilegios de `anon` y `authenticated`.
--   3. Revoca privilegios por defecto para tablas futuras.
--
-- Ejecutar después de `prisma migrate deploy`. Es idempotente.
-- ─────────────────────────────────────────────────────────────

do $$
declare
  relation record;
begin
  for relation in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', relation.tablename);
    execute format('revoke all on table public.%I from anon, authenticated', relation.tablename);
  end loop;
end
$$;

revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- El esquema sigue siendo usable por `postgres` (Prisma) y por el
-- dashboard. No se revoca `usage` para no romper herramientas internas.
