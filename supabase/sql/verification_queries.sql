-- Run these checks in the Supabase SQL Editor after the migration.

select extname
from pg_extension
where extname in ('uuid-ossp', 'pg_net')
order by extname;

select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('users', 'leaderboard', 'evaluations')
order by table_name;

select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where oid in (
  'public.users'::regclass,
  'public.leaderboard'::regclass,
  'public.evaluations'::regclass
)
order by relname;

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('users', 'leaderboard', 'evaluations')
order by tablename, policyname;

select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'users'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type, column_name;

select pubname, schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename = 'evaluations';

