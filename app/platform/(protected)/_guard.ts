import { supabaseAdmin } from "@/lib/supabase/admin";
import { createPlatformClient } from "@/lib/supabase/platform-server";

/**
 * Authoritative platform-admin check, shared by every platform server action.
 *
 * Verifies:
 *   1. Valid Supabase Auth session (`getClaims()` — local JWT verify)
 *   2. Active `public.platform_admins` membership
 *   3. Multi-factor assurance (`aal2`) whenever the admin has at least one
 *      verified MFA factor enrolled OR `PLATFORM_REQUIRE_MFA === "true"` (`HIGH-10`),
 *      so a stolen password alone can never mutate `platform_settings` or `hotels.status`.
 */
export async function assertPlatformAdmin(): Promise<{
  adminId: string;
  adminEmail: string;
}> {
  const supabase = await createPlatformClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) throw new Error("Not authenticated");

  const { data: admin } = await supabaseAdmin
    .from("platform_admins")
    .select("id, email, is_active")
    .eq("supabase_user_id", data.claims.sub)
    .single();

  if (!admin || !admin.is_active) {
    throw new Error("Platform admin access required");
  }

  const currentAal = (data.claims as { aal?: string }).aal ?? "aal1";
  const strictMfaEnv = process.env.PLATFORM_REQUIRE_MFA === "true";

  if (currentAal !== "aal2") {
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const hasVerifiedMfa = aalData?.nextLevel === "aal2";
    if (hasVerifiedMfa || strictMfaEnv) {
      throw new Error(
        hasVerifiedMfa
          ? "Multi-factor authentication verification (AAL2) is required."
          : "Enroll and verify TOTP multi-factor authentication in Platform Settings before performing administrative actions."
      );
    }
  }

  return { adminId: admin.id, adminEmail: admin.email ?? "unknown" };
}
