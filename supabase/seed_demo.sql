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

  -- Timeline anchors. m0 = first of the LAST COMPLETE month (nothing is ever
  -- dated in the future); base = month 0 of the 35-month history; pb = the
  -- phase boundary (start of the second job, month 19).
  m0   constant date := (date_trunc('month', current_date) - interval '1 month')::date;
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
  values (u_id, 'SDE1 — Google', base, pb - 1,
          null)
  returning id into p1;

  insert into public.phases (user_id, name, start_date, notes)
  values (u_id, 'SDE2 — Meta', pb, null)
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
    values (u_id, ph_id, cat_rent, d + 1, amt, null);
    if ph_id = p1 then p1_exp := p1_exp + amt; else p2_exp := p2_exp + amt; end if;

    -- variable monthlies (deterministic sin-based wiggle, rounded to ₹10)
    for rec in
      select * from (values
        (cat_subs,      d + 2,  999::numeric),
        (cat_groc,      d + 5,  round(((7800 + 600 * sin(m * 1.3)) / 10)::numeric) * 10),
        (cat_util,      d + 7,  round(((2100 + 300 * sin(m * 2.2)) / 10)::numeric) * 10),
        (cat_dining,    d + 13, round(((4200 + 900 * sin(m * 2.7)) / 10)::numeric) * 10),
        (cat_transport, d + 19, round(((2400 + 400 * sin(m * 1.9)) / 10)::numeric) * 10),
        (cat_misc,      d + 24, round(((1800 + 700 * sin(m * 3.1)) / 10)::numeric) * 10)
      ) as t(cat, dt, amount)
    loop
      insert into public.expenses (user_id, phase_id, category_id, date, amount)
      values (u_id, ph_id, rec.cat, rec.dt, rec.amount);
      if ph_id = p1 then p1_exp := p1_exp + rec.amount; else p2_exp := p2_exp + rec.amount; end if;
    end loop;
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
  insert into public.asset_classes (user_id, name, expected_return) values (u_id, 'Equity', 12)       returning id into ac_eq;
  insert into public.asset_classes (user_id, name, expected_return) values (u_id, 'Fixed income', 7)  returning id into ac_fi;
  insert into public.asset_classes (user_id, name, expected_return) values (u_id, 'Gold', 9)          returning id into ac_gold;
  insert into public.asset_classes (user_id, name, expected_return) values (u_id, 'Crypto', 15)       returning id into ac_crypto;

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
  values (u_id, 'Google ESOPs', ac_eq, 'closed',
          (base + make_interval(months => 3))::date,
          (base + make_interval(months => 21, days => 19))::date,
          'Google vested options')
  returning id into inv_esop;
  insert into public.investment_entries (user_id, investment_id, date, entry_type, amount, total_value_after, note) values
    (u_id, inv_esop, (base + make_interval(months => 3))::date,            'contribution', 150000, 150000, 'Exercised vested options'),
    (u_id, inv_esop, (base + make_interval(months => 9))::date,            'valuation',    0,      175000, null),
    (u_id, inv_esop, (base + make_interval(months => 15))::date,           'valuation',    0,      205000, null),
    (u_id, inv_esop, (base + make_interval(months => 21))::date,           'valuation',    0,      235000, null),
    (u_id, inv_esop, (base + make_interval(months => 21, days => 19))::date, 'withdrawal', 240000, 0,      'Close-out');
  insert into public.money_sources (user_id, name, amount, date, kind, investment_id)
  values (u_id, 'Gain from Google ESOPs', 90000, (base + make_interval(months => 21, days => 19))::date, 'realized_gain', inv_esop);
  ms_total := ms_total + 90000;

  -- ── Debt 1: phone EMI — fully paid off (closed) ────────────────────────
  -- Closure mirrors app/debts/actions.ts: amount = principal − Σ payments.
  insert into public.debts (user_id, description, principal, total_payable, start_date, status, closed_on)
  values (u_id, 'iPhone 15 EMI', 80000, 86004,
          (base + make_interval(months => 5, days => 4))::date, 'closed',
          (base + make_interval(months => 17, days => 4))::date)
  returning id into debt_phone;
  for m in 0..11 loop
    d := (base + make_interval(months => 6 + m, days => 4))::date;
    insert into public.debt_payments (user_id, debt_id, date, amount, note)
    values (u_id, debt_phone, d, 7167, 'EMI');
  end loop;
  insert into public.money_sources (user_id, name, amount, date, kind, debt_id)
  values (u_id, 'Interest realized on iPhone 15 EMI', 80000 - 86004,
          (base + make_interval(months => 17, days => 4))::date, 'debt_closure', debt_phone);
  ms_total := ms_total + (80000 - 86004);

  -- ── Debt 2: car loan — open, 13 EMIs paid ──────────────────────────────
  insert into public.debts (user_id, description, principal, total_payable, start_date)
  values (u_id, 'Car loan — Hyundai Creta', 500000, 610000,
          (base + make_interval(months => 21, days => 9))::date)
  returning id into debt_car;
  for m in 0..12 loop
    d := (base + make_interval(months => 22 + m, days => 9))::date;
    insert into public.debt_payments (user_id, debt_id, date, amount, note)
    values (u_id, debt_car, d, 16950, 'EMI');
    car_paid := car_paid + 16950;
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
  values (u_id, 'Rollover from SDE1 — Google', p1_inc - p1_exp, pb - 1, 'phase_rollover', p1);

  -- ── Cash balances — derived from the net-worth identity so it reconciles:
  --    cash = money_sources(excl rollover) + Σ(income−expense) − open book + open principal outstanding
  cash := ms_total + (p1_inc - p1_exp) + (p2_inc - p2_exp) - open_book + (500000 - car_paid);
  if cash < 50000 then
    raise exception 'Derived cash came out too low (%) — seed math drifted, check totals.', cash;
  end if;
  insert into public.cash_balances (user_id, name, amount) values
    (u_id, 'Savings account', cash - 25000),
    (u_id, 'Wallet & UPI', 25000);

  -- ── Goals + glide paths (deadlines relative to today) ──────────────────
  -- Emergency fund: due next month → exercises the waterfall's due-goal handling.
  insert into public.goals (user_id, name, description, end_date, present_cost, inflation_rate)
  values (u_id, 'Emergency fund', '6 months of expenses, always on call',
          (date_trunc('month', current_date) + interval '1 month')::date, 600000, 0)
  returning id into g_id;
  insert into public.goal_allocations (user_id, goal_id, asset_class_id, months_before_end, target_pct)
  values (u_id, g_id, ac_fi, 0, 100);

  insert into public.goals (user_id, name, description, end_date, present_cost, inflation_rate)
  values (u_id, 'Europe trip', '3 weeks across Italy and Spain',
          (date_trunc('month', current_date) + interval '16 months')::date, 450000, 5)
  returning id into g_id;
  insert into public.goal_allocations (user_id, goal_id, asset_class_id, months_before_end, target_pct) values
    (u_id, g_id, ac_eq, 24, 40),
    (u_id, g_id, ac_fi, 24, 60),
    (u_id, g_id, ac_fi, 0, 100);

  insert into public.goals (user_id, name, description, end_date, present_cost, inflation_rate)
  values (u_id, 'House down payment', '20% down on a 1.5cr flat',
          (date_trunc('month', current_date) + interval '54 months')::date, 3000000, 7)
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

  insert into public.goals (user_id, name, description, end_date, present_cost, inflation_rate)
  values (u_id, 'Retirement', 'Financial independence at ~55',
          (date_trunc('month', current_date) + interval '309 months')::date, 30000000, 6)
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
