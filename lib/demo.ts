import { createClient } from "@/lib/supabase/server";

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
