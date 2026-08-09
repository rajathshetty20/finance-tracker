import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Redeems a magic link.
 *
 * A link can only be exchanged in the browser that requested it — the PKCE
 * verifier lives in that browser's storage — and mail apps routinely open
 * links in their own in-app browser. It can also already be spent: scanners
 * at some mail providers follow links, and the link is single-use.
 *
 * Either way the exchange fails, and redirecting to "/" on failure just bounced
 * the visitor back to the login form with nothing said. Send them back with a
 * reason, so the page can point at the emailed code instead.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=link-missing", url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?error=link-failed", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
