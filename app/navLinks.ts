import { Home, Layers, Settings, Target, Wallet, ArrowLeftRight, type LucideIcon } from "lucide-react";
import type { Domain } from "./ui";

export type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  domain?: Domain;
  /** Shown in the bottom bar on phones; the rest live behind "More". */
  primary?: boolean;
};

/**
 * Four destinations, one per question the app answers:
 *   Home      — where do I stand?
 *   Cashflow  — where does the money go, and does it reach the investments?
 *   Holdings  — what do I own and owe?
 *   Plan      — will I get what I'm saving for?
 *
 * Nine destinations named after tables (Expenses, Incomes, Investments, Debts,
 * Cash, Money sources…) asked the reader to know the schema before they could
 * find anything. There is deliberately no global "+": with seven object types
 * it adds a decision to the most frequent action, so each screen collapses its
 * own add-form in place instead.
 *
 * Money sources is not in the bar. It is an audit trail, reached from the
 * balance check on Home, which is the only moment anyone wants it.
 */
export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Home", icon: Home, primary: true },
  { href: "/cashflow", label: "Cashflow", icon: ArrowLeftRight, domain: "expense", primary: true },
  { href: "/holdings", label: "Holdings", icon: Wallet, domain: "investment", primary: true },
  { href: "/plan", label: "Plan", icon: Target, domain: "goal", primary: true },
  { href: "/money-sources", label: "Money sources", icon: Layers },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * Segment-wise match, never a raw prefix: `"/cashflow".startsWith("/cash")` is
 * true, which lit the Cash tab whenever the ledger was open.
 */
export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
