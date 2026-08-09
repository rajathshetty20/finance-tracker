"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, NAV_LINKS } from "./navLinks";

/**
 * Primary navigation on phones, where the thumb is at the bottom and the
 * notch is at the top. Nine destinations in a wrapping pill row cost two
 * lines and left every target under 30px.
 */
/**
 * Primary navigation on phones, where the thumb is at the bottom.
 *
 * Four tabs, one per question the app answers, and nothing else — the fifth
 * "More" tab made the row read as five peers when the app has four subjects.
 * Settings and Money sources moved to the header menu.
 */
export default function BottomNav() {
  const pathname = usePathname();

  if (pathname.startsWith("/login")) return null;

  const primary = NAV_LINKS.filter((l) => l.primary);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="mx-auto flex max-w-3xl items-stretch justify-around px-1">
        {primary.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.625rem] font-medium ${
                active ? "text-ink" : "text-ink-3 hover:text-ink-2"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
