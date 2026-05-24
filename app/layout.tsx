import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import type { Phase } from "@/lib/types";

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
            <div className="mx-auto max-w-5xl px-4 py-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-center gap-3">
                  <Link href="/" className="whitespace-nowrap font-semibold">Finance tracker</Link>
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
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <Link href="/phases" className="whitespace-nowrap text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Phases</Link>
                <Link href="/expenses" className="whitespace-nowrap text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Expenses</Link>
                <Link href="/incomes" className="whitespace-nowrap text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Incomes</Link>
                <Link href="/investments" className="whitespace-nowrap text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Investments</Link>
                <Link href="/debts" className="whitespace-nowrap text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Debts</Link>
                <Link href="/cash" className="whitespace-nowrap text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Cash</Link>
                <Link href="/money-sources" className="whitespace-nowrap text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Money sources</Link>
                <Link href="/settings" className="whitespace-nowrap text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Categories</Link>
              </div>
            </div>
          </nav>
        )}
        <main className="mx-auto w-full max-w-3xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
