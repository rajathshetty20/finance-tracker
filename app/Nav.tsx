"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  CreditCard,
  Home,
  LineChart,
  Layers,
  Settings,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

const links: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/expenses", label: "Expenses", icon: TrendingDown },
  { href: "/incomes", label: "Incomes", icon: TrendingUp },
  { href: "/investments", label: "Investments", icon: LineChart },
  { href: "/debts", label: "Debts", icon: CreditCard },
  { href: "/cash", label: "Cash", icon: Banknote },
  { href: "/money-sources", label: "Money sources", icon: Layers },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <div className="mt-2 flex flex-wrap gap-x-1 gap-y-1 text-sm">
      {links.map(({ href, label, icon: Icon }) => {
        const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 transition-colors ${
              isActive
                ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
