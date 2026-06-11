-- BrutalBench Squad D Supabase database setup.
-- Run this file from the Supabase SQL Editor or with the Supabase CLI.

begin;

create extension if not exists "uuid-ossp";
create extension if not exists "pg_net";

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  github_handle text unique not null,
  avatar_url text,
  access_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_github_handle_valid check (
    github_handle ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$'
  )
);

comment on table public.users is
  'Authenticated GitHub profiles. Public clients may read profile fields only.';
comment on column public.users.access_token is
  'Sensitive GitHub token for Squad B automation. Do not expose this column to anon/authenticated clients.';

create table if not exists public.leaderboard (
  github_username text primary key,
  current_score integer not null check (current_score >= 0 and current_score <= 100),
  brutal_roast text not null,
  has_vulnerabilities boolean not null default false,
  fix_suggestion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leaderboard_github_username_valid check (
    github_username ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$'
  )
);

comment on table public.leaderboard is
  'Current leaderboard row per GitHub username. Written by n8n with service/database credentials.';

create table if not exists public.evaluations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id) on delete cascade,
  github_username text not null,
  score integer not null check (score >= 0 and score <= 100),
  critique text not null,
  critical_vulnerability boolean not null default false,
  optimization_tip text,
  source text not null default 'n8n',
  created_at timestamptz not null default now(),
  constraint evaluations_github_username_valid check (
    github_username ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$'
  )
);

comment on table public.evaluations is
  'Append-only score history used for dashboard updates and Supabase Realtime.';

create index if not exists idx_evaluations_score
  on public.evaluations(score desc);

create index if not exists idx_evaluations_created_at
  on public.evaluations(created_at desc);

create index if not exists idx_evaluations_github_username
  on public.evaluations(lower(github_username));

create index if not exists idx_leaderboard_score
  on public.leaderboard(current_score desc, updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

drop trigger if exists set_leaderboard_updated_at on public.leaderboard;
create trigger set_leaderboard_updated_at
before update on public.leaderboard
for each row
execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.evaluations enable row level security;
alter table public.leaderboard enable row level security;

drop policy if exists "Public profiles are viewable by everyone." on public.users;
create policy "Public profiles are viewable by everyone."
on public.users
for select
using (true);

drop policy if exists "Users can insert their own profile." on public.users;
create policy "Users can insert their own profile."
on public.users
for insert
with check (auth.uid() = id);

drop policy if exists "Users can update own profile." on public.users;
create policy "Users can update own profile."
on public.users
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Evaluations are viewable by everyone." on public.evaluations;
create policy "Evaluations are viewable by everyone."
on public.evaluations
for select
using (true);

drop policy if exists "Leaderboard is viewable by everyone." on public.leaderboard;
create policy "Leaderboard is viewable by everyone."
on public.leaderboard
for select
using (true);

-- RLS controls rows, not columns. These grants prevent token leakage through public profile reads.
revoke all on table public.users from anon, authenticated;
grant select (id, github_handle, avatar_url, created_at, updated_at)
  on table public.users to anon, authenticated;
grant insert (id, github_handle, avatar_url, access_token)
  on table public.users to authenticated;
grant update (github_handle, avatar_url, access_token)
  on table public.users to authenticated;

revoke all on table public.evaluations from anon, authenticated;
grant select on table public.evaluations to anon, authenticated;

revoke all on table public.leaderboard from anon, authenticated;
grant select on table public.leaderboard to anon, authenticated;

create or replace function public.notify_n8n_pipeline()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
begin
  if new.access_token is null or length(trim(new.access_token)) = 0 then
    return new;
  end if;

  perform net.http_post(
    url := 'http://n8n.brutalbench.local:5678/webhook/brutal-auth-trigger',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := json_build_object(
      'user_id', new.id,
      'github_username', new.github_handle,
      'github_token', new.access_token
    )::jsonb
  );

  return new;
end;
$$;

drop trigger if exists trigger_user_auth_pipeline on public.users;
create trigger trigger_user_auth_pipeline
after insert on public.users
for each row
execute function public.notify_n8n_pipeline();

create or replace function public.record_evaluation_from_leaderboard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_user_id uuid;
begin
  if tg_op = 'UPDATE'
     and old.current_score is not distinct from new.current_score
     and old.brutal_roast is not distinct from new.brutal_roast
     and old.has_vulnerabilities is not distinct from new.has_vulnerabilities
     and old.fix_suggestion is not distinct from new.fix_suggestion then
    return new;
  end if;

  select users.id
  into matched_user_id
  from public.users
  where lower(users.github_handle) = lower(new.github_username)
  limit 1;

  insert into public.evaluations (
    user_id,
    github_username,
    score,
    critique,
    critical_vulnerability,
    optimization_tip,
    source
  )
  values (
    matched_user_id,
    new.github_username,
    new.current_score,
    new.brutal_roast,
    new.has_vulnerabilities,
    new.fix_suggestion,
    'leaderboard_upsert'
  );

  return new;
end;
$$;

drop trigger if exists trigger_record_leaderboard_evaluation on public.leaderboard;
create trigger trigger_record_leaderboard_evaluation
after insert or update on public.leaderboard
for each row
execute function public.record_evaluation_from_leaderboard();

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    alter publication supabase_realtime add table public.evaluations;
  end if;
exception
  when duplicate_object then
    null;
end;
$$;

commit;

