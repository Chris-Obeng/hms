/**
 * Platform admin sign-out route (`HIGH-09`).
 *
 * - Normal sign-outs MUST use `POST /platform/auth/sign-out` to eliminate
 *   GET-based logout CSRF (`<img src="/platform/auth/sign-out">`).
 * - `GET` is preserved ONLY as a same-origin loop-breaker redirect from
 *   `app/platform/(protected)/layout.tsx:60` when a valid Supabase Auth session
 *   belongs to a user who is NOT an active `platform_admins` member.
 */
import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createPlatformClient } from "@/lib/supabase/platform-server";

export async function POST() {
  const supabase = await createPlatformClient();
  await supabase.auth.signOut();
  return NextResponse.json({ success: true });
}

export async function GET(request: NextRequest) {
  // Block cross-site GET navigation / subresource CSRF probes immediately.
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "cross-site") {
    return NextResponse.json(
      { error: "Method Not Allowed — use POST to sign out." },
      { status: 405, headers: { Allow: "POST" } }
    );
  }

  const supabase = await createPlatformClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  // Active platform admins must sign out via POST; GET only clears non-admin /
  // deactivated sessions redirected from PlatformLayout (`reason=unauthorized`).
  if (userId) {
    const { data: admin } = await supabaseAdmin
      .from("platform_admins")
      .select("is_active")
      .eq("supabase_user_id", userId)
      .maybeSingle();

    if (admin?.is_active) {
      return NextResponse.json(
        { error: "Method Not Allowed — active platform admins must POST to sign out." },
        { status: 405, headers: { Allow: "POST" } }
      );
    }
  }

  await supabase.auth.signOut();

  const { searchParams } = new URL(request.url);
  const reason = searchParams.get("reason") ?? "unauthorized";

  const url = request.nextUrl.clone();
  url.pathname = "/platform/sign-in";
  url.search = `?error=${encodeURIComponent(reason)}`;

  return NextResponse.redirect(url);
}
