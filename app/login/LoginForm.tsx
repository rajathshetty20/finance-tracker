"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { signInAsDemo } from "./actions";

export default function LoginForm({ demoEnabled }: { demoEnabled: boolean }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [demoPending, setDemoPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) {
      setStatus("idle");
      setError(error.message);
    } else {
      setStatus("sent");
    }
  }

  async function onDemo() {
    setDemoPending(true);
    setStatus("idle");
    setError(null);
    try {
      // On success the action redirects; Next handles the navigation.
      const result = await signInAsDemo();
      if (result?.error) setError(result.error);
    } catch {
      setError("Could not start the demo — please try again.");
    } finally {
      setDemoPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div>
          <h1 className="text-xl font-semibold">Finance tracker</h1>
          <p className="text-sm text-zinc-500">Sign in with a magic link.</p>
        </div>
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {status === "sending" ? "Sending..." : "Send link"}
        </button>
        {demoEnabled && (
          <>
            <div className="flex items-center gap-3 text-xs text-zinc-400">
              <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
              or
              <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            </div>
            <button
              type="button"
              onClick={onDemo}
              disabled={demoPending}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {demoPending ? "Signing in..." : "Explore the demo (read-only)"}
            </button>
          </>
        )}
        {status === "sent" && (
          <p className="text-sm text-emerald-600">Check your inbox for the link.</p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
}
