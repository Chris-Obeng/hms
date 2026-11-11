"use server";

/**
 * app/actions/audit-log.ts
 *
 * Paginated read of the hotel audit trail for the audit log page. Auth goes
 * through requireAuth() plus the "audit:read" capability (super_admin only),
 * matching the page-level gate.
 */

import { AuthError, requireAuth, toActionError } from "@/lib/auth";
import { can } from "@/lib/roles";
import { fetchAuditLogPage, type AuditLogPage } from "@/lib/audit-feed";
import type { AuditCategoryId } from "@/lib/audit-format";

export type FetchAuditLogResult =
  | { success: true; page: AuditLogPage }
  | { success: false; error: string };

export async function fetchAuditLogEntries(filters: {
  page: number;
  category: AuditCategoryId;
  query: string;
}): Promise<FetchAuditLogResult> {
  try {
    const ctx = await requireAuth();
    if (!can(ctx.role, "audit:read")) {
      throw new AuthError(
        "Only the hotel Super Admin can view the audit log.",
        "FORBIDDEN"
      );
    }
    const page = await fetchAuditLogPage(ctx.hotelId, filters);
    return { success: true, page };
  } catch (err) {
    return toActionError(err, { action: "audit_log.fetch_entries" });
  }
}
