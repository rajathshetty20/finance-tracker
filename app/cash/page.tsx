import { redirect } from "next/navigation";

// Investments, cash and debts are one balance sheet at /holdings. Exact path
// only — /cash/[id] detail pages are untouched.
export default function CashIndex() {
  redirect("/holdings");
}
