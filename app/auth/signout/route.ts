import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  // scope: "local" signs out only this browser. The default ("global")
  // revokes ALL refresh tokens — on the shared demo account that would kick
  // every other visitor once their access token expires.
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/login", request.url));
}
