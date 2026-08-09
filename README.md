# Finance Tracker

**[▶ Try the live demo](https://finance-tracker-henna-six.vercel.app/demo)** — three years of a fictional ledger, no sign-up.
&nbsp;·&nbsp; [Live app](https://finance-tracker-henna-six.vercel.app/) (passwordless sign-in)

A self-hosted personal finance dashboard built around one idea: **your net worth should be explainable**. Every rupee is accounted for through a strict identity — income minus expenses becomes savings, savings become investments or cash, and investments are measured against inflation-adjusted life goals. Next.js and Supabase, mobile-first.

> The app is four screens, one per question you actually ask: **Home** (where do I stand), **Cashflow** (where does the money go), **Holdings** (what do I own and owe), **Plan** (will I get what I'm saving for). It used to be nine screens named after database tables.

## Features

- **Net worth, with its arithmetic on screen** — `invested + cash − debt = net worth`, plus a parity check that derives cash a second way from the ledger and reports the difference. It reads "Books balance" at zero and names the gap when it isn't zero. That check has caught real errors nothing else would have.
- **Phases** — income and expenses are scoped to a period of life (a job, a sabbatical). Exactly one is open at a time, enforced by a partial unique index. Closing one materialises its savings as a money source, so the ledger of *where capital came from* stays intact.
- **Cashflow** — this month at a glance, then every category with its typical month beside the one in progress, so you can see which one is running hot. Ledger with category filter, note search, Indian financial-year ranges (Apr–Mar), and a CSV export of exactly the rows on screen.
- **Holdings** — investments, cash and debts on one balance sheet. Per-holding XIRR, realized and unrealized gain, and one overall XIRR for every investment ever made. Cash is a signed ledger, so credit-card float is shown as money owed rather than counted as an asset.
- **Debts** — principal, EMI **inferred from the last payment and dated as inferred** (there is no EMI column), an implied annual rate solved numerically from the amortisation equation, and the portfolio's return over that same loan's life — because prepaying earns the loan's rate, risk free, and that is the only decision the row supports.
- **Goal-based investing** — the interesting part, below.
- **Sign in with a code, not just a link** — the email carries both. A magic link can only be redeemed in the browser that asked for it, so opening it from a mail app fails, and link scanners can spend it before you click; the code works anywhere. A failed link says why and points at the code rather than bouncing you silently.
- **Public demo** — `/demo` is a shareable link that signs the visitor into a read-only account. Writes are blocked **in the database** by RLS, not just in the UI, since the demo hands out a real JWT. The demo's clock is frozen to a fixed day so the data and the app's idea of "now" cannot drift apart.
- Dark mode, phone-first layout, and a categorical chart palette with a separately-chosen dark ramp — both validated for colour-blind separation against their own surface, not flipped automatically.

## The goal engine

Goals are a planning overlay — investments live in one shared pool and goals *claim* from it. `lib/goals.ts` is pure functions throughout:

1. **Inflation-adjusted targets** — a goal is a cost in today's money plus an inflation rate, projected to its date.
2. **Glide paths** — each goal declares target allocations per asset class at milestones ("months before end"), interpolated linearly, so a far-off goal sits in equity and de-risks as it approaches.
3. **Funded corpus** — the amount that, held today and left alone, reaches the target by the date at the assumed returns. This is what a goal *needs*.
4. **Priority waterfall** — the pool is distributed soonest-due-first. A goal that received everything it needs is on track; one that did not is behind, by the gap. Whatever no goal claims is reported as unclaimed rather than quietly attributed.
5. **Forward SIP** — the monthly contribution that closes the remaining gap, solved exactly (terminal corpus is affine in the contribution, so two simulations pin the line).

**On-track deliberately does not mean "on schedule."** An earlier version simulated a SIP from the goal's `created_at` and compared you to it, which made the verdict depend on the day you happened to create the row — a two-month-old plan needed almost nothing, so any real portfolio passed trivially. There is a test asserting that two identical goals created six years apart read the same.

## How it's built

- **Next.js 16 (App Router) + React 19 + TypeScript** — pages are Server Components fetching in one `Promise.all`; interactivity lives in small client components.
- **Supabase** — Postgres with row-level security on every table (`auth.uid() = user_id`), passwordless email auth, session refresh in a Next.js proxy.
- **Tailwind CSS 4**, **Recharts 3**, **Vercel**.
- **All financial maths is pure functions under `lib/`** — no I/O, deterministic, independent of the UI, and unit-tested.
- **Invariants live in the database**, not the app: one open phase per user (partial unique index), valuations must carry zero cash flow (check constraint), conditional foreign keys on money sources by kind.
- **Every derived figure names its base.** "Investable" had four definitions in three files, differing by tens of thousands of rupees, all printed under one word; `lib/money.ts` is now the single source and each screen states which base it quoted.
- **Days come from a fixed timezone**, never the server clock or the browser — a ledger's day must not depend on where the code runs.

## Tests

```bash
npm test        # Node's built-in runner, no framework
```

41 tests over `lib/goals.ts`, `lib/money.ts` and `lib/range.ts` — the pure modules where the arithmetic is subtle. They pin the cases that shipped broken once: the schedule verdict staying stable over time, a month that overspends not counting as a good month, largest-remainder rounding so breakdowns sum to their headline, and same-date investment entries resolving deterministically.

`tsc`, `eslint`, `next build` and `npm test` all passing does **not** mean it works. None of them catch an empty chart, a clipped label, or a number that is simply wrong — every user-visible bug here passed all four first. After changing a screen, load it and look at the pixels.

## Setup

### 1. Supabase

1. Create a project at https://supabase.com (free tier is fine).
2. In **SQL Editor**, run `supabase/schema.sql` (tables, constraints, RLS policies).
3. In **Authentication → Providers → Email**, ensure Email is enabled.
   Then in **Authentication → Email Templates → Magic Link**, make sure the body
   includes the code as well as the link:

   ```html
   <p>Your sign-in code is <strong>{{ .Token }}</strong></p>
   <p>Or <a href="{{ .ConfirmationURL }}">click here</a> to sign in.</p>
   ```

   The default template has only the link. A link can be redeemed **only in the
   browser that requested it** — mail apps open their own in-app browser, and
   some providers' scanners spend the single-use link before you ever click it.
   The code has neither problem, which is why it is the primary path here.
4. In **Authentication → URL Configuration**, set the Site URL to your production URL and add `http://localhost:3000` as a redirect URL.
5. Copy **Project URL** and **publishable key** from **Settings → API**.

### 2. Run locally

```bash
cp .env.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev
```

Open http://localhost:3000, enter your email, and type the code from the email
(or click the link, if you're in the same browser).

### 3. Deploy to Vercel

1. Push to GitHub and import at https://vercel.com/new.
2. Add the two env vars, then update Supabase's Site URL to the Vercel domain.

### 4. The public demo (optional)

1. In Supabase → **Authentication → Add user**, create `demo@example.com` with a password, auto-confirmed.
2. Run `supabase/seed_demo.sql`. It seeds ~3 years of fictional history — two phases, monthly income and expenses across 11 categories, seven investments across four asset classes, two debts, five goals — all generated to satisfy the same accounting identity the dashboard uses, so every number reconciles.
3. Run `supabase/demo_readonly.sql` to rewrite the demo user's RLS policies as read-only.
4. Set `DEMO_EMAIL` and `DEMO_PASSWORD` (server-only). `/demo` starts working once both are set.

Reseed any time with `supabase/reseed_demo.sql` then `seed_demo.sql`. Every delete in the reseed is scoped to the demo user.

### Lock it to just your account

After signing in once, disable "Enable signups" in **Authentication → Providers → Email**. Existing users keep working; new emails are rejected.

## Project layout

```
app/
  page.tsx               # Home: net worth, the month, can-you-fund-the-plan, mix, trend
  cashflow/              # This month, category table, ledger (filters, search, CSV export)
  holdings/              # Investments + cash + debts on one balance sheet
  plan/                  # Goal verdicts, pool sharing, monthly split, expected returns
  goals/[id]/            # Goal detail + glide-path editor (draggable)
  investments/[id]/      # Holding detail: gain, chart, entries
  debts/[id]/            # Debt detail: outstanding, implied rate vs portfolio, payments
  money-sources/         # Audit trail of where capital came from
  settings/              # Phases, categories, CSV export
  ui.tsx                 # Shared field/button classes + stable asset-class colour
  Disclose.tsx           # Collapse-in-place forms; DiscloseRow for button groups
lib/
  goals.ts               # Glide paths, funded corpus, waterfall, verdicts (+ tests)
  money.ts               # Cashflow bases, month series, category maths (+ tests)
  range.ts               # Period filter incl. Indian FY windows (+ tests)
  xirr.ts                # Newton–Raphson XIRR solver
  portfolioXirr.ts       # Portfolio return over a sub-period via synthetic flows
  debtRate.ts            # Implied annual rate solved from the amortisation equation
  networthSeries.ts      # Net-worth time series assembly
  demo.ts                # Demo detection + the frozen demo clock
supabase/
  schema.sql             # Tables, constraints, RLS policies
  seed_demo.sql          # Deterministic ~3-year demo dataset
  reseed_demo.sql        # Clears the demo account, and only the demo account
proxy.ts                 # Session refresh + redirect to /login
```

## Design decisions

- **Four questions, not thirteen tables.** Screens named after tables made you know the schema before you could find anything. Each screen now answers one question in its first viewport.
- **Headline numbers show their arithmetic, and derived figures name their base.** An EMI inferred from the last payment says so and gives the date; a target inflated from the plan's start date says "at Feb 2024 prices", not "today".
- **Verdicts must be able to say no.** The plan page says "You cannot fund the plan as it stands" and names the shortfall. A verdict you cannot disagree with is decoration.
- **The parity check is the regression test.** Two independent routes to the same cash figure; when they disagree the app says so rather than picking one.
- **No global "+".** With seven object types a single add button adds a decision to the most frequent action, so each screen collapses its own form in place.
- **The demo is frozen in time.** Its data is generated relative to one constant that the app also reads as "today", so the two cannot drift and two screenshots are always comparable.
- **Colour follows the entity, never its rank.** An asset class keeps its hue regardless of what it is currently worth.
