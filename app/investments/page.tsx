import { redirect } from "next/navigation";

// Investments, cash and debts are one balance sheet at /holdings. Exact path
// only — /investments/[id] detail pages are untouched.
export default function InvestmentsIndex() {
  redirect("/holdings");
}
