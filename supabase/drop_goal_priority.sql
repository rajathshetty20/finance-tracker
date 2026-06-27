-- One-off migration: goals are now ordered/funded by how soon they're due
-- (nearest end_date first), so the manual priority column is gone.
-- Run once against the live database.

drop index if exists public.goals_user_priority;
alter table public.goals drop column if exists priority;

create index if not exists goals_user_end_date on public.goals (user_id, end_date);
