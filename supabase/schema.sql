-- Run this in the Supabase SQL Editor.
-- pgcrypto is preinstalled in Supabase, so gen_random_uuid() works out of the box.
--
-- All tables carry user_id directly (children denormalized from their parents)
-- so RLS policies can be a uniform "auth.uid() = user_id" — mirrors calorie-tracker.
-- The app is responsible for copying user_id from parent on insert, and for
-- enforcing higher-level business rules (phase immutability, closed-phase entry
-- locking, etc.) per HLD.md §3.5.


-- ============================================================
-- phases
-- ============================================================
create table if not exists public.phases (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  name        text not null,
  start_date  date not null,
  end_date    date,
  notes       text,
  created_at  timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

-- Exactly one open phase per user.
create unique index if not exists phases_one_open_per_user
  on public.phases (user_id) where end_date is null;


-- ============================================================
-- categories
-- ============================================================
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  name        text not null,
  kind        text not null check (kind in ('expense', 'income')),
  created_at  timestamptz not null default now(),
  unique (user_id, kind, name)
);


-- ============================================================
-- expenses
-- ============================================================
create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  phase_id     uuid not null references public.phases on delete restrict,
  category_id  uuid not null references public.categories on delete restrict,
  date         date not null,
  amount       numeric not null check (amount > 0),
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists expenses_user_phase_date
  on public.expenses (user_id, phase_id, date desc);


-- ============================================================
-- incomes
-- ============================================================
create table if not exists public.incomes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  phase_id     uuid not null references public.phases on delete restrict,
  category_id  uuid not null references public.categories on delete restrict,
  date         date not null,
  amount       numeric not null check (amount > 0),
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists incomes_user_phase_date
  on public.incomes (user_id, phase_id, date desc);


-- ============================================================
-- investments
-- ============================================================
create table if not exists public.investments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  name        text not null,
  kind        text,
  status      text not null default 'open' check (status in ('open', 'closed')),
  opened_on   date not null,
  closed_on   date,
  notes       text,
  created_at  timestamptz not null default now(),
  check (status = 'open' or closed_on is not null)
);


-- ============================================================
-- investment_entries
-- ============================================================
create table if not exists public.investment_entries (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users on delete cascade,
  investment_id      uuid not null references public.investments on delete restrict,
  date               date not null,
  entry_type         text not null check (entry_type in ('contribution', 'withdrawal', 'valuation')),
  amount             numeric not null check (amount >= 0),
  total_value_after  numeric not null check (total_value_after >= 0),
  note               text,
  created_at         timestamptz not null default now(),
  check ((entry_type = 'valuation') = (amount = 0))
);

create index if not exists investment_entries_inv_date
  on public.investment_entries (investment_id, date);


-- ============================================================
-- debts
-- ============================================================
create table if not exists public.debts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  description    text not null,
  principal      numeric not null check (principal > 0),
  total_payable  numeric not null,
  start_date     date not null,
  status         text not null default 'open' check (status in ('open', 'closed')),
  closed_on      date,
  created_at     timestamptz not null default now(),
  check (total_payable >= principal),
  check (status = 'open' or closed_on is not null)
);


-- ============================================================
-- debt_payments
-- ============================================================
create table if not exists public.debt_payments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  debt_id     uuid not null references public.debts on delete restrict,
  date        date not null,
  amount      numeric not null check (amount > 0),
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists debt_payments_debt_date
  on public.debt_payments (debt_id, date);


-- ============================================================
-- cash_balances
-- ============================================================
create table if not exists public.cash_balances (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  name        text not null,
  amount      numeric not null,           -- signed; negative allowed (e.g. credit card debt tracked as cash)
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);


-- ============================================================
-- money_sources
-- ============================================================
create table if not exists public.money_sources (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  name           text not null,
  amount         numeric not null,                       -- signed; negative entries allowed
  date           date not null,
  kind           text not null check (kind in (
                   'manual', 'opening_balance', 'phase_rollover', 'realized_gain', 'debt_closure'
                 )),
  phase_id       uuid references public.phases       on delete restrict,
  investment_id  uuid references public.investments  on delete restrict,
  debt_id        uuid references public.debts        on delete restrict,
  created_at     timestamptz not null default now(),
  check ((kind = 'phase_rollover') = (phase_id      is not null)),
  check ((kind = 'realized_gain')  = (investment_id is not null)),
  check ((kind = 'debt_closure')   = (debt_id       is not null))
);


-- ============================================================
-- Grants
-- ============================================================
grant select, insert, update, delete on public.phases             to authenticated;
grant select, insert, update, delete on public.categories         to authenticated;
grant select, insert, update, delete on public.expenses           to authenticated;
grant select, insert, update, delete on public.incomes            to authenticated;
grant select, insert, update, delete on public.investments        to authenticated;
grant select, insert, update, delete on public.investment_entries to authenticated;
grant select, insert, update, delete on public.debts              to authenticated;
grant select, insert, update, delete on public.debt_payments      to authenticated;
grant select, insert, update, delete on public.cash_balances      to authenticated;
grant select, insert, update, delete on public.money_sources      to authenticated;


-- ============================================================
-- RLS (owner-only on every table)
-- ============================================================
alter table public.phases             enable row level security;
alter table public.categories         enable row level security;
alter table public.expenses           enable row level security;
alter table public.incomes            enable row level security;
alter table public.investments        enable row level security;
alter table public.investment_entries enable row level security;
alter table public.debts              enable row level security;
alter table public.debt_payments      enable row level security;
alter table public.cash_balances      enable row level security;
alter table public.money_sources      enable row level security;

drop policy if exists "phases are owner-only" on public.phases;
create policy "phases are owner-only" on public.phases
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "categories are owner-only" on public.categories;
create policy "categories are owner-only" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "expenses are owner-only" on public.expenses;
create policy "expenses are owner-only" on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "incomes are owner-only" on public.incomes;
create policy "incomes are owner-only" on public.incomes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "investments are owner-only" on public.investments;
create policy "investments are owner-only" on public.investments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "investment_entries are owner-only" on public.investment_entries;
create policy "investment_entries are owner-only" on public.investment_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "debts are owner-only" on public.debts;
create policy "debts are owner-only" on public.debts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "debt_payments are owner-only" on public.debt_payments;
create policy "debt_payments are owner-only" on public.debt_payments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "cash_balances are owner-only" on public.cash_balances;
create policy "cash_balances are owner-only" on public.cash_balances
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "money_sources are owner-only" on public.money_sources;
create policy "money_sources are owner-only" on public.money_sources
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
