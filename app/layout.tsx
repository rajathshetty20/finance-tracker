import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { isDemoUser } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import type { Phase } from "@/lib/types";
import Nav from "./Nav";
import BottomNav from "./BottomNav";
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
                  {currentPhase && (
                    <span className="truncate rounded-full bg-surface-2 px-2 py-0.5 text-[0.75rem] text-ink-2">
                      {currentPhase.name}
                    </span>
                  )}
                </div>
                <form action="/auth/signout" method="post">
                  <button type="submit" className="whitespace-nowrap text-[0.8125rem] text-ink-3 hover:text-ink">
                    Sign out
                  </button>
                </form>
              </div>
              {/* Tabs move to the bottom bar on phones; the thumb lives there. */}
              <div className="hidden md:block">
                <Nav />
              </div>
            </div>
          </header>
        )}
        {isDemo && (
          <div className="border-b border-warn bg-warn-soft/50/40">
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
