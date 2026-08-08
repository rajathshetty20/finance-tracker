import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

// Renamed from middleware.ts — the middleware file convention is deprecated
// in this Next version and warns on every dev request.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets and the PWA surfaces. The manifest and
    // its icons are fetched without credentials, so running the session check
    // would redirect them to /login and installation would fail.
    "/((?!_next/static|_next/image|favicon.ico|apple-icon|manifest.webmanifest|pwa-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
