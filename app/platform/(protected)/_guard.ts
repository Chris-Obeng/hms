import { supabaseAdmin } from "@/lib/supabase/admin";
import { createPlatformClient } from "@/lib/supabase/platform-server";

/**
 * Authoritative platform-admin check, shared by every platform server action.
 *
 * Verifies the Supabase Auth session (getClaims — local JWT verify, no network)
 * and resolves an ACTIVE platform_admins row via the service-role client, since
 * platform admins operate across all hotels and are not covered by tenant RLS.
 * Throws when the caller is not an active admin; callers map the throw to a
 * failed result. Not a server action itself (no "use server") — it must never be
 * callable from the client, only composed into actions.
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
  return { adminId: admin.id, adminEmail: admin.email ?? "unknown" };
}
