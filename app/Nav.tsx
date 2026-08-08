"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, NAV_LINKS } from "./navLinks";

/** Full destination list. Desktop only — phones use the bottom bar. */
export default function Nav() {
  const pathname = usePathname();
  return (
    <div className="mt-2 flex flex-wrap gap-1 text-[0.8125rem]">
      {NAV_LINKS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 transition-colors ${
              active ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
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
