# Finance Tracker

A personal finance tracker built around one idea: **your net worth should be explainable**. Every rupee is accounted for through a strict identity — income minus expenses becomes savings, savings become investments or cash, and investments are tracked against inflation-adjusted life goals.

Built with Next.js (App Router), TypeScript, Supabase (Postgres + Auth + RLS), Tailwind CSS, and Recharts.

## What it does

- **Net-worth dashboard** — a single time series combining investment market value, cash balances, and outstanding debt, so you can see the trajectory, not just today's number.
- **Life phases** — income and expenses are scoped to phases (a job, a sabbatical, …). Exactly one phase is open at a time, enforced at the database level. Closing a phase materializes its savings as a "money source", keeping the ledger of *where capital came from* intact.
- **Investments with real return math** — contributions, withdrawals, and valuations per instrument, with **XIRR (money-weighted return)** computed via a Newton–Raphson solver, both per-investment and portfolio-wide. Allocation is visualized as a nested donut: asset class on the inside, individual instruments on the outside.
- **Goal-based investing** — the most interesting part (see below).
- **Debts** — principal, EMI payments, and an **implied interest rate** backed out of the amortization equation numerically, since lenders rarely tell you the effective annual rate.
- **Money sources** — a signed ledger of capital origins (salary rollovers, realized gains, debt closures, manual entries) that reconciles against what you actually hold.

## The goal engine

Goals are a planning overlay — investments live in one shared pool, and goals *claim* from it. The engine (`lib/goals.ts`, pure functions throughout) does four things:

1. **Inflation-adjusted targets** — a goal is defined by its cost in today's money plus an inflation rate; the target corpus is projected to the goal's end date.
2. **Glide paths** — each goal declares target allocations per asset class at milestones ("months before end"), and the engine linearly interpolates between them, so a far-off goal can sit in equity and de-risk into fixed income as it approaches.
3. **SIP solver** — computes the monthly contribution needed to hit the target, with an annual step-up assumption. It exploits the fact that terminal corpus is affine in SIP size: two simulations pin the line, no iteration needed.
4. **Priority waterfall** — the pooled market value is distributed across goals soonest-due-first in two passes (on-track needs first, then surplus toward each goal's funded cap). Whatever no goal claims is reported as true surplus. This answers the question every goal tracker fudges: *if all my money is in one pool, which goal is actually funded?*

## Architecture

```
app/                  Next.js App Router — one folder per feature
  <feature>/
    page.tsx          server component (data fetching)
    actions.ts        server actions (mutations)
    *Form.tsx, *Row.tsx   client components
lib/
  goals.ts            goal engine: glide paths, SIP solver, waterfall, projections
  xirr.ts             Newton–Raphson XIRR solver
  portfolioXirr.ts    portfolio-level period returns via synthetic boundary flows
  debtRate.ts         implied debt interest rate solver
  networthSeries.ts   net-worth time series assembly
  supabase/           SSR-aware Supabase clients + session middleware
supabase/
  schema.sql          full schema: tables, constraints, RLS policies
```

Design choices worth noting:

- **All financial math is in pure functions** under `lib/` — no I/O, deterministic, and independent of the UI.
- **Invariants live in the database**, not the app: one open phase per user (partial unique index), valuations must carry zero cash flow (check constraint), conditional foreign keys on money sources depending on their kind.
- **Row-Level Security everywhere** — every table carries `user_id` and is owner-only via `auth.uid()`, so the client-exposed key never sees another user's rows.
- No ORM, no state-management library, no API layer — server components read, server actions write.

A full design doc lives in [HLD.md](HLD.md), covering the domain model, the net-worth identity, and the reasoning behind the schema.

## Getting started

1. Create a [Supabase](https://supabase.com) project and run `supabase/schema.sql` in the SQL Editor (creates tables, constraints, and RLS policies).
2. Copy `.env.example` to `.env.local` and fill in your project's URL and publishable key.
3. Install and run:

   ```bash
   npm install
   npm run dev
   ```

4. Sign up on the login page, create your first phase, and start logging.

### Demo mode

Once configured, **`/demo` is a public link anyone can open** — it signs the visitor into a shared, pre-seeded account and lands them on the dashboard with nothing to click or type. The login page also carries an "Explore the demo (read-only)" button. To set it up:

1. In Supabase → Authentication → Add user, create the demo user (default `demo@example.com`) with a password, auto-confirmed.
2. Run `supabase/seed_demo.sql` in the SQL Editor. It seeds ~3 years of fictional history — two job phases, monthly income and expenses, seven investments across four asset classes (including a closed position with its realized gain), two debts, and four goals with glide paths — all generated to satisfy the same accounting identity the dashboard uses, so every number reconciles. Dates slide with the run date (history always ends at the last complete month, goal deadlines sit relative to today), so the demo never looks stale; reseed anytime with the cleanup block at the bottom of the script.
3. Run `supabase/demo_readonly.sql`. This rewrites the RLS policies so the demo user can read but never write — enforced in the database, not just the UI, since the demo session's token could be replayed against the REST API directly.
4. Set `DEMO_EMAIL` and `DEMO_PASSWORD` in your environment (they're server-only). `/demo` and the button both start working when both are set, and the app shows a "read-only demo" banner while the demo session is active.

Sharing the `/demo` link is safe for you specifically: if someone who is already signed in with their own account follows it, `/demo` does **not** replace their session — it sends them to a confirmation page first, since signing them out would mean waiting on another magic link to get back in. If the demo isn't configured on a deployment, the link explains that rather than dumping the visitor on a blank sign-in form.

## Status

This is a single-user app I use daily for my own finances. It's feature-complete for my needs; rough edges are where I haven't hit them yet.
