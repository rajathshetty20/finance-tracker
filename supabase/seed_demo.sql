-- Demo seed: fills a demo account with ~3 years of synthetic finance data.
-- All data is fictional. Run in the Supabase SQL Editor.
--
-- Dates SLIDE with the run date: history spans 35 months ending at the last
-- complete calendar month, and goal deadlines sit relative to today — so the
-- demo never looks stale. Reseed anytime with the cleanup block at the bottom.
--
-- Before running:
--   1. Create the demo user (email configured below) — sign up through the
--      app, or Supabase Auth dashboard -> Add user (password, auto-confirm).
--   2. Run this script once. It aborts if the demo user already has data.
--
-- What it creates:
--   - 2 phases: a closed first job (with its rollover money source, computed
--     exactly as the app would: Σ income − Σ expense) and an open current job
--   - monthly salary + one-off bonus/freelance incomes, monthly expenses
--     across 10 categories with deterministic variance (sin-based, no random)
--   - 4 asset classes and 7 investments: two equity SIPs, PPF, an emergency
--     FD, a gold bond, a volatile Bitcoin position, and closed ESOPs whose
--     close-out mirrors the app (final withdrawal + realized_gain source)
--   - 2 debts: a closed phone EMI (with its debt_closure source, amount =
--     principal − Σ payments, as in app/debts/actions.ts) and an open car loan
--   - cash balances derived from the same identity lib/networthSeries.ts uses,
--     so the dashboard reconciles
--   - 4 goals with glide-path allocations (one due next month, to demo the
--     waterfall's due-goal handling)

do $$
declare
  demo_email constant text := 'demo@example.com';

  -- The day the demo is frozen at. MUST equal DEMO_TODAY in lib/demo.ts: the
  -- app reads that constant as "today" for the demo session, and if the two
  -- disagree the data drifts out from under the clock — goals silently fall
  -- behind schedule, and "last complete month" stops matching the ledger.
  demo_today constant date := date '2026-08-09';

  -- Timeline anchors. m0 = first of the LAST COMPLETE month (nothing is ever
  -- dated in the future); base = month 0 of the 35-month history; pb = the
  -- phase boundary (start of the second job, month 19).
  m0   constant date := (date_trunc('month', demo_today) - interval '1 month')::date;
  base constant date := (m0 - make_interval(months => 34))::date;
  pb   constant date := (base + make_interval(months => 19))::date;

  u_id uuid;
  p1 uuid;  p2 uuid;
  ph_id uuid;

  -- categories
  cat_salary uuid; cat_bonus uuid; cat_freelance uuid;
  cat_rent uuid; cat_groc uuid; cat_dining uuid; cat_transport uuid;
  cat_util uuid; cat_subs uuid; cat_misc uuid;
  cat_travel uuid; cat_shopping uuid; cat_health uuid;
  cat_delivery uuid;

  -- asset classes
  ac_eq uuid; ac_fi uuid; ac_gold uuid; ac_crypto uuid;

  -- investments
  inv_nifty uuid; inv_flexi uuid; inv_ppf uuid; inv_fd uuid;
  inv_sgb uuid; inv_btc uuid; inv_esop uuid;

  -- debts
  debt_car uuid; debt_phone uuid;

  -- goals
  g_id uuid;

  -- running totals (mirror lib/networthSeries.ts identity)
  p1_inc numeric := 0;  p1_exp numeric := 0;
  p2_inc numeric := 0;  p2_exp numeric := 0;
  ms_total numeric := 0;          -- money sources excluding phase_rollover
  open_book numeric := 0;         -- Σ contributions − withdrawals, open invs only
  car_paid numeric := 0;
  cash numeric;

  d date;
  amt numeric;
  sip numeric;
  val numeric;
  m int;
  rec record;
begin
  -- ── Resolve user, guard against double-seeding ─────────────────────────
  select id into u_id from auth.users where email = demo_email;
  if u_id is null then
    raise exception 'User % not found — create the demo user first.', demo_email;
  end if;
  if exists (select 1 from public.phases where user_id = u_id) then
    raise exception 'User % already has data — aborting to avoid double-seeding. See the cleanup block at the bottom of this file to reseed.', demo_email;
  end if;

  -- ── Phases ─────────────────────────────────────────────────────────────
  insert into public.phases (user_id, name, start_date, end_date, notes)
  values (u_id, 'SDE-1 at Company 1', base, pb - 1,
          null)
  returning id into p1;

  insert into public.phases (user_id, name, start_date, notes)
  values (u_id, 'SDE-2 at Company 2', pb, null)
  returning id into p2;

  -- ── Categories ─────────────────────────────────────────────────────────
  insert into public.categories (user_id, name, kind) values (u_id, 'Salary', 'income')        returning id into cat_salary;
  insert into public.categories (user_id, name, kind) values (u_id, 'Bonus', 'income')         returning id into cat_bonus;
  insert into public.categories (user_id, name, kind) values (u_id, 'Freelance', 'income')     returning id into cat_freelance;
  insert into public.categories (user_id, name, kind) values (u_id, 'Rent', 'expense')         returning id into cat_rent;
  insert into public.categories (user_id, name, kind) values (u_id, 'Groceries', 'expense')    returning id into cat_groc;
  insert into public.categories (user_id, name, kind) values (u_id, 'Dining out', 'expense')   returning id into cat_dining;
  insert into public.categories (user_id, name, kind) values (u_id, 'Transport', 'expense')    returning id into cat_transport;
  insert into public.categories (user_id, name, kind) values (u_id, 'Utilities', 'expense')    returning id into cat_util;
  insert into public.categories (user_id, name, kind) values (u_id, 'Subscriptions', 'expense')returning id into cat_subs;
  insert into public.categories (user_id, name, kind) values (u_id, 'Miscellaneous', 'expense')returning id into cat_misc;
  insert into public.categories (user_id, name, kind) values (u_id, 'Travel', 'expense')       returning id into cat_travel;
  insert into public.categories (user_id, name, kind) values (u_id, 'Shopping', 'expense')     returning id into cat_shopping;
  insert into public.categories (user_id, name, kind) values (u_id, 'Health', 'expense')       returning id into cat_health;
  insert into public.categories (user_id, name, kind) values (u_id, 'Food delivery', 'expense') returning id into cat_delivery;

  -- ── Monthly salary + recurring expenses (months 0..34) ─────────────────
  for m in 0..34 loop
    d := (base + make_interval(months => m))::date;
    ph_id := case when d < pb then p1 else p2 end;

    -- salary tiers: joins at 145k, appraisal to 158k, switch to 195k, appraisal to 210k
    amt := case
      when m < 7  then 145000
      when m < 19 then 158000
      when m < 31 then 195000
      else 210000
    end;
    insert into public.incomes (user_id, phase_id, category_id, date, amount, note)
    values (u_id, ph_id, cat_salary, d, amt, 'Monthly salary');
    if ph_id = p1 then p1_inc := p1_inc + amt; else p2_inc := p2_inc + amt; end if;

    -- rent (moved to a costlier flat with the new job)
    amt := case when d < pb then 38000 else 52000 end;
    insert into public.expenses (user_id, phase_id, category_id, date, amount, note)
    values (u_id, ph_id, cat_rent, d + 1, amt,
            case when d = pb then 'Moved — bigger flat, closer to office' end);
    if ph_id = p1 then p1_exp := p1_exp + amt; else p2_exp := p2_exp + amt; end if;

    -- Everything else in the month.
    --
    -- This used to emit exactly one row per category on a fixed day of the
    -- month, every month, for three years: 36 Rent, 36 Groceries, 36
    -- Subscriptions, one each, none missed, none doubled. The loop was visible
    -- through the UI — ₹999 on the 3rd and ₹7,930 groceries on the 6th,
    -- repeating — and no one spends like that. Nobody buys groceries once a
    -- month, and a ₹2.1L-a-month engineer in Bangalore does not eat out once.
    --
    -- So counts and days vary per month, some categories skip months entirely,
    -- and the mix includes the things that actually dominate an urban Indian
    -- ledger: delivered food, fuel and cabs, and impulse shopping. Still fully
    -- deterministic — every varying quantity is a function of `m`, never
    -- random, so two visitors always see the same ledger.
    --
    -- Notes land on the months that are unusual, not on every row: a note on
    -- all 35 rents is noise, and the note column then reads as decoration
    -- rather than as the place the exceptions are explained.
    for rec in
      -- Subscriptions: one line; the amount steps when a service is added.
      select cat_subs as cat, (d + 2)::date as dt,
             (case when m >= 26 then 1497 when m >= 13 then 1199 else 649 end)::numeric as amount,
             (case when m = 26 then 'Added YouTube Premium'
                   when m = 13 then 'Netflix plan upgrade' end)::text as note
      union all
      -- Utilities: one line, and higher through the Bangalore summer.
      select cat_util, (d + 5 + (m % 4))::date,
             round(((2800 + 700 * sin(m * 2.2)
                     + case when extract(month from d) in (4, 5) then 1800 else 0 end) / 10)::numeric) * 10,
             case when extract(month from d) in (4, 5) then 'Summer — AC running most nights' end
      union all
      -- Groceries: two to four runs a month, on wandering days.
      select cat_groc, (d + 2 + ((g * 9 + m * 5) % 25))::date,
             round(((3600 + 1300 * sin(m * 1.3 + g * 2.1)) / 10)::numeric) * 10,
             case when g = 0 and extract(month from d) in (10, 11) then 'Diwali stock-up' end
      from generate_series(0, 1 + (m * 7 + 3) % 3) as g
      union all
      -- Food delivery: the category that actually repeats. Three to eight.
      select cat_delivery, (d + ((g * 11 + m * 3) % 28))::date,
             round(((700 + 340 * sin(m * 0.9 + g * 1.7)) / 10)::numeric) * 10,
             case when g = 0 and m % 9 = 4 then 'Long week — cooked nothing' end
      from generate_series(0, 3 + (m * 5 + 1) % 7) as g
      union all
      -- Eating out: one to three, and pricier than delivery.
      select cat_dining, (d + 4 + ((g * 13 + m * 7) % 22))::date,
             round(((2800 + 1300 * sin(m * 2.7 + g * 1.1)) / 10)::numeric) * 10,
             case when g = 0 and m % 5 = 2 then 'Birthday dinner' end
      from generate_series(0, (m * 3 + 2) % 3) as g
      union all
      -- Fuel and cabs: one to three.
      select cat_transport, (d + 1 + ((g * 8 + m * 11) % 26))::date,
             round(((2000 + 1100 * sin(m * 1.9 + g * 2.3)) / 10)::numeric) * 10,
             case when g = 0 and m % 7 = 3 then 'Airport cabs' end
      from generate_series(0, (m * 5 + 4) % 3) as g
      union all
      -- Shopping: skipped in most months, occasionally two in one.
      select cat_shopping, (d + 6 + ((g * 5 + m * 9) % 20))::date,
             round(((3500 + 2200 * sin(m * 3.3 + g * 0.7)) / 10)::numeric) * 10,
             case when extract(month from d) in (10, 11) then 'Festive sale' end
      from generate_series(1, case when m % 3 = 1 then 0 when m % 7 = 2 then 2 else 1 end) as g
      union all
      -- Odds and ends: usually there, sometimes not.
      select cat_misc, (d + 12 + ((g * 6 + m * 4) % 15))::date,
             round(((1400 + 900 * sin(m * 3.1 + g * 1.9)) / 10)::numeric) * 10,
             case when m % 4 = 1 then 'Haircut, laundry, repairs' end
      from generate_series(1, case when m % 5 = 3 then 0 else 1 + (m % 2) end) as g
    loop
      insert into public.expenses (user_id, phase_id, category_id, date, amount, note)
      values (u_id, ph_id, rec.cat, rec.dt, rec.amount, rec.note);
      if ph_id = p1 then p1_exp := p1_exp + rec.amount; else p2_exp := p2_exp + rec.amount; end if;
    end loop;
  end loop;

  -- ── The month in progress ──────────────────────────────────────────────
  -- The loop above stops at the last COMPLETE month, which left the demo's
  -- current month entirely empty: "this month" read ₹0 earned and ₹0 spent,
  -- and every recurring category looked unlogged. A part-logged month is both
  -- the honest state of a ledger on the 9th and the one that exercises the
  -- "did I forget to log something" nudge — Utilities, Dining out, Transport
  -- and Miscellaneous are deliberately left unlogged so it has something true
  -- to say. No salary row: pay lands at month end, which is exactly why every
  -- average on the dashboard excludes the month in progress.
  for rec in
    select * from (values
      (cat_rent,     2, 52000::numeric, null),
      (cat_subs,     3,  1497::numeric, null),
      (cat_groc,     4,  4120::numeric, null),
      (cat_delivery, 5,   780::numeric, null),
      (cat_delivery, 7,   640::numeric, null),
      (cat_groc,     8,  3260::numeric, 'Ran out of everything at once')
    ) as t(cat, dom, amount, note)
  loop
    d := (date_trunc('month', demo_today) + make_interval(days => rec.dom - 1))::date;
    insert into public.expenses (user_id, phase_id, category_id, date, amount, note)
    values (u_id, p2, rec.cat, d, rec.amount, rec.note);
    p2_exp := p2_exp + rec.amount;
  end loop;

  -- ── One-off incomes (month offset + day of month) ──────────────────────
  for rec in
    select * from (values
      (cat_bonus,     14, 28, 60000::numeric, 'Annual bonus'),
      (cat_bonus,     26, 27, 80000::numeric, 'Annual bonus'),
      (cat_freelance,  9, 18, 25000::numeric, 'Landing page project'),
      (cat_freelance, 23, 22, 30000::numeric, 'Dashboard consulting')
    ) as t(cat, mo, dom, amount, note)
  loop
    d := (base + make_interval(months => rec.mo, days => rec.dom - 1))::date;
    ph_id := case when d < pb then p1 else p2 end;
    insert into public.incomes (user_id, phase_id, category_id, date, amount, note)
    values (u_id, ph_id, rec.cat, d, rec.amount, rec.note);
    if ph_id = p1 then p1_inc := p1_inc + rec.amount; else p2_inc := p2_inc + rec.amount; end if;
  end loop;

  -- ── One-off expenses ───────────────────────────────────────────────────
  for rec in
    select * from (values
      (cat_travel,    3, 22, 34000::numeric, 'Goa trip'),
      (cat_travel,    9, 15, 28000::numeric, 'Himachal trek'),
      (cat_travel,   15, 24, 45000::numeric, 'Kerala with family'),
      (cat_travel,   20, 17, 30000::numeric, 'Coorg long weekend'),
      (cat_travel,   27, 20, 58000::numeric, 'Vietnam trip'),
      (cat_shopping,  2, 26,  9500::numeric, 'Winter clothes'),
      (cat_shopping,  8, 12,  7200::numeric, null),
      (cat_shopping, 13, 28, 14500::numeric, 'Festive season'),
      (cat_shopping, 18,  8,  6800::numeric, null),
      (cat_shopping, 25, 19, 15200::numeric, 'Festive season'),
      (cat_shopping, 31, 11,  8400::numeric, null),
      (cat_shopping, 33, 14, 145000::numeric, 'Laptop and phone — work setup refresh'),
      (cat_health,   10, 10, 18500::numeric, 'Health insurance premium'),
      (cat_health,   22, 10, 19800::numeric, 'Health insurance premium'),
      (cat_health,   34, 10, 21200::numeric, 'Health insurance premium'),
      (cat_health,   16, 21,  4500::numeric, 'Dental')
    ) as t(cat, mo, dom, amount, note)
  loop
    d := (base + make_interval(months => rec.mo, days => rec.dom - 1))::date;
    ph_id := case when d < pb then p1 else p2 end;
    insert into public.expenses (user_id, phase_id, category_id, date, amount, note)
    values (u_id, ph_id, rec.cat, d, rec.amount, rec.note);
    if ph_id = p1 then p1_exp := p1_exp + rec.amount; else p2_exp := p2_exp + rec.amount; end if;
  end loop;

  -- ── Asset classes ──────────────────────────────────────────────────────
  insert into public.asset_classes (user_id, name, expected_return, lock_weight) values (u_id, 'Equity', 12, 0)       returning id into ac_eq;
  insert into public.asset_classes (user_id, name, expected_return, lock_weight) values (u_id, 'Fixed income', 7, 60)  returning id into ac_fi;
  insert into public.asset_classes (user_id, name, expected_return, lock_weight) values (u_id, 'Gold', 9, 40)          returning id into ac_gold;
  insert into public.asset_classes (user_id, name, expected_return, lock_weight) values (u_id, 'Crypto', 15, 0)       returning id into ac_crypto;

  -- ── Investment 1: Nifty 50 index fund — SIP 20k, stepped up to 30k ─────
  insert into public.investments (user_id, name, asset_class_id, opened_on, notes)
  values (u_id, 'Nifty 50 Index Fund', ac_eq, (base + make_interval(months => 1, days => 4))::date, 'Core equity SIP')
  returning id into inv_nifty;
  val := 0;
  for m in 0..33 loop
    d := (base + make_interval(months => 1 + m, days => 4))::date;
    sip := case when m < 19 then 45000 else 62000 end;
    val := round(val * (1 + 0.030
                          + 0.045 * sin(m * 1.70)
                          + 0.030 * sin(m * 0.37)
                          + 0.020 * sin(m * 2.90)
                          - (case when m between  9 and 13 then 0.075
                                  when m between 23 and 26 then 0.052 else 0 end)
                       )::numeric) + sip;
    insert into public.investment_entries (user_id, investment_id, date, entry_type, amount, total_value_after, note)
    values (u_id, inv_nifty, d, 'contribution', sip, val, 'Monthly SIP');
    open_book := open_book + sip;
  end loop;

  -- ── Investment 2: Flexi cap fund — SIP 25k ─────────────────────────────
  insert into public.investments (user_id, name, asset_class_id, opened_on, notes)
  values (u_id, 'Flexi Cap Fund', ac_eq, (base + make_interval(months => 10, days => 7))::date, 'Satellite equity SIP')
  returning id into inv_flexi;
  val := 0;
  for m in 0..24 loop
    d := (base + make_interval(months => 10 + m, days => 7))::date;
    val := round(val * (1 + 0.032
                          + 0.050 * sin(m * 2.10 + 0.9)
                          + 0.028 * sin(m * 0.53)
                          - (case when m between  7 and 11 then 0.080
                                  when m between 18 and 20 then 0.050 else 0 end)
                       )::numeric) + 25000;
    insert into public.investment_entries (user_id, investment_id, date, entry_type, amount, total_value_after, note)
    values (u_id, inv_flexi, d, 'contribution', 25000, val, 'Monthly SIP');
    open_book := open_book + 25000;
  end loop;

  -- ── Investment 3: PPF — ₹50k/yr, steady 7.1% ───────────────────────────
  insert into public.investments (user_id, name, asset_class_id, opened_on, notes)
  values (u_id, 'PPF', ac_fi, (base + make_interval(months => 2, days => 9))::date, 'Tax-saving, 15y lock-in')
  returning id into inv_ppf;
  val := 0;
  for m in 0..32 loop
    d := (base + make_interval(months => 2 + m, days => 9))::date;
    val := round(val * 1.0059);
    if m in (0, 5, 17, 29) then
      val := val + 50000;
      insert into public.investment_entries (user_id, investment_id, date, entry_type, amount, total_value_after, note)
      values (u_id, inv_ppf, d, 'contribution', 50000, val, 'Annual deposit');
      open_book := open_book + 50000;
    elsif m % 4 = 0 then
      insert into public.investment_entries (user_id, investment_id, date, entry_type, amount, total_value_after)
      values (u_id, inv_ppf, d, 'valuation', 0, val);
    end if;
  end loop;

  -- ── Investment 4: Emergency FD — 3L + 1.5L top-up at ~6.9% ─────────────
  insert into public.investments (user_id, name, asset_class_id, opened_on, notes)
  values (u_id, 'Bank FD (Emergency)', ac_fi, (base + make_interval(months => 8, days => 14))::date, 'Emergency corpus')
  returning id into inv_fd;
  val := 0;
  for m in 0..26 loop
    d := (base + make_interval(months => 8 + m, days => 14))::date;
    val := round(val * 1.0056);
    if m = 0 or m = 14 then
      amt := case when m = 0 then 300000 else 150000 end;
      val := val + amt;
      insert into public.investment_entries (user_id, investment_id, date, entry_type, amount, total_value_after, note)
      values (u_id, inv_fd, d, 'contribution', amt, val, case when m = 0 then 'Initial FD' else 'Top-up' end);
      open_book := open_book + amt;
    elsif m % 4 = 2 then
      insert into public.investment_entries (user_id, investment_id, date, entry_type, amount, total_value_after)
      values (u_id, inv_fd, d, 'valuation', 0, val);
    end if;
  end loop;

  -- ── Investment 5: Sovereign gold bond — 1L lump sum ────────────────────
  insert into public.investments (user_id, name, asset_class_id, opened_on, notes)
  values (u_id, 'Sovereign Gold Bond 2032', ac_gold, (base + make_interval(months => 6, days => 11))::date, null)
  returning id into inv_sgb;
  val := 0;
  for m in 0..28 loop
    d := (base + make_interval(months => 6 + m, days => 11))::date;
    val := round(val * (1 + 0.012 + 0.02 * sin(m * 2.9))::numeric);
    if m = 0 then
      val := val + 100000;
      insert into public.investment_entries (user_id, investment_id, date, entry_type, amount, total_value_after, note)
      values (u_id, inv_sgb, d, 'contribution', 100000, val, 'RBI tranche');
      open_book := open_book + 100000;
    elsif m % 3 = 0 then
      insert into public.investment_entries (user_id, investment_id, date, entry_type, amount, total_value_after)
      values (u_id, inv_sgb, d, 'valuation', 0, val);
    end if;
  end loop;

  -- ── Investment 6: Bitcoin — 3 buys, volatile monthly valuations ────────
  insert into public.investments (user_id, name, asset_class_id, opened_on, notes)
  values (u_id, 'Bitcoin', ac_crypto, (base + make_interval(months => 4, days => 14))::date, 'Small speculative allocation')
  returning id into inv_btc;
  val := 0;
  for m in 0..30 loop
    d := (base + make_interval(months => 4 + m, days => 14))::date;
    val := round(val * (1 + 0.02 + 0.12 * sin(m * 2.3))::numeric);
    if m in (0, 7, 25) then
      val := val + 50000;
      insert into public.investment_entries (user_id, investment_id, date, entry_type, amount, total_value_after, note)
      values (u_id, inv_btc, d, 'contribution', 50000, val, 'Buy the dip');
      open_book := open_book + 50000;
    else
      insert into public.investment_entries (user_id, investment_id, date, entry_type, amount, total_value_after)
      values (u_id, inv_btc, d, 'valuation', 0, val);
    end if;
  end loop;

  -- ── Investment 7: ESOPs — exercised, grown, sold (closed) ──────────────
  -- Close-out mirrors app/investments/actions.ts: final withdrawal with
  -- total_value_after = 0, then a realized_gain source of proceeds − book.
  insert into public.investments (user_id, name, asset_class_id, status, opened_on, closed_on, notes)
  values (u_id, 'Company 1 ESOPs', ac_eq, 'closed',
          (base + make_interval(months => 3))::date,
          (base + make_interval(months => 21, days => 19))::date,
          'Vested options from the first job')
  returning id into inv_esop;
  insert into public.investment_entries (user_id, investment_id, date, entry_type, amount, total_value_after, note) values
    (u_id, inv_esop, (base + make_interval(months => 3))::date,            'contribution', 150000, 150000, 'Exercised vested options'),
    (u_id, inv_esop, (base + make_interval(months => 9))::date,            'valuation',    0,      175000, null),
    (u_id, inv_esop, (base + make_interval(months => 15))::date,           'valuation',    0,      205000, null),
    (u_id, inv_esop, (base + make_interval(months => 21))::date,           'valuation',    0,      235000, null),
    (u_id, inv_esop, (base + make_interval(months => 21, days => 19))::date, 'withdrawal', 240000, 0,      'Close-out');
  insert into public.money_sources (user_id, name, amount, date, kind, investment_id)
  values (u_id, 'Gain from Company 1 ESOPs', 90000, (base + make_interval(months => 21, days => 19))::date, 'realized_gain', inv_esop);
  ms_total := ms_total + 90000;

  -- ── Debt 1: phone on EMI — fully paid off (closed) ─────────────────────
  -- Closure mirrors app/debts/actions.ts: amount = principal − Σ payments.
  insert into public.debts (user_id, description, principal, total_payable, start_date, status, closed_on)
  values (u_id, 'Phone on EMI', 80000, 86004,
          (base + make_interval(months => 5, days => 4))::date, 'closed',
          (base + make_interval(months => 17, days => 4))::date)
  returning id into debt_phone;
  for m in 0..11 loop
    d := (base + make_interval(months => 6 + m, days => 4))::date;
    insert into public.debt_payments (user_id, debt_id, date, amount, note)
    values (u_id, debt_phone, d, 7167, 'EMI');
  end loop;
  insert into public.money_sources (user_id, name, amount, date, kind, debt_id)
  values (u_id, 'Interest realized on the phone EMI', 80000 - 86004,
          (base + make_interval(months => 17, days => 4))::date, 'debt_closure', debt_phone);
  ms_total := ms_total + (80000 - 86004);

  -- ── Debt 2: car loan — open, 13 EMIs paid ──────────────────────────────
  insert into public.debts (user_id, description, principal, total_payable, start_date)
  values (u_id, 'Car loan — 36 EMIs @ 9.2% (incl. ₹9k processing fee)', 500000, 572400,
          (base + make_interval(months => 21, days => 9))::date)
  returning id into debt_car;
  for m in 0..12 loop
    d := (base + make_interval(months => 22 + m, days => 9))::date;
    insert into public.debt_payments (user_id, debt_id, date, amount, note)
    values (u_id, debt_car, d, 15900, 'EMI');
    car_paid := car_paid + 15900;
  end loop;

  -- ── Remaining money sources ────────────────────────────────────────────
  insert into public.money_sources (user_id, name, amount, date, kind)
  values (u_id, 'Opening savings', 150000, base, 'opening_balance');
  ms_total := ms_total + 150000;

  insert into public.money_sources (user_id, name, amount, date, kind)
  values (u_id, 'Gift from parents', 50000, (base + make_interval(months => 15, days => 9))::date, 'manual');
  ms_total := ms_total + 50000;

  -- Phase rollover, exactly as app/phases/actions.ts computes it.
  -- (Excluded from ms_total: the cash identity skips phase_rollover rows.)
  insert into public.money_sources (user_id, name, amount, date, kind, phase_id)
  values (u_id, 'Rollover from SDE-1 at Company 1', p1_inc - p1_exp, pb - 1, 'phase_rollover', p1);

  -- ── Cash balances — derived from the net-worth identity so it reconciles:
  --    cash = money_sources(excl rollover) + Σ(income−expense) − open book + open principal outstanding
  cash := ms_total + (p1_inc - p1_exp) + (p2_inc - p2_exp) - open_book + (500000 - car_paid);
  if cash < 50000 then
    raise exception 'Derived cash came out too low (%) — seed math drifted, check totals.', cash;
  end if;
  -- A credit-card row carries a NEGATIVE balance. Without one, nothing in the
  -- demo exercised the split that keeps card debt off the assets side.
  -- The three still sum to `cash`, so the balance check stays at zero.
  insert into public.cash_balances (user_id, name, amount) values
    (u_id, 'Savings account', cash - 25000 + 48200),
    (u_id, 'Wallet & UPI', 25000),
    (u_id, 'HDFC Credit Card', -48200);

  -- ── Goals + glide paths (deadlines relative to the frozen today) ───────
  --
  -- created_at is NOT decorative here: lib/goals.ts reads it as the date the
  -- plan started, and projects the on-track corpus from it. Letting it default
  -- to now() made every goal zero months old, so the planned corpus today was
  -- zero, every per-class need was zero, and the waterfall reported "on track"
  -- for a goal 0.15% funded. Each goal is given the date its plan actually
  -- began, which is what makes the schedule verdict mean anything.
  --
  -- Emergency fund: due next month → exercises the waterfall's due-goal handling.
  insert into public.goals (user_id, name, description, end_date, present_cost, inflation_rate, created_at)
  values (u_id, 'Emergency fund', '6 months of expenses, always on call',
          (date_trunc('month', demo_today) + interval '1 month')::date, 550000, 0,
          (demo_today - make_interval(months => 18))::timestamptz)
  returning id into g_id;
  insert into public.goal_allocations (user_id, goal_id, asset_class_id, months_before_end, target_pct)
  values (u_id, g_id, ac_fi, 0, 100);

  insert into public.goals (user_id, name, description, end_date, present_cost, inflation_rate, created_at)
  values (u_id, 'Europe trip', '3 weeks across Italy and Spain',
          (date_trunc('month', demo_today) + interval '16 months')::date, 450000, 5,
          (demo_today - make_interval(months => 12))::timestamptz)
  returning id into g_id;
  insert into public.goal_allocations (user_id, goal_id, asset_class_id, months_before_end, target_pct) values
    (u_id, g_id, ac_eq, 24, 40),
    (u_id, g_id, ac_fi, 24, 60),
    (u_id, g_id, ac_fi, 0, 100);

  -- An achieved goal. Without one the demo never showed the achieved/archived
  -- state, which is how it shipped rendering "₹0 of the ₹0 that would reach ₹0"
  -- for every goal that was finished.
  insert into public.goals (user_id, name, description, end_date, present_cost, inflation_rate, status, created_at)
  values (u_id, 'Phone upgrade', 'Replaced the cracked one',
          (date_trunc('month', demo_today) - interval '4 months')::date, 90000, 6, 'achieved',
          (demo_today - make_interval(months => 20))::timestamptz)
  returning id into g_id;
  insert into public.goal_allocations (user_id, goal_id, asset_class_id, months_before_end, target_pct) values
    (u_id, g_id, ac_fi, 0, 100),
    (u_id, g_id, ac_fi, 16, 100);

  -- Two months old, and deliberately sharing Europe trip's date: the demo had
  -- no goal young enough to show "no history yet" and no tied due dates.
  insert into public.goals (user_id, name, description, end_date, present_cost, inflation_rate, created_at)
  values (u_id, 'New laptop', 'Replace the work machine',
          (date_trunc('month', demo_today) + interval '16 months')::date, 180000, 6,
          (demo_today - make_interval(months => 2))::timestamptz)
  returning id into g_id;
  insert into public.goal_allocations (user_id, goal_id, asset_class_id, months_before_end, target_pct) values
    (u_id, g_id, ac_fi, 0, 100),
    (u_id, g_id, ac_eq, 18, 30),
    (u_id, g_id, ac_fi, 18, 70);

  insert into public.goals (user_id, name, description, end_date, present_cost, inflation_rate, created_at)
  values (u_id, 'House down payment', '20% down on a 1.5cr flat',
          (date_trunc('month', demo_today) + interval '54 months')::date, 3000000, 7,
          (demo_today - make_interval(months => 24))::timestamptz)
  returning id into g_id;
  insert into public.goal_allocations (user_id, goal_id, asset_class_id, months_before_end, target_pct) values
    (u_id, g_id, ac_eq,   60, 70),
    (u_id, g_id, ac_fi,   60, 20),
    (u_id, g_id, ac_gold, 60, 10),
    (u_id, g_id, ac_eq,   24, 50),
    (u_id, g_id, ac_fi,   24, 40),
    (u_id, g_id, ac_gold, 24, 10),
    (u_id, g_id, ac_eq,    0, 20),
    (u_id, g_id, ac_fi,    0, 75),
    (u_id, g_id, ac_gold,  0, 5);

  insert into public.goals (user_id, name, description, end_date, present_cost, inflation_rate, created_at)
  values (u_id, 'Retirement', 'Financial independence at ~55',
          (date_trunc('month', demo_today) + interval '309 months')::date, 40000000, 6,
          (demo_today - make_interval(months => 30))::timestamptz)
  returning id into g_id;
  insert into public.goal_allocations (user_id, goal_id, asset_class_id, months_before_end, target_pct) values
    (u_id, g_id, ac_eq,     312, 75),
    (u_id, g_id, ac_fi,     312, 15),
    (u_id, g_id, ac_gold,   312, 5),
    (u_id, g_id, ac_crypto, 312, 5),
    (u_id, g_id, ac_eq,     120, 60),
    (u_id, g_id, ac_fi,     120, 30),
    (u_id, g_id, ac_gold,   120, 10),
    (u_id, g_id, ac_eq,       0, 30),
    (u_id, g_id, ac_fi,       0, 65),
    (u_id, g_id, ac_gold,     0, 5);

  -- ── Summary ────────────────────────────────────────────────────────────
  raise notice 'Seeded demo data for % (history % → %)', demo_email, base, m0;
  raise notice 'Phase 1 savings (rollover): %', p1_inc - p1_exp;
  raise notice 'Phase 2 savings so far: %', p2_inc - p2_exp;
  raise notice 'Open investment book: %', open_book;
  raise notice 'Derived cash (matches dashboard identity): %', cash;
end $$;


-- ══════════════════════════════════════════════════════════════════════════
-- Reseed: when the demo grows stale, run supabase/reseed_demo.sql to clear the
-- demo user's rows, then run this file again. That script is the only place
-- the deletion lives, so the order and the not-found guard stay in one copy.
