import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/dates";

/**
 * The day the demo is frozen at.
 *
 * The demo used to slide with the wall clock while its data was generated
 * relative to the run date, so the two drifted apart the moment the seed was
 * not re-run: an "on track" verdict could rot into "behind" with nobody
 * touching anything, and no two screenshots were comparable.
 *
 * supabase/seed_demo.sql anchors every generated date to this SAME constant, so
 * data and clock move together or not at all. To refresh the demo: bump this
 * date, change the matching `demo_today` in the seed, and reseed.
 */
export const DEMO_TODAY = "2026-08-09";

/**
 * "Today" for the signed-in session: frozen for the demo, the real Asia/Kolkata
 * date for everyone else. Server-only — client components take it as a prop
 * rather than reading `new Date()`, which is the browser's zone, not the ledger's.
 */
export async function appToday(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isDemoUser(user) ? DEMO_TODAY : todayISO();
}

export const DEMO_WRITE_ERROR =
  "Saving is disabled in the demo — sign in with your own account to make changes.";

// The demo account is tagged with app_metadata.is_demo = true by
// supabase/demo_readonly.sql. app_metadata is server-controlled and embedded
// in the JWT, so the RLS policies and these app-side checks share one flag.
export function isDemoUser(
  user: { app_metadata?: Record<string, unknown> } | null | undefined,
): boolean {
  return user?.app_metadata?.is_demo === true;
}

// UX guard for server actions: friendly error instead of a raw RLS violation.
// Not a security boundary — supabase/demo_readonly.sql enforces read-only —
// so reading the claims off the session (no extra auth round-trip) suffices.
export async function isDemoWriteBlocked(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const meta = data?.claims?.app_metadata as Record<string, unknown> | undefined;
  return meta?.is_demo === true;
}
