import { redirect } from "next/navigation";

// The two ledgers merged into one screen behind a remembered filter, not into
// one list — 18 expense rows against 2 income rows per 90 days is why. Exact
// path only, so nothing under /expenses/ is caught by this.
export default function ExpensesIndex() {
  redirect("/cashflow?ledger=expenses");
}
