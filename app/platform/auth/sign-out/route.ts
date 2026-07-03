/**
 * Platform admin sign-out route.
 *
 * WHY A ROUTE HANDLER (not a Server Component):
 *   supabase.auth.signOut() clears the session by setting cookies.
 *   Next.js App Router layouts/pages CANNOT set cookies — only Route Handlers
 *   and Server Actions can. Calling signOut() from a layout silently fails
 *   (the setAll try/catch swallows the error), the session cookie stays, and
 *   the middleware keeps redirecting authenticated users → infinite loop.
 *
 * Called by app/platform/layout.tsx when a valid Supabase Auth session exists
 * but the user is NOT in the platform_admins whitelist (or is_active = false).
 */
import { type NextRequest, NextResponse } from "next/server";
import { createPlatformClient } from "@/lib/supabase/platform-server";

export async function GET(request: NextRequest) {
  const supabase = await createPlatformClient();
  await supabase.auth.signOut();

  const { searchParams } = new URL(request.url);
  const reason = searchParams.get("reason") ?? "unauthorized";

  const url = request.nextUrl.clone();
  url.pathname = "/platform/sign-in";
  url.search = `?error=${encodeURIComponent(reason)}`;

  return NextResponse.redirect(url);
}
