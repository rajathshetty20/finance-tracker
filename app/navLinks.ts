import {
  Banknote,
  CreditCard,
  Home,
  Layers,
  LineChart,
  Settings,
  Target,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { Domain } from "./ui";

export type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  domain?: Domain;
  /** Shown in the bottom bar on phones; the rest live behind "More". */
  primary?: boolean;
};

// Nine destinations cannot all be thumb-reachable. The four you touch daily
// get the bar; the rest are one tap away behind More, which keeps the bar
// readable instead of nine cramped icons.
export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Home", icon: Home, primary: true },
  { href: "/expenses", label: "Expenses", icon: TrendingDown, domain: "expense", primary: true },
  { href: "/incomes", label: "Incomes", icon: TrendingUp, domain: "income", primary: true },
  { href: "/investments", label: "Investments", icon: LineChart, domain: "investment", primary: true },
  { href: "/goals", label: "Goals", icon: Target, domain: "goal" },
  { href: "/debts", label: "Debts", icon: CreditCard, domain: "debt" },
  { href: "/cash", label: "Cash", icon: Banknote, domain: "cash" },
  { href: "/money-sources", label: "Money sources", icon: Layers },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
