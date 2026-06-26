-- Phase 5 — Item 1: family-profile spine (additive; does not alter 0002/0003).
--
-- Two tables, owner-only RLS matching the 0002 profiles/usage_events pattern.
-- ALL access is user-context via the publishable key (authenticated role +
-- RLS) — there are no service-key writes here. Idempotent (guarded create type,
-- drop-if-exists policies/triggers) so it re-runs cleanly in the Supabase SQL
-- editor, same as 0002.
--
-- Posture: additive. The four tools stay open to anonymous visitors; these
-- tables only matter once a user signs in. Note: 0002 speculatively added a
-- `family_presets jsonb` column to public.profiles — this design supersedes it
-- with a dedicated table and leaves that column untouched (unused, parked for a
-- later cleanup; no migration now).

-- ─────────────────────────────────────────────────────────────────────────
-- allergen_group — canonical Big-9. Mirrors AllergenGroup in lib/allergens.ts.
-- Stored canonically on the profile; quiz option values are mapped to/from
-- these only at the app edges.
-- ─────────────────────────────────────────────────────────────────────────
do $$ begin
  create type public.allergen_group as enum
    ('milk', 'egg', 'peanut', 'treenut', 'wheat', 'soy', 'fish', 'shellfish', 'sesame');
exception
  when duplicate_object then null;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- family_profiles — exactly ONE profile per user today (unique(user_id)), but
-- forward-compatible with the future paid multi-profile feature: the surrogate
-- `id` PK already exists, so multi-profile just DROPs the unique constraint —
-- no data migration, nothing clawed back. App logic also enforces the single
-- profile; no multi-profile UI/creation path is built here.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.family_profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- [{ "ageMonths": 18 }, ...]. ageMonths is storage-only: it exists to derive
  -- each tool's age band for pre-fill. Tools never display raw ageMonths as a
  -- literal age. Sprout is the sole writer of children (see lib/profile.ts).
  children    jsonb not null default '[]'::jsonb,
  -- canonical Big-9 only; never quiz option strings.
  allergens   public.allergen_group[] not null default '{}',
  -- shared scalar context: { zip, householdSize, householdIncomeUsd }.
  -- householdIncomeUsd is pre-fill convenience ONLY — eligibility/subsidy math
  -- runs off the freshly-entered quiz answer, never this stored value.
  context     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id)
);

alter table public.family_profiles enable row level security;

drop policy if exists "family_profiles select own" on public.family_profiles;
create policy "family_profiles select own"
  on public.family_profiles for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "family_profiles insert own" on public.family_profiles;
create policy "family_profiles insert own"
  on public.family_profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "family_profiles update own" on public.family_profiles;
create policy "family_profiles update own"
  on public.family_profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "family_profiles delete own" on public.family_profiles;
create policy "family_profiles delete own"
  on public.family_profiles for delete
  to authenticated
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- tool_results — last result per (user, tool). unique(user_id, tool) + upsert
-- keeps exactly the most recent result per tool (FREE tier). Forward-compatible
-- with paid full history: that is a natural extension (a separate history table,
-- or drop the unique and append). No retention is promised on free, so nothing
-- here needs clawing back. `tool` reuses the 0002 enum (childcare|health|media|
-- meal) so Sprout/HealthGuide stay independently keyed even though they share
-- /api/insight.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.tool_results (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  tool        public.tool_kind not null,
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, tool)
);

alter table public.tool_results enable row level security;

drop policy if exists "tool_results select own" on public.tool_results;
create policy "tool_results select own"
  on public.tool_results for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "tool_results insert own" on public.tool_results;
create policy "tool_results insert own"
  on public.tool_results for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "tool_results update own" on public.tool_results;
create policy "tool_results update own"
  on public.tool_results for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "tool_results delete own" on public.tool_results;
create policy "tool_results delete own"
  on public.tool_results for delete
  to authenticated
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- updated_at touch trigger (shared by both tables).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists family_profiles_touch on public.family_profiles;
create trigger family_profiles_touch
  before update on public.family_profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists tool_results_touch on public.tool_results;
create trigger tool_results_touch
  before update on public.tool_results
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- Grants. authenticated operates strictly through the RLS policies above.
-- service_role keeps full access for ops parity with 0002 (no app code uses it
-- for these tables).
-- ─────────────────────────────────────────────────────────────────────────
grant select, insert, update, delete on table public.family_profiles to authenticated;
grant select, insert, update, delete on table public.tool_results to authenticated;
grant all on table public.family_profiles, public.tool_results to service_role;
