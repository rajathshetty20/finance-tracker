import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { isDemoUser } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import type { Phase } from "@/lib/types";
import Nav from "./Nav";
import BottomNav from "./BottomNav";
import HeaderMenu from "./HeaderMenu";
import Logo from "./Logo";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Finance tracker",
  description: "Track expenses, income, investments, debt, and net worth.",
  // Installed to the home screen the app runs without browser chrome.
  appleWebApp: { capable: true, title: "Finance", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#141619" },
  ],
  // Standalone mode draws under the notch and the home indicator.
  viewportFit: "cover",
  // Accidental pinch/zoom left the ledger at an arbitrary scale on iOS.
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isDemo = isDemoUser(user);

  let currentPhase: Phase | null = null;
  if (user) {
    const { data } = await supabase
      .from("phases")
      .select("*")
      .is("end_date", null)
      .maybeSingle();
    currentPhase = data as Phase | null;
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-ground text-ink">
        {user && (
          <header
            className="border-b border-rule bg-surface"
            // Standalone mode draws under the status bar and Dynamic Island.
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <div className="mx-auto max-w-3xl px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Logo className="h-6 w-6 shrink-0" />
                  <span className="whitespace-nowrap text-[0.9375rem] font-semibold">
                    Finance tracker
                  </span>
                  {/* Inline once there is room; on a phone "Finance tracker"
                      plus a labelled phase name overflowed and the name — the
                      part that varies — was what got truncated. */}
                  {currentPhase && (
                    <Link
                      href="/settings"
                      className="hidden min-w-0 items-baseline gap-1 truncate rounded-full bg-surface-2 px-2 py-0.5 text-[0.75rem] text-ink-2 hover:text-ink sm:flex"
                    >
                      <span className="shrink-0 text-ink-3">Phase</span>
                      <span className="truncate">{currentPhase.name}</span>
                    </Link>
                  )}
                </div>
                <HeaderMenu />
              </div>
              {currentPhase && (
                <Link
                  href="/settings"
                  className="mt-1.5 flex items-baseline gap-1 text-[0.75rem] text-ink-3 sm:hidden"
                >
                  <span>Phase</span>
                  <span className="truncate font-medium text-ink-2">{currentPhase.name}</span>
                </Link>
              )}
              {/* Tabs move to the bottom bar on phones; the thumb lives there. */}
              <div className="hidden md:block">
                <Nav />
              </div>
            </div>
          </header>
        )}
        {/* bg-warn-soft/50/40 carried two opacity modifiers, which Tailwind
            does not parse — the banner had no background at all. */}
        {isDemo && (
          <div className="border-b border-warn bg-warn-soft">
            <div className="mx-auto max-w-3xl px-4 py-1.5 text-[0.75rem] text-warn">
              Read-only demo — the numbers are made up and saving is switched off.
            </div>
          </div>
        )}
        {/* Bottom padding clears the fixed nav plus the home indicator. */}
        <main className="mx-auto w-full max-w-3xl px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-5 md:pb-10">
          {children}
        </main>
        {user && <BottomNav />}
      </body>
    </html>
  );
}
