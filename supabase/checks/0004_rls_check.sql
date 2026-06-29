-- Manual cross-user RLS check for 0004 (family_profiles + tool_results).
-- Run in the Supabase SQL editor AFTER applying 0004_family_profile_spine.sql.
-- Verifies owner-only isolation by impersonating two users via the JWT claim
-- the policies read (auth.uid() = request.jwt.claims->>'sub').
--
-- Expected results are noted inline. If any "cross-user" SELECT returns a row,
-- or the cross-user UPDATE/DELETE reports a non-zero row count, RLS is broken —
-- STOP and do not ship.

-- Two arbitrary UUIDs standing in for two distinct signed-in users.
-- (These rows reference auth.users via FK, so use two REAL user ids from your
--  project's auth.users table; replace the placeholders below.)
\set userA '00000000-0000-0000-0000-00000000000a'
\set userB '00000000-0000-0000-0000-00000000000b'

begin;

-- ── Act as user A: write a profile + a tool result ────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'userA')::text, true);

insert into public.family_profiles (user_id, allergens, context)
values (:'userA', '{milk}', '{"zip":"76009"}'::jsonb)
on conflict (user_id) do update set context = excluded.context;

insert into public.tool_results (user_id, tool, payload)
values (:'userA', 'meal', '{"weeklyTotal":"$120"}'::jsonb)
on conflict (user_id, tool) do update set payload = excluded.payload;

-- A can see its own rows → expect 1 and 1.
select 'A sees own profile (expect 1)' as check, count(*) from public.family_profiles;
select 'A sees own result (expect 1)'  as check, count(*) from public.tool_results;

-- ── Act as user B: must NOT see, update, or delete A's rows ────────────────────
select set_config('request.jwt.claims', json_build_object('sub', :'userB')::text, true);

-- Cross-user SELECT → expect 0 and 0.
select 'B sees A profile (expect 0)' as check, count(*) from public.family_profiles where user_id = :'userA';
select 'B sees A result (expect 0)'  as check, count(*) from public.tool_results  where user_id = :'userA';

-- Cross-user UPDATE → expect 0 rows affected (RLS filters the row out).
with upd as (
  update public.family_profiles set context = '{"zip":"99999"}'::jsonb
  where user_id = :'userA' returning 1
)
select 'B updated A profile (expect 0)' as check, count(*) from upd;

-- Cross-user DELETE → expect 0 rows affected.
with del as (
  delete from public.tool_results where user_id = :'userA' returning 1
)
select 'B deleted A result (expect 0)' as check, count(*) from del;

rollback;  -- leave no test data behind
