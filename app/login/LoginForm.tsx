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
    <div className="flex min-h-screen items-center justify-center bg-surface-2 p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-rule bg-surface p-6 shadow-sm"
      >
        <div>
          <h1 className="text-xl font-semibold">Finance tracker</h1>
          <p className="text-sm text-ink-3">Sign in with a magic link.</p>
        </div>
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="w-full rounded-md bg-ink px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {status === "sending" ? "Sending..." : "Send link"}
        </button>
        {demoEnabled && (
          <>
            <div className="flex items-center gap-3 text-xs text-ink-3">
              <span className="h-px flex-1 bg-surface-2" />
              or
              <span className="h-px flex-1 bg-surface-2" />
            </div>
            <button
              type="button"
              onClick={onDemo}
              disabled={demoPending}
              className="w-full rounded-md border border-rule px-3 py-2 text-sm font-medium text-ink hover:bg-surface-2 disabled:opacity-60"
            >
              {demoPending ? "Signing in..." : "Explore the demo (read-only)"}
            </button>
          </>
        )}
        {status === "sent" && (
          <p className="text-sm text-up">Check your inbox for the link.</p>
        )}
        {error && <p className="text-sm text-down">{error}</p>}
      </form>
    </div>
  );
}
