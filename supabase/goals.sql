-- Goal-based investing migration. Run AFTER schema.sql in the Supabase SQL Editor.
-- Safe to re-run (idempotent). It:
--   1. introduces asset_classes (controlled vocab + appreciation assumption),
--   2. migrates investments.kind (free text) -> investments.asset_class_id (FK) and drops kind,
--   3. adds goals + goal_allocations (the glide-path "plan").
--
-- Goals are a pure PLANNING OVERLAY: they never create money_sources, never touch
-- cash or net worth. Nothing here participates in the accounting identity.


-- ============================================================
-- asset_classes
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
-- Migrate investments.kind -> investments.asset_class_id
-- ============================================================
-- 1. Seed asset_classes from existing distinct kinds.
insert into public.asset_classes (user_id, name)
select distinct user_id, trim(kind)
from public.investments
where kind is not null and trim(kind) <> ''
on conflict (user_id, name) do nothing;

-- 2. Add the FK column.
alter table public.investments
  add column if not exists asset_class_id uuid references public.asset_classes on delete restrict;

-- 3. Point each investment at its asset class (only if kind still exists).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'investments' and column_name = 'kind'
  ) then
    update public.investments i
      set asset_class_id = ac.id
      from public.asset_classes ac
      where ac.user_id = i.user_id
        and ac.name = trim(i.kind)
        and i.asset_class_id is null;
    -- 4. Drop the legacy free-text column.
    alter table public.investments drop column kind;
  end if;
end $$;


-- ============================================================
-- goals
-- created_at IS the inflation anchor ("today's value" reference); there is no
-- separate start_date. present_cost is the cost in today's money; the corpus
-- actually needed at end_date is present_cost inflated over (created_at -> end_date).
-- inflation_rate is an annual % (e.g. 6 = 6% p.a.).
-- priority: ascending = filled first by the runtime waterfall. Need not be unique.
-- ============================================================
create table if not exists public.goals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  name            text not null,
  description     text,
  end_date        date not null,
  present_cost    numeric not null check (present_cost > 0),
  inflation_rate  numeric not null default 0,
  priority        int not null default 0,
  status          text not null default 'active' check (status in ('active', 'achieved', 'archived')),
  created_at      timestamptz not null default now()
);

create index if not exists goals_user_priority on public.goals (user_id, priority);


-- ============================================================
-- goal_allocations  (the glide-path breakpoints / "plan")
-- One row per (goal, asset_class, milestone). A milestone is months_before_end:
-- the allocation that should hold when that many months remain. Between
-- milestones the app interpolates linearly. target_pct values at a given
-- milestone are expected to sum to 100 across asset classes.
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
grant select, insert, update, delete on public.asset_classes    to authenticated;
grant select, insert, update, delete on public.goals            to authenticated;
grant select, insert, update, delete on public.goal_allocations to authenticated;


-- ============================================================
-- RLS (owner-only)
-- ============================================================
alter table public.asset_classes    enable row level security;
alter table public.goals            enable row level security;
alter table public.goal_allocations enable row level security;

drop policy if exists "asset_classes are owner-only" on public.asset_classes;
create policy "asset_classes are owner-only" on public.asset_classes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "goals are owner-only" on public.goals;
create policy "goals are owner-only" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "goal_allocations are owner-only" on public.goal_allocations;
create policy "goal_allocations are owner-only" on public.goal_allocations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
