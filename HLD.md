# Finance Tracker — High-Level Design

A personal finance tracker for a single user (you). Tracks expenses, income, investments, debt, and cash positions across "phases" of life, and shows a unified net-worth dashboard.

Mirrors the stack and conventions of the sibling `calorie-tracker` project.

---

## 1. Tech Stack

| Layer       | Choice                                     |
|-------------|--------------------------------------------|
| Frontend    | Next.js 16 (App Router) + React 19 + TS    |
| Styling     | Tailwind v4                                |
| Charts      | Recharts                                   |
| Dates       | date-fns                                   |
| Backend     | Supabase (Postgres + Auth + RLS)           |
| Auth        | Supabase email-link or email/password      |
| Hosting     | Vercel                                     |

All business logic runs in Next.js (server components + route handlers). Supabase is the system of record. RLS makes every row owner-only — same pattern as `calorie-tracker/supabase/schema.sql`.

---

## 2. Domain Model

### 2.1 Phase
A period of life (e.g. "Job at Gokwik", "Sabbatical 2027"). Bounded by `start_date` and an optional `end_date`. At most one phase is "current" (open). When you close a phase, its **savings get materialized as a money source** (see §4).

### 2.2 Expense
`(date, category, amount, phase_id)` — every expense belongs to exactly one phase, inferred from its date.

### 2.3 Income
`(date, category, amount, phase_id)` — same shape as expense, opposite sign in analytics.

### 2.4 Category
User-defined, scoped to either `expense` or `income`. Stored as a separate table so totals don't break when you rename one. **Rename is allowed freely** (unique within `(user_id, kind)`). **Deletion is restricted** — you can't delete a category while any expense/income entry references it; reassign or delete those first.

