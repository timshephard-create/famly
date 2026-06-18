-- Phase 2 — Supabase Auth user-data schema (additive; does not touch 0001).
-- profiles / usage_events / subscriptions, all RLS-isolated to the owning user
-- via auth.uid(). Auth is additive: the four tools stay open to anonymous
-- visitors; these tables only matter once a user signs in.
--
-- Idempotent (drop-if-exists policies/triggers) so it re-runs cleanly in the
-- Supabase SQL editor.

-- ─────────────────────────────────────────────────────────────────────────
-- profiles — 1:1 with auth.users, auto-created on signup via trigger.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  display_name   text,
  family_presets jsonb not null default '{}'::jsonb,  -- Phase 5 family presets
  created_at     timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-insert a profiles row whenever an auth.users row is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────
-- usage_events — metering substrate. Phase 4 aggregates these for per-tool
-- monthly caps. Built now, NOT enforced yet. `tool` stores the request's
-- internal tool id (childcare|health|media|meal) — NOT the endpoint — so
-- Sprout (childcare) and HealthGuide (health), which share /api/insight,
-- stay independently meterable.
-- ─────────────────────────────────────────────────────────────────────────
do $$ begin
  create type public.tool_kind as enum ('childcare', 'health', 'media', 'meal');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.usage_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  tool       public.tool_kind not null,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_user_tool_time_idx
  on public.usage_events (user_id, tool, created_at);

alter table public.usage_events enable row level security;

drop policy if exists "usage select own" on public.usage_events;
create policy "usage select own"
  on public.usage_events for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "usage insert own" on public.usage_events;
create policy "usage insert own"
  on public.usage_events for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- subscriptions — schema only; stays empty until Stripe lands in Phase 4.
-- The Phase-4 Stripe webhook writes these via the service-key admin client
-- (bypasses RLS), so clients get read-only own-row access and no write policy.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  status                 text,
  plan                   text,
  stripe_customer_id     text,
  stripe_subscription_id text,
  current_period_end     timestamptz,
  updated_at             timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions select own" on public.subscriptions;
create policy "subscriptions select own"
  on public.subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Grants. authenticated operates through RLS above. service_role keeps full
-- access for Phase-4 server-side writes (Stripe webhook, usage logging).
-- ─────────────────────────────────────────────────────────────────────────
grant usage on schema public to authenticated, service_role;
grant select, update on table public.profiles to authenticated;
grant select, insert on table public.usage_events to authenticated;
grant select on table public.subscriptions to authenticated;
grant all on table public.profiles, public.usage_events, public.subscriptions to service_role;
