-- Makes the demo account read-only at the database level. Run AFTER schema.sql
-- and after creating the demo user. Idempotent; safe to re-run.
--
-- How it works:
--   1. Tags the demo user with app_metadata.is_demo = true. app_metadata is
--      server-controlled (users can never change their own) and is embedded in
--      every JWT the account receives, so both the RLS policies here and the
--      app layer (lib/demo.ts guard, layout banner) key off the same flag —
--      one source of truth. DEMO_EMAIL in the env is only a sign-in credential.
--   2. Restores the owner-only policies exactly as schema.sql defines them,
--      then adds RESTRICTIVE insert/update/delete policies requiring
--      NOT is_demo(). Permissive policies OR together but restrictive ones
--      AND, so re-running schema.sql later cannot silently re-grant the demo
--      user write access.
--
-- Enforcing this in the database (not just the UI) matters because the demo
-- session holds a real access token: anyone could replay it against the
-- Supabase REST API directly.

do $$
declare
  demo_email constant text := 'demo@example.com';
  n int;
begin
  update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"is_demo": true}'::jsonb
    where email = demo_email;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'User % not found — create the demo user first.', demo_email;
  end if;
end $$;

create or replace function public.is_demo()
returns boolean
language sql stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'is_demo')::boolean, false)
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'asset_classes', 'goals', 'goal_allocations', 'phases', 'categories',
    'expenses', 'incomes', 'investments', 'investment_entries',
    'debts', 'debt_payments', 'cash_balances', 'money_sources'
  ] loop
    -- Converge from the earlier split-policy version of this script.
    execute format('drop policy if exists "%s select own" on public.%I', t, t);
    execute format('drop policy if exists "%s insert own" on public.%I', t, t);
    execute format('drop policy if exists "%s update own" on public.%I', t, t);
    execute format('drop policy if exists "%s delete own" on public.%I', t, t);

    -- Owner-only permissive policy, exactly as schema.sql creates it.
    execute format('drop policy if exists "%s are owner-only" on public.%I', t, t);
    execute format(
      'create policy "%s are owner-only" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t, t);

    -- Demo lockdown: restrictive policies AND with the permissive one above.
    execute format('drop policy if exists "%s demo read-only insert" on public.%I', t, t);
    execute format('drop policy if exists "%s demo read-only update" on public.%I', t, t);
    execute format('drop policy if exists "%s demo read-only delete" on public.%I', t, t);
    execute format(
      'create policy "%s demo read-only insert" on public.%I as restrictive for insert with check (not public.is_demo())',
      t, t);
    execute format(
      'create policy "%s demo read-only update" on public.%I as restrictive for update using (not public.is_demo())',
      t, t);
    execute format(
      'create policy "%s demo read-only delete" on public.%I as restrictive for delete using (not public.is_demo())',
      t, t);
  end loop;
end $$;
