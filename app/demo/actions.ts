"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Deliberately explicit: this drops the visitor's own session. Only reachable
// from /demo/confirm, where they have been told that.
export async function switchToDemo() {
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password) redirect("/login?error=demo-unconfigured");

  const supabase = await createClient();
  // Local scope only. A global sign-out revokes every refresh token on the
  // account, which on the shared demo would kick out every other visitor.
  await supabase.auth.signOut({ scope: "local" });

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=demo-failed");

  redirect("/");
}
