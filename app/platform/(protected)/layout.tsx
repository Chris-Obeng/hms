import { redirect } from "next/navigation";
import { createPlatformClient } from "@/lib/supabase/platform-server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Platform Admin Layout — Supabase Auth (email + password)
 *
 * Auth flow:
 *   1. Middleware (proxy.ts) refreshes the Supabase session on every request
 *      and redirects unauthenticated requests to /platform/sign-in.
 *   2. This layout double-checks authentication with getClaims() and then
 *      verifies the user is an active platform_admin (whitelist check).
 *
 * How to create a platform admin account:
 *   Step 1 — Supabase Dashboard → Authentication → Users → "Add user"
 *             Enter email + password. Copy the new user's UUID.
 *   Step 2 — Run in Supabase SQL editor:
 *             INSERT INTO platform_admins (supabase_user_id, email, full_name, role, is_active)
 *             VALUES ('<uuid-from-step-1>', 'you@example.com', 'Your Name', 'super_admin', true);
 */
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createPlatformClient();

  // getClaims: local JWT verification — fast, no network round-trip
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/platform/sign-in");
  }

  const userId = data.claims.sub;

  // Verify this Supabase Auth user is an active platform admin
  // Uses service role client to bypass RLS — authoritative whitelist check
  const { data: admin } = await supabaseAdmin
    .from("platform_admins")
    .select("id, role, is_active")
    .eq("supabase_user_id", userId)
    .single();

  if (!admin || !admin.is_active) {
    // Valid Supabase session but NOT an active platform admin.
    // We must redirect to the sign-out Route Handler — layouts cannot set cookies,
    // so calling supabase.auth.signOut() here would silently fail (the setAll
    // try/catch swallows it), leaving the session cookie intact and causing an
    // infinite redirect loop between the middleware and this layout.
    redirect("/platform/auth/sign-out?reason=unauthorized");
  }

  return <>{children}</>;
}
