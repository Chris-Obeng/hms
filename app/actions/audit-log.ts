"use server";

/**
 * app/actions/audit-log.ts
 *
 * Paginated read of the hotel audit trail for the day-segmented,
 * infinite-scroll audit log page. Auth goes through requireAuth() plus the
 * "audit:read" capability (super_admin only), matching the page-level gate.
 */

import { AuthError, requireAuth, toActionError } from "@/lib/auth";
import { can } from "@/lib/roles";
import { fetchAuditLogPage, type AuditLogPageData } from "@/lib/audit-feed";

export type FetchAuditLogDaysResult =
  | { success: true; page: AuditLogPageData }
  | { success: false; error: string };

export async function fetchAuditLogDays(
  cursor: string | null
): Promise<FetchAuditLogDaysResult> {
  try {
    const ctx = await requireAuth();
    if (!can(ctx.role, "audit:read")) {
      throw new AuthError(
        "Only the hotel Super Admin can view the audit log.",
        "FORBIDDEN"
      );
    }
    const page = await fetchAuditLogPage(ctx.hotelId, cursor);
    return { success: true, page };
  } catch (err) {
    return toActionError(err, { action: "audit_log.fetch_days" });
  }
}
