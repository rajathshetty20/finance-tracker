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
-- asset_classes
-- Controlled vocabulary for what an investment IS (equity, fixed income, ...),
-- carrying the appreciation assumption used by goal projections.
-- expected_return is an annual % (e.g. 12 = 12% p.a.), not a decimal.
-- ============================================================
create table if not exists public.asset_classes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  name             text not null,
  expected_return  numeric not null default 0,
  created_at       timestamptz not null default now(),
  unique (user_id, name)
);


-- ============================================================
-- investments
-- ============================================================
create table if not exists public.investments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  name            text not null,
  asset_class_id  uuid references public.asset_classes on delete restrict,
  status          text not null default 'open' check (status in ('open', 'closed')),
  opened_on       date not null,
  closed_on       date,
  notes           text,
  created_at      timestamptz not null default now(),
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
-- goals  (goal-based investing — a pure planning overlay)
-- created_at is the inflation anchor; present_cost is in today's money, inflated
-- to end_date to get the corpus actually needed. inflation_rate is an annual %.
-- The runtime waterfall fills goals by how soon they're due (nearest end_date first).
-- ============================================================
create table if not exists public.goals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  name            text not null,
  description     text,
  end_date        date not null,
  present_cost    numeric not null check (present_cost > 0),
  inflation_rate  numeric not null default 0,
  status          text not null default 'active' check (status in ('active', 'achieved', 'archived')),
  created_at      timestamptz not null default now()
);

create index if not exists goals_user_end_date on public.goals (user_id, end_date);


-- ============================================================
-- goal_allocations  (glide-path breakpoints)
-- One row per (goal, asset_class, months_before_end milestone). The app
-- interpolates linearly between milestones; target_pct sums to 100 per milestone.
-- ============================================================
create table if not exists public.goal_allocations (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users on delete cascade,
  goal_id           uuid not null references public.goals        on delete cascade,
  asset_class_id    uuid not null references public.asset_classes on delete restrict,
  months_before_end int not null check (months_before_end >= 0),
  target_pct        numeric not null check (target_pct >= 0 and target_pct <= 100),
  unique (goal_id, asset_class_id, months_before_end)
);

create index if not exists goal_allocations_goal on public.goal_allocations (goal_id);


-- ============================================================
-- Grants
-- ============================================================
grant select, insert, update, delete on public.asset_classes      to authenticated;
grant select, insert, update, delete on public.goals              to authenticated;
grant select, insert, update, delete on public.goal_allocations   to authenticated;
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
alter table public.asset_classes      enable row level security;
alter table public.goals              enable row level security;
alter table public.goal_allocations   enable row level security;
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

drop policy if exists "asset_classes are owner-only" on public.asset_classes;
create policy "asset_classes are owner-only" on public.asset_classes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "goals are owner-only" on public.goals;
create policy "goals are owner-only" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "goal_allocations are owner-only" on public.goal_allocations;
create policy "goal_allocations are owner-only" on public.goal_allocations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
