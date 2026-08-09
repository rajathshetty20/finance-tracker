"use client";

import { useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { ArrowRight, Check, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Logo from "../Logo";
import { signInAsDemo } from "./actions";
import { btnPrimary, btnQuiet, inputCls } from "../ui";

// Supabase generates the email OTP at a length set per project (6-10 digits),
// so neither bound is ours to hardcode. Slicing to 6 turns a valid 8-digit
// code into a wrong one and fails every sign-in — the bug this app's sibling
// shipped once already.
const OTP_MIN = 6;
const OTP_MAX = 10;

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
  // The same email carries a link and a code. The link only works in the
  // browser that asked for it — mail apps open their own — and scanners can
  // spend it before you click. A code is not a URL, so nothing can consume it
  // on your behalf and it works in any browser.
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  async function onVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setVerifying(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    setVerifying(false);
    if (error) {
      setError(error.message);
      return;
    }
    // A full load, so every Server Component re-renders with the new session.
    window.location.assign("/");
  }

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
          <form onSubmit={onVerify} className="space-y-3">
            <p className="flex items-start gap-2 text-sm">
              <Check className="mt-[3px] h-4 w-4 shrink-0 text-up" />
              <span>
                <span className="font-medium">Sent to {email}.</span> Enter the code from that
                email — it works in any browser. The link in the same email works too, but only
                in this one.
              </span>
            </p>
            <label htmlFor="code" className="block text-[0.8125rem] font-medium">
              Code from the email
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, OTP_MAX))}
              className={`${inputCls} tabular-nums tracking-[0.3em]`}
            />
            <button
              type="submit"
              disabled={verifying || code.length < OTP_MIN}
              className={`${btnPrimary} w-full`}
            >
              {verifying ? "Signing in…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStatus("idle");
                setCode("");
                setError(null);
              }}
              className="text-[0.8125rem] text-ink-3 underline"
            >
              Use a different address
            </button>
          </form>
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
              {status === "sending" ? "Sending…" : "Email me a code"}
            </button>
            <p className="text-[0.75rem] text-ink-3">
              No password. You get a one-time code, and a link if you prefer.
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
