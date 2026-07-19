import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { isDemoUser } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";
import type { Phase } from "@/lib/types";
import Nav from "./Nav";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Finance tracker",
  description: "Track expenses, income, investments, debt, and net worth.",
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
      <body className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        {user && (
          <nav className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mx-auto max-w-3xl px-4 py-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="whitespace-nowrap font-semibold">Finance tracker</span>
                  {currentPhase && (
                    <span className="truncate rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {currentPhase.name}
                    </span>
                  )}
                </div>
                <form action="/auth/signout" method="post">
                  <button
                    type="submit"
                    className="whitespace-nowrap text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    Sign out
                  </button>
                </form>
              </div>
              <Nav />
            </div>
          </nav>
        )}
        {isDemo && (
          <div className="border-b border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/40">
            <div className="mx-auto max-w-3xl px-4 py-1.5 text-xs text-amber-800 dark:text-amber-200">
              Read-only demo — the data is fictional and edits are disabled.
            </div>
          </div>
        )}
        <main className="mx-auto w-full max-w-3xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
