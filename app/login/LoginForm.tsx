"use client";

import { useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { ArrowRight, Check, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Logo from "../Logo";
import { signInAsDemo } from "./actions";
import { btnPrimary, btnQuiet, inputCls } from "../ui";

export default function LoginForm({
  demoEnabled,
  notice,
}: {
  demoEnabled: boolean;
  notice?: string | null;
}) {
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
    } catch (err) {
      // redirect() signals success by THROWING. A bare catch swallowed that
      // signal and painted "could not start the demo" for the instant before
      // the navigation completed — an error flash on the happy path.
      unstable_rethrow(err);
      setError("Could not start the demo — please try again.");
    } finally {
      setDemoPending(false);
    }
  }

  return (
    // min-h-dvh, not min-h-screen: on mobile Safari 100vh is taller than the
    // visible area, so the card sat partly under the browser chrome.
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-ground p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5">
          <Logo className="h-8 w-8 shrink-0" />
          <h1 className="text-xl font-semibold">Finance tracker</h1>
        </div>
        <p className="mt-1.5 text-[0.9375rem] leading-snug text-ink-2">
          Where your money went, what it&apos;s worth now, and whether it gets you what
          you&apos;re saving for.
        </p>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-rule bg-surface p-6">
        {notice && (
          <p className="mb-4 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[0.8125rem] text-ink-2">
            {notice}
          </p>
        )}

        {status === "sent" ? (
          // Replaces the form rather than appending a line under it: the next
          // step is in the inbox, so leaving a live "Send link" button on
          // screen only invites a second, confusing email.
          <div className="space-y-3">
            <p className="flex items-start gap-2 text-sm">
              <Check className="mt-[3px] h-4 w-4 shrink-0 text-up" />
              <span>
                <span className="font-medium">Link sent.</span> Check{" "}
                <span className="font-medium">{email}</span> and open it on this device — the link
                signs you in wherever it is opened.
              </span>
            </p>
            <button
              type="button"
              onClick={() => {
                setStatus("idle");
                setEmail("");
              }}
              className={btnQuiet}
            >
              Use a different address
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <label htmlFor="email" className="block text-[0.8125rem] font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
            <button
              type="submit"
              disabled={status === "sending" || email.trim() === ""}
              className={`${btnPrimary} flex w-full items-center justify-center gap-2`}
            >
              <Mail className="h-4 w-4" />
              {status === "sending" ? "Sending…" : "Email me a sign-in link"}
            </button>
            <p className="text-[0.75rem] text-ink-3">
              No password. We send a one-time link that signs you in.
            </p>
          </form>
        )}

        {error && <p className="mt-3 text-sm text-down">{error}</p>}
      </div>

      {demoEnabled && (
        <div className="w-full max-w-sm rounded-xl border border-rule bg-surface p-4">
          <p className="text-[0.8125rem] text-ink-2">
            <span className="font-medium text-ink">Just looking?</span> Open a fully populated
            account — three years of a fictional ledger, with goals, loans and investments. Nothing
            to type, and nothing you do can change it.
          </p>
          <button
            type="button"
            onClick={onDemo}
            disabled={demoPending}
            className={`${btnQuiet} mt-3 flex w-full items-center justify-center gap-2`}
          >
            {demoPending ? "Opening…" : "Explore the demo"}
            {!demoPending && <ArrowRight className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
}
