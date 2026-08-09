-- STEP 1 of 3 — clear the demo account, and only the demo account.
--
-- Run this, then seed_demo.sql, then demo_readonly.sql.
--
-- Every statement is scoped to `u`, which resolves only from the demo email.
-- No other user's rows can be reached from here. Deletion order follows the
-- restrict foreign keys: children before parents, phases last. Do not reorder.
--
-- Running as postgres in the SQL editor bypasses the demo's read-only RLS.

do $$
declare
  u uuid;
begin
  select id into u from auth.users where email = 'demo@example.com';

  -- Without this, a missing demo user leaves u NULL, every `user_id = NULL`
  -- matches nothing, and the whole block reports success having done nothing.
  if u is null then
    raise exception 'demo@example.com not found — create the demo user first.';
  end if;

  delete from public.goal_allocations   where user_id = u;
  delete from public.goals              where user_id = u;
  delete from public.money_sources      where user_id = u;
  delete from public.investment_entries where user_id = u;
  delete from public.investments        where user_id = u;
  delete from public.asset_classes      where user_id = u;
  delete from public.debt_payments      where user_id = u;
  delete from public.debts              where user_id = u;
  delete from public.expenses           where user_id = u;
  delete from public.incomes            where user_id = u;
  delete from public.cash_balances      where user_id = u;
  delete from public.categories         where user_id = u;
  delete from public.phases             where user_id = u;

  raise notice 'Cleared all demo rows for %', u;
end $$;
