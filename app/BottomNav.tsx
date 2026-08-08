"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, X } from "lucide-react";
import { isActive, NAV_LINKS } from "./navLinks";
import { DOMAIN_COLOR } from "./ui";

/**
 * Primary navigation on phones, where the thumb is at the bottom and the
 * notch is at the top. Nine destinations in a wrapping pill row cost two
 * lines and left every target under 30px.
 */
export default function BottomNav() {
  const pathname = usePathname();
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMore(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [more]);

  if (pathname.startsWith("/login")) return null;

  const primary = NAV_LINKS.filter((l) => l.primary);
  const rest = NAV_LINKS.filter((l) => !l.primary);
  const restActive = rest.some((l) => isActive(pathname, l.href));

  return (
    <>
      {more && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setMore(false)}
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="More sections"
            className="relative rounded-t-2xl bg-surface pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-8px_32px_rgba(0,0,0,0.18)]"
          >
            <div className="flex items-center justify-between border-b border-rule px-4 py-3">
              <span className="text-[0.8125rem] font-semibold uppercase tracking-wide text-ink-2">
                More
              </span>
              <button
                type="button"
                onClick={() => setMore(false)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="divide-y divide-rule-soft px-2 py-1">
              {rest.map(({ href, label, icon: Icon, domain }) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setMore(false)}
                    className="flex min-h-[48px] items-center gap-3 rounded-lg px-2 text-[0.9375rem] text-ink hover:bg-surface-2"
                  >
                    <Icon
                      className="h-4 w-4 shrink-0"
                      style={domain ? { color: DOMAIN_COLOR[domain] } : undefined}
                    />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

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
          <button
            type="button"
            onClick={() => setMore(true)}
            aria-expanded={more}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.625rem] font-medium ${
              restActive ? "text-ink" : "text-ink-3 hover:text-ink-2"
            }`}
          >
            <MoreHorizontal className="h-5 w-5" strokeWidth={restActive ? 2.25 : 1.75} />
            More
          </button>
        </div>
      </nav>
    </>
  );
}
