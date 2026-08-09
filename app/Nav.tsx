"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, NAV_LINKS } from "./navLinks";

/**
 * The four questions, desktop only — phones use the bottom bar.
 *
 * Only the primary links: Settings and Money sources live in the header menu,
 * and listing them here as well put the same two destinations in two places on
 * the same screen.
 *
 * No icons, unlike the bottom bar — the labels alone fit on one line and the
 * icons carried no meaning the word next to them didn't already.
 */
export default function Nav() {
  const pathname = usePathname();
  return (
    <div className="mt-2 flex flex-wrap gap-1 text-[0.8125rem]">
      {NAV_LINKS.filter((l) => l.primary).map(({ href, label }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center whitespace-nowrap rounded-full px-2.5 py-1.5 transition-colors ${
              active ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
