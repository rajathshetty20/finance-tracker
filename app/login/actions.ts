"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Signs the visitor into the shared read-only demo account. Credentials live
// in server-only env vars; writes are blocked by RLS (supabase/demo_readonly.sql).
export async function signInAsDemo() {
  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password) return { error: "Demo is not configured." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect("/");
}
