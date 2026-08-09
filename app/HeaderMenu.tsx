"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Layers, LogOut, Menu, Settings, X } from "lucide-react";

/**
 * The destinations that are not one of the app's four questions.
 *
 * They used to be a fifth "More" tab in the bottom bar, which made the thumb
 * row read as five peers when only four are. Settings and the money-source
 * audit trail are places you visit occasionally and deliberately, so they sit
 * in the header instead — leaving the bar to say exactly what the app is for.
 */
export default function HeaderMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="More"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink"
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-xl border border-rule bg-surface shadow-lg"
        >
          <Link
            role="menuitem"
            href="/money-sources"
            onClick={() => setOpen(false)}
            className="flex min-h-[44px] items-center gap-2.5 px-3 text-[0.875rem] hover:bg-surface-2"
          >
            <Layers className="h-4 w-4 shrink-0 text-ink-3" />
            Money sources
          </Link>
          <Link
            role="menuitem"
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex min-h-[44px] items-center gap-2.5 border-t border-rule-soft px-3 text-[0.875rem] hover:bg-surface-2"
          >
            <Settings className="h-4 w-4 shrink-0 text-ink-3" />
            Settings
          </Link>
          <form action="/auth/signout" method="post" className="border-t border-rule">
            <button
              type="submit"
              role="menuitem"
              className="flex min-h-[44px] w-full items-center gap-2.5 px-3 text-left text-[0.875rem] text-ink-2 hover:bg-surface-2"
            >
              <LogOut className="h-4 w-4 shrink-0 text-ink-3" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