### 2.5 Investment
A named investment instrument (e.g. "Zerodha Nifty 50 SIP", "ICICI Pru ULIP"). **Not** scoped to a phase. Has a series of `investment_entries`, an `opened_on` date (set to the first entry's date at creation; not derived later), and a `status` (`open` / `closed`) with optional `closed_on`. **Status is set explicitly** by the close action — never auto-derived from `total_value_after = 0`, since a position can legitimately drop to zero NAV without being closed.

Every `investment_entry` carries three things:
- `date`
- `amount` — the cash flow size (≥ 0; semantics from `entry_type`)
- `total_value_after` — cumulative current total value of the investment immediately after this entry (≥ 0)

`entry_type` is one of:
- **`contribution`** — `amount` is cash flowing out of your pocket into the investment. `total_value_after` is the new NAV.
- **`withdrawal`** — `amount` is cash flowing back to your pocket. `total_value_after` is the residual NAV after the withdrawal. Closing the investment is just a withdrawal of the full proceeds with `total_value_after = 0`.
- **`valuation`** — pure mark-to-market with no cash flow. `amount = 0`, `total_value_after = current NAV`. Used for monthly NAV updates between transactions.

Dividends / yields are **out of scope for v1**. If you receive a payout that isn't a sale, model it as a withdrawal + updated total_value.

### 2.6 Debt
A loan account. Has `principal`, `total_payable`, `start_date`, `description`, `status`. Has a series of **EMI payment** entries. Pending = `total_payable − Σ payments`.

### 2.7 Cash Balance
A named, **purely manual** bucket (e.g. "HDFC Savings", "Wallet Cash"). One row = `(name, amount, updated_at)`. The app never auto-mutates cash. You update each entry when you reconcile (e.g. monthly, or after a notable transaction). The dashboard surfaces a **cash discrepancy** indicator (§3) that tells you how stale your cash totals are.

### 2.8 Money Source
An additional pot of money outside cash/investments. Each entry: `(name, amount, date, kind)` with `amount` signed (negative entries are allowed). `kind ∈`:
- `manual` — user-added (gift, inherited corpus, etc.). Amount typically positive.
- `opening_balance` — single entry created during onboarding to balance the books from day one.
- `phase_rollover` — auto-created when a phase is closed; amount = savings of that phase; `phase_id` set.
- `realized_gain` — auto-created when an investment is closed; amount = `proceeds − pre_close_book`, can be negative (loss); `investment_id` set.
- `debt_closure` — auto-created when a debt is closed; amount = `principal − Σ debt_payments`, typically negative (the realized interest cost); `debt_id` set.

---

## 3. The Net-Worth Identity & Cash Discrepancy

There is **one** net-worth number:

```
NW = Σ invest_market + Σ cash − Σ debt.pending
```

It must equal a second expression built from flow-side records:

```
NW = unrealized_net + Σ money_sources + current_phase_savings
```

where:

```
unrealized_net = Σ (invest_market − invest_book) over open investments
               − Σ (total_payable − principal)    over open debts
current_phase_savings = Σ income(current phase) − Σ expense(current phase)
money_sources includes all kinds: manual, opening_balance, phase_rollover,
                                  realized_gain, debt_closure
```

The **cash discrepancy** is the residual:

```
cash_discrepancy = (unrealized_net + Σ money_sources + current_phase_savings) − NW
```

If it's non-zero, your cash entries are out of date — by exactly that much. Positive = cash is **under-stated** (you forgot to add e.g. an income inflow or a loan disbursement); negative = cash is **over-stated** (you forgot to reduce e.g. for an expense, EMI, or investment contribution).

### 3.1 How every flow moves the books

Cash is **never auto-updated by the app** — you edit it manually when you reconcile. The table below shows the **app-side effects** (what gets recorded automatically) and the **expected cash change** (what you should later apply when you sync your cash entries). The cash discrepancy indicator catches drift between the two.

| Action                          | App-side effect                                              | Expected cash change (manual) |
|---------------------------------|--------------------------------------------------------------|-------------------------------|
| Add income ₹Y                   | current_phase_savings +Y                                     | cash +Y                       |
| Add expense ₹Z                  | current_phase_savings −Z                                     | cash −Z                       |
| Add contribution (amount X, value V) | insert investment_entry(contribution, X, V) — invest_book +X, invest_market = V | cash −X |
| Add withdrawal (amount W, value V)   | insert investment_entry(withdrawal, W, V) — invest_book −W, invest_market = V (the row carries both the cash flow and the post-withdrawal NAV — no separate valuation row) | cash +W |
| Add valuation entry (value V)   | insert investment_entry(valuation, 0, V) — invest_market = V | (none) |
| Take loan (principal P, total_payable T) | debt.pending +T, debt_interest_commit +(T−P)        | cash +P                       |
| Add EMI ₹E                      | debt.pending −E                                              | cash −E                       |
| Close investment (final withdrawal of W) | insert withdrawal(amount=W, total_value_after=0); set status='closed'; money_sources +(W − pre_close_book), kind=`realized_gain`. Investment now excluded from open-aggregates | cash +W |
| Close debt (paid X total, principal P) | debt excluded from `interest_commit` & `debt_pending`; money_sources +(P − X), kind=`debt_closure` | (none — accounting only) |
| Close phase with savings S      | money_sources +S, kind=`phase_rollover`; savings → 0         | (none — internal transfer)    |

**EMIs do not pass through expenses.** Loan interest is recognized once at debt creation as `debt_interest_commitment = total_payable − principal` and shows up as a negative term in `unrealized_net`.

### 3.2 The dashboard view

```
Net Worth                            ₹ X
  Investments (market)               ₹ a
  Cash                               ₹ b
  Debt pending (incl. future interest) −₹ c

Cash Discrepancy                     ₹ d         ← ideally ₹0
  Oldest cash entry last updated: 12 days ago     (min(updated_at) across cash rows)
  Likely cause: missing expense/income, or cash needs syncing

Drift composition (informational)
  Unrealized investment gains        +₹ g
  Debt interest committed            −₹ i
  Net unrealized                     ₹ g − i
  Money sources total                ₹ ms
  Current phase savings              ₹ cps
```

A "Sync cash" button on the dashboard lets you pick which cash entry to adjust by exactly `cash_discrepancy` (one-click reconciliation).

### 3.3 Realized PnL on close (investments and debts)

When you close an instrument, an unrealized item on the books becomes realized. We materialize a `money_sources` entry so the identity stays exact. **`NW` is unchanged when the close just transfers between unrealized and realized buckets (full-pay debt, sale at market). `NW` legitimately moves when the close itself represents a real economic event** — e.g. creditor forgives part of a loan, or an investment is sold above/below its last marked NAV.

**Investment close** (kind=`realized_gain`, `investment_id` set):
```
amount = proceeds − pre_close_book_value
```
Signed: loss = negative amount. Same kind, distinguished by sign. User-facing label: "Gain from <name>" or "Loss from <name>".

**Debt close** (kind=`debt_closure`, `debt_id` set):
```
amount = principal − Σ debt_payments
```

Two cases:

1. **Fully paid** (`Σ debt_payments = total_payable`): `amount = −(total_payable − principal)` = full interest committed as realized loss. NW **unchanged** at close — `interest_commit` drops by I, `money_sources` drops by I, they cancel.

2. **Settled / forgiven** (`Σ debt_payments < total_payable`, you close anyway): NW **does move** — and it should. The unpaid remainder is a real windfall. Trace: P=100, T=130, paid 50, close.
   - `debt_pending` drops by 80 (the unpaid amount): `NW += 80`.
   - `interest_commit` drops by 30, `unrealized_net += 30`.
   - `money_sources += (100 − 50) = +50` (realized gain — creditor wrote off the rest).
   - Identity: `expected_NW` Δ = +30 + 50 = +80 = NW Δ. ✓
   - That +80 is the realized value of debt forgiveness. Correct economic behavior.

Same for investments: selling at exactly the last marked NAV → NW unchanged; selling above/below NAV → NW moves by the surprise, which the realized_gain captures.

### 3.4 Initial seed (onboarding opening balance)
On first run, after you enter existing cash, investments, and debts, the app computes:

```
opening_balance = NW_target − unrealized_net − current_phase_savings
                = NW_target − unrealized_net      (no entries yet)
```

Where `NW_target = invest_market + cash − debt_pending` at the moment of onboarding. The app creates one `money_sources(kind='opening_balance')` row of that amount so the identity holds from day one. See §8.1 for the step-by-step.

### 3.5 Edit / delete semantics

| Entity | Edit allowed when… | Delete allowed when… | Notes |
|--------|--------------------|----------------------|-------|
| Expense / income | In current phase, any field | In current phase | Editing amount moves `cash_discrepancy` by the delta — show a toast: "Cash discrepancy moved by ₹X — sync cash" |
| Expense / income in **closed** phase | Never | Never | Locked; would invalidate the phase's materialized rollover |
| Cash balance | Always (it's the user's manual source of truth) | Always | Deleting a row reduces `cash`; affects `cash_discrepancy` |
| Investment | Name editable; `opened_on` and `status` not | Only if no entries beyond the first contribution **and** investment is open | |
| Investment entry (open investment) | Latest entry editable; earlier entries locked | Latest entry only, and never the founding entry (would violate "every investment has ≥1 entry") | Editing latest valuation just moves `invest_market` |
| Investment entry (closed investment) | Never | Never | Including the closing withdrawal — undo the close from the investment detail page instead (not v1) |
| Debt | Description editable; `principal`, `total_payable`, `start_date`, `status` not | Only if no `debt_payments` and `status='open'` | |
| Debt payment | Latest payment editable / deletable when debt is open | Same | Editing moves `cash_discrepancy` |
| Debt payment (closed debt) | Never | Never | |
| Money source (manual) | Always | Always | Affects `cash_discrepancy` |
| Money source (auto: `phase_rollover`, `opening_balance`, `realized_gain`, `debt_closure`) | **Never via UI** | Never via UI | Created/removed only as a side effect of the parent action (close phase / close investment / close debt / onboarding) |
| Category | Rename freely (uniqueness enforced) | Only if zero linked expenses/incomes | |
| Phase | Name editable. **First phase's `start_date`: editable as long as no entry pre-dates the new start_date.** All other phase dates: immutable | Never | The first-phase carve-out is the v1 escape hatch for an onboarding mistake. For any other phase-date repair, use a SQL "danger zone" — out of scope for v1 |

Default UX rule: when an edit or delete moves `cash_discrepancy`, show a toast reminder. Otherwise just save silently.

---

## 4. Phase Lifecycle

```
[draft] ──open──▶ [current] ──close──▶ [closed]
                       │
                       ├── all new expenses/incomes auto-attach here
                       └── on close: compute savings, create money_source(kind=phase_rollover)
```

Constraints:
- Exactly one phase has `end_date IS NULL` (the current one). Creating a new phase is an atomic transaction that closes the current one and opens the new one.
- A new phase's `start_date` = previous phase's `end_date + 1 day`. No gaps, no overlaps.
- Expenses/incomes get their `phase_id` from the phase whose date-range contains the entry's `date` (set at creation; never recomputed because phase dates are immutable, below).
- **No back-dating into closed phases.** Date pickers on expense/income forms cap at the current phase's `start_date` (or later).
- **Phase mutability:** `name` is editable. `start_date`, `end_date`, and the phase itself are immutable — phases cannot be deleted (allowing it would leave the timeline with a gap, or strand the rollover money_source from a closed phase). Mistakes in dates have to be lived with.

---

## 5. Database Schema (Supabase Postgres)

All tables: `id uuid PK`, `user_id uuid → auth.users`, `created_at timestamptz`. RLS: owner-only (same pattern as calorie-tracker).

All child tables include `user_id` directly (denormalized from parent) so RLS policies remain a simple `auth.uid() = user_id` — mirrors calorie-tracker. The app copies `user_id` from parent on insert; FKs to parent enforce referential integrity.

```sql
phases (id, user_id, name, start_date, end_date NULL, notes)
  -- partial unique idx: one open phase per user (where end_date is null)
  -- start_date, end_date immutable after creation (enforced in app)
  -- exception: first-ever phase's start_date editable if no entry pre-dates it (§3.5)

categories (id, user_id, name, kind CHECK kind IN ('expense','income'))
  -- unique (user_id, kind, name)
  -- deletion restricted via FK from expenses/incomes (ON DELETE RESTRICT)

expenses (id, user_id, phase_id, category_id, date, amount CHECK > 0, note)
incomes  (id, user_id, phase_id, category_id, date, amount CHECK > 0, note)

investments (id, user_id, name, kind, status CHECK IN ('open','closed'),
             opened_on, closed_on NULL, notes)
  -- status='closed' set explicitly by the close action, not derived

investment_entries (
  id, user_id, investment_id, date,
  entry_type CHECK IN ('contribution','withdrawal','valuation'),
  amount             CHECK >= 0,    -- 0 for valuation, > 0 for contribution/withdrawal
  total_value_after  CHECK >= 0,    -- cumulative NAV after this entry, always required
  note,
  CHECK ((entry_type = 'valuation') = (amount = 0))
)

debts (id, user_id, description, principal CHECK > 0, total_payable CHECK >= principal,
       start_date, status CHECK IN ('open','closed'), closed_on NULL)

debt_payments (id, user_id, debt_id, date, amount CHECK > 0, note)

cash_balances (id, user_id, name, amount CHECK >= 0, updated_at)

money_sources (
  id, user_id, name, amount, date,           -- amount is signed
  kind CHECK IN ('manual','opening_balance','phase_rollover','realized_gain','debt_closure'),
  phase_id      NULL,
  investment_id NULL,
  debt_id       NULL,
  CHECK ((kind = 'phase_rollover')  = (phase_id IS NOT NULL)),
  CHECK ((kind = 'realized_gain')   = (investment_id IS NOT NULL)),
  CHECK ((kind = 'debt_closure')    = (debt_id IS NOT NULL))
)
```

Indexes:
- `expenses (user_id, phase_id, date desc)`, same for `incomes`.
- `investment_entries (investment_id, date)`.
- `debt_payments (debt_id, date)`.

---

## 6. Key Calculations

### 6.1 Monthly average (per phase, per category)
```
months_in_phase = max(1, differenceInCalendarMonths(
                          coalesce(phase.end_date, today),
                          phase.start_date) + 1)
avg_expense_cat = Σ amount where phase_id=P, category_id=C / months_in_phase
```
Calendar-month based (e.g. Jan 15 → Mar 14 counts as 3 months — Jan, Feb, Mar). Same for income. `avg_savings = avg_income_total − avg_expense_total`.

Edge case: phases under 7 days show "N/A" instead of a misleading average.

### 6.2 XIRR (per investment, and portfolio-wide)
Build a cash-flow series from `investment_entries`:
```
contribution entry  → cash flow = −amount on its date
withdrawal entry    → cash flow = +amount on its date (includes the close-out withdrawal)
valuation entry     → skipped (no cash flow, only NAV update)
if status='open': append synthetic +latest total_value on today's date
```
Solve `Σ cf_i / (1+r)^((date_i − date_0)/365) = 0` via Newton-Raphson with initial guess r = 0.1. Library option: `node-xirr` or hand-roll (~30 lines).

Portfolio XIRR: concatenate cash flows from **all** investments (open + closed) and run the same solver. Each currently-open investment contributes one synthetic +`total_value_after` cash flow on today's date; closed investments contribute their actual closing-withdrawal cash flow and no synthetic.

### 6.3 Debt pending, interest, and close
```
pending  = total_payable − Σ debt_payments.amount             -- per open debt
interest = total_payable − principal                          -- fixed at creation
interest_commit (dashboard) = Σ interest over open debts
```

**On close** (either auto, when pending hits 0, or manual for settlements / forgiveness):
```
debt_closure_amount = principal − Σ debt_payments.amount
                  → inserted into money_sources(kind='debt_closure', debt_id=this)
```
Sign: negative = realized interest loss (paid more than borrowed); positive = realized gain (forgiven / settled below principal). The debt is then excluded from `pending` and `interest_commit` aggregates. See §3.3 for the math.

### 6.4 Net worth & cash discrepancy (dashboard)
```
invest_market    = per open investment: total_value_after of the latest entry by date
                                        (any entry_type; every investment has ≥1 entry by §2.5)
                   per closed investment: 0 (proceeds already in cash)
invest_book      = per investment: Σ contribution.amount − Σ withdrawal.amount
                                   (can be negative after partial-withdrawal-with-gain;
                                    closed contributes 0 to the aggregate)
cash             = Σ cash_balances.amount
debt_pending     = Σ debts.pending where status='open'
unrealized_inv   = Σ (invest_market − invest_book) for open investments
interest_commit  = Σ (total_payable − principal) for open debts
unrealized_net   = unrealized_inv − interest_commit
money_sources    = Σ money_sources.amount (all kinds, signed)
phase_savings    = Σ income(current_phase) − Σ expense(current_phase)

NW               = invest_market + cash − debt_pending               -- the headline
expected_NW      = unrealized_net + money_sources + phase_savings    -- should equal NW
cash_discrepancy = expected_NW − NW                                   -- ideally 0
```

`cash_discrepancy` is the dashboard's primary reconciliation signal. The dashboard also lists `unrealized_net`, `money_sources`, `phase_savings` as informational sub-totals so you can see how the identity decomposes.

Note: every investment has at least one entry (since you create the investment by adding its first contribution + initial value), so `invest_market` is always well-defined for open investments.

---

## 7. App Structure

Routes (Next.js App Router):
```
/                         Dashboard (NW, cash discrepancy, charts)
/auth/login               Supabase auth
/phases                   List + create + close phase
/expenses                 List, add, edit, filter by phase/category/date
/incomes                  List, add, edit, filter by phase/category/date
/investments              List (open + closed), portfolio XIRR
/investments/[id]         Detail: entries, XIRR, current value, close
/investments/valuations   Bulk "Update Valuations" — pure valuation entries across all open investments
/debts                    List
/debts/[id]               Detail: EMI history, pending, close
/cash                     Cash balances (inline editable rows; "Sync to discrepancy" button)
/money-sources            List + add manual entry
/settings                 Categories (CRUD)
```

Server components fetch via Supabase server client (`lib/supabase/server.ts`, same as calorie-tracker). Forms are client components that call route handlers under `app/api/...` or use server actions.

### Layout shell
- Top nav with nine sections: Dashboard, Phases, Expenses, Incomes, Investments, Debts, Cash, Money sources, Settings.
- Persistent "current phase" badge in the header.
- Dashboard is the landing page after login.

---

## 8. UX Flows

### 8.1 First-time onboarding
1. Sign up → create first phase (e.g. "Initial") with today as start_date.
2. Add categories yourself in the Categories section (no defaults seeded — start empty).
3. Add cash balances (one row per bank/wallet).
4. Add existing investments via the regular "Add investment" form. The first entry takes `amount = original cost` (so `invest_book` reflects what you paid) and `total_value_after = current NAV` (so `invest_market` is correct). If you don't remember the original cost, use the current value for both — you'll lose unrealized-gain reporting on that position but the books still balance.
5. Add existing debts via the regular "Add debt" form. Treat them as if they start today: use `current_outstanding` as principal and `current_outstanding + remaining_expected_interest` as total_payable.
6. App computes the implied opening balance and creates a `money_sources(kind='opening_balance')` row to make the books balance.

### 8.2 Daily use
- "Add expense" / "Add income" are one-tap actions from the dashboard.
- Investment NAV updates: a dedicated "Update Valuations" screen — no automatic reminders; you update when you have data.
- Closing a phase: confirm dialog showing computed savings, then creates the rollover money source.

---

## 9. Locked-in Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Currency | INR only (v1) |
| 2 | Unrealized investment gains | Show single NW + cash discrepancy + drift composition on dashboard (§3) |
| 3 | EMI ↔ expense | EMIs do **not** flow through expenses. Interest is recognized once at debt creation as `interest_commitment = total_payable − principal` and shown as a drift component |
| 4 | Categories | No defaults seeded. User adds via Categories section. **Deletion restricted** when in use |
| 5 | Investment valuation cadence | Dedicated "Update Valuations" screen, no nudges |
| 6 | Authentication | Open signup with Supabase RLS (same as calorie-tracker) |
| 7 | Phase rollover composition | Phase savings = income − expense only. Investments made during the phase do **not** reduce rollover (they're transfers, not consumption) |
| 8 | Cash balances | Purely manual. Never auto-mutated. Dashboard surfaces `cash_discrepancy` (§3) |
| 9 | Realized investment loss | Same as gain — a negative-amount `realized_gain` entry. No separate "realized_loss" kind. `money_sources.amount` is signed |
| 10 | Investment dividends / yields | Out of scope v1. Model as withdrawal + valuation update if it happens |
| 11 | Back-dating into closed phases | Forbidden. Date pickers cap at current phase's `start_date` |
| 12 | Existing debt at onboarding | No special flow. Use regular "Add debt" form: `principal = current outstanding`, `total_payable = outstanding + remaining interest` |
| 13 | Partial withdrawal | "Add withdrawal" form requires the user to enter the new post-withdrawal NAV. **Stored as a single `withdrawal` row** carrying both `amount` and `total_value_after` — no separate valuation row inserted |
| 14 | `money_sources.date` | Kept (used for chronological sorting in UI) |
| 15 | Investment entry shape | Every entry carries `(date, amount, total_value_after)`. `entry_type` ∈ {contribution, withdrawal, valuation}. Valuation entries have `amount = 0` |
| 16 | Debt close | Materializes `money_sources(kind='debt_closure', amount = principal − Σ payments)`. Negative = realized interest loss; positive = forgiven / settled below principal. Allowed manually (settlement) as well as auto on `pending=0` |
| 17 | Phase mutability | Name editable. Start/end dates immutable. Phases cannot be deleted |
| 18 | Cash discrepancy hint | "Oldest cash entry updated N days ago" — uses `min(updated_at)` across cash rows |
| 19 | Edit / delete semantics | Codified in §3.5. Key rules: entries in closed phases / investments / debts are immutable; auto-created `money_sources` rows are immutable in UI; cash-balance edits silently update NW |
| 20 | Phase-date escape hatch | The first-ever phase's `start_date` is editable provided no entry pre-dates the new value. All other phase-date repairs require SQL access — out of scope for v1 |
| 21 | Portfolio XIRR scope | Includes **both open and closed** investments (lifetime IRR). Per the user spec ("with all the open and closed investments… total invested amount and XIRR value") |
| 22 | Toast on cash-impacting edits | When an edit or delete moves `cash_discrepancy`, show a non-blocking toast: "Cash discrepancy moved by ₹X — sync cash" |
| 23 | Dashboard debt line label | "Debt pending (incl. future interest)" — accurately reflects `pending = total_payable − Σpayments` without implying it's principal-only |
| 24 | Settlement workflow | To settle a debt at less than total payable: add a final `debt_payment` for the actual settlement amount, then close. The close materializes `principal − Σpayments` (positive if forgiven) |

---

## 10. Build Plan (suggested order)

1. **Scaffold** — copy calorie-tracker's structure: package.json, tsconfig, tailwind, supabase clients, middleware, auth pages.
2. **Schema migration** — `supabase/schema.sql` with all tables + RLS.
3. **Phases + Categories** — minimal CRUD, no analytics yet.
4. **Expenses + Incomes** — CRUD with phase auto-attach.
5. **Cash balances + Money sources** — inline editable lists. (The "Sync to discrepancy" button on `/cash` is wired up in step 8 once `cash_discrepancy` is computable.)
6. **Investments + XIRR** — list, detail page, entries, solver.
7. **Debts + EMIs** — list, detail, pending calc.
8. **Dashboard** — net worth, cash discrepancy, monthly averages, charts.
9. **Onboarding flow** — opening balance computation.
10. **Polish** — export to CSV, mobile layout.

Each milestone is deployable on Vercel independently.
