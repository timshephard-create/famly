-- Phase 4A — cost instrumentation + spend ceiling + rate limits (additive).
-- Does NOT touch 0001 (support), 0002 (auth user data), or leads/Airtable.
-- All writes are server-side via the service-key admin client; these tables
-- carry RLS-on / no-policy (like support_usage) so publishable-key clients
-- can't touch them. Idempotent so it re-runs cleanly in the SQL editor.

-- ─────────────────────────────────────────────────────────────────────────
-- usage_log — one row per Anthropic call (mostly anonymous → user_id nullable,
-- no FK so a deleted user never blocks cost history). Cost accounting only;
-- distinct from usage_events (the Phase-4B per-user metering substrate).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.usage_log (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  user_id           uuid,
  ip_hash           text,
  tool              text not null,
  model             text not null,
  input_tokens      integer not null default 0,
  output_tokens     integer not null default 0,
  cache_read_tokens integer not null default 0,
  cost_usd          numeric(10, 6) not null default 0
);
create index if not exists usage_log_created_idx on public.usage_log (created_at);
alter table public.usage_log enable row level security;  -- no policies: server-only

-- ─────────────────────────────────────────────────────────────────────────
-- Spend counters — running month-to-date totals (never SUM the whole log).
-- One platform row + one row per tool, keyed by month.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.spend_counter (
  month      date not null primary key,
  spent_usd  numeric(12, 6) not null default 0
);
alter table public.spend_counter enable row level security;

create table if not exists public.tool_spend_counter (
  month      date not null,
  tool       text not null,
  spent_usd  numeric(12, 6) not null default 0,
  primary key (month, tool)
);
alter table public.tool_spend_counter enable row level security;

-- Atomic: add a cost to both the platform and per-tool month rows; return the
-- new platform month-to-date total.
create or replace function public.add_spend(p_tool text, p_cost numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  m date := date_trunc('month', now())::date;
  new_total numeric;
begin
  insert into public.spend_counter (month, spent_usd)
  values (m, p_cost)
  on conflict (month) do update set spent_usd = spend_counter.spent_usd + p_cost
  returning spent_usd into new_total;

  insert into public.tool_spend_counter (month, tool, spent_usd)
  values (m, p_tool, p_cost)
  on conflict (month, tool) do update set spent_usd = tool_spend_counter.spent_usd + p_cost;

  return new_total;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Rate counters — durable per-actor/window counts (survive serverless
-- restarts). Mirrors increment_support_usage from 0001.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.rate_counter (
  actor       text not null,
  window_key  text not null,
  count       integer not null default 0,
  primary key (actor, window_key)
);
alter table public.rate_counter enable row level security;

create or replace function public.increment_rate(p_actor text, p_window text)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.rate_counter (actor, window_key, count)
  values (p_actor, p_window, 1)
  on conflict (actor, window_key)
  do update set count = rate_counter.count + 1
  returning count;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Lock everything down: server (service_role) only; no anon/authenticated.
-- ─────────────────────────────────────────────────────────────────────────
revoke execute on function public.add_spend(text, numeric) from public, anon, authenticated;
revoke execute on function public.increment_rate(text, text) from public, anon, authenticated;

grant usage on schema public to service_role;
grant all on table public.usage_log, public.spend_counter, public.tool_spend_counter, public.rate_counter to service_role;
grant execute on function public.add_spend(text, numeric) to service_role;
grant execute on function public.increment_rate(text, text) to service_role;
