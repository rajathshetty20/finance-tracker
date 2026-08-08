import { NextResponse, type NextRequest } from "next/server";
import { isDemoUser } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

// A static, shareable door into the demo: https://<host>/demo signs the
// visitor into the shared read-only account and drops them on the dashboard.
// No button to find, nothing to type.
//
// Credentials stay server-only. Writes are blocked in the database by
// supabase/demo_readonly.sql, not just in the UI, because this hands out a
// real JWT that could be replayed against the REST API directly.
export async function GET(request: NextRequest) {
  const home = new URL("/", request.url);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Already exploring — don't spend another sign-in.
  if (isDemoUser(user)) return NextResponse.redirect(home);

  // Someone with their own account followed the link. Signing them into the
  // demo here would silently sign them OUT of their own data, and getting back
  // in means waiting on a magic link. Ask first.
  if (user) return NextResponse.redirect(new URL("/demo/confirm", request.url));

  const email = process.env.DEMO_EMAIL;
  const password = process.env.DEMO_PASSWORD;
  if (!email || !password) {
    return NextResponse.redirect(new URL("/login?error=demo-unconfigured", request.url));
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.redirect(new URL("/login?error=demo-failed", request.url));
  }

  return NextResponse.redirect(home);
}
