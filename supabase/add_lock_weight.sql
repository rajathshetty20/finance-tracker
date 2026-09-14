-- Fund locking: each asset class's share of the corpus reserved before goals.
-- A weight, not a percent — normalised at read time. See lib/lock.ts.
alter table public.asset_classes
  add column if not exists lock_weight numeric not null default 0
  check (lock_weight >= 0);
