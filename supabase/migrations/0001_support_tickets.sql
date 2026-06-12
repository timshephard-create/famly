-- Support tickets + usage tracking for the in-app support chatbot.
-- Inserts happen server-side via the sb_secret_ key (bypasses RLS).
-- No user auth exists at launch: user_id stays null until Supabase Auth
-- ships; the own-row policies below activate automatically at that point.

create table if not exists public.support_tickets (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     uuid references auth.users (id) on delete set null,
  email       text,
  description text not null,
  page_path   text,
  tool        text,
  app_version text,
  transcript  jsonb,
  status      text not null default 'open'
              check (status in ('open', 'in_progress', 'closed'))
);

alter table public.support_tickets enable row level security;

drop policy if exists "users insert own tickets" on public.support_tickets;
create policy "users insert own tickets"
  on public.support_tickets for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users read own tickets" on public.support_tickets;
create policy "users read own tickets"
  on public.support_tickets for select
  to authenticated
  using (auth.uid() = user_id);

-- Per-IP daily usage for the support-chat cost ceiling. Only the server
-- (secret key) touches this table; RLS on with no policies blocks
-- publishable-key access entirely.
create table if not exists public.support_usage (
  ip_hash text not null,
  day     date not null default current_date,
  count   integer not null default 0,
  primary key (ip_hash, day)
);

alter table public.support_usage enable row level security;

-- Atomic increment, returns the new count for the (ip, day) pair.
create or replace function public.increment_support_usage(p_ip_hash text)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.support_usage (ip_hash, day, count)
  values (p_ip_hash, current_date, 1)
  on conflict (ip_hash, day)
  do update set count = support_usage.count + 1
  returning count;
$$;

revoke execute on function public.increment_support_usage(text) from public;
revoke execute on function public.increment_support_usage(text) from anon;
revoke execute on function public.increment_support_usage(text) from authenticated;

-- Explicit grants for the server role behind sb_secret_ keys. Revoking
-- PUBLIC above also strips the implicit execute grant from service_role,
-- and table grants are not guaranteed by default privileges — be explicit.
grant usage on schema public to service_role;
grant all on table public.support_tickets to service_role;
grant all on table public.support_usage to service_role;
grant execute on function public.increment_support_usage(text) to service_role;
