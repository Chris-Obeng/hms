/**
 * lib/audit.ts
 * Append-only audit log writer. Never throws — a log failure must never
 * block the action that triggered it.
 */

import { SupabaseClient } from "@supabase/supabase-js";

import { captureSupabaseError } from "@/lib/observability/sentry";

export type AuditAction =
  // Bookings
  | "booking.created"
  | "booking.confirmed"
  | "booking.cancelled"
  | "booking.checked_in"
  | "booking.checked_out"
  | "booking.notes_updated"
  | "booking.status_changed"
  | "booking.move"
  | "booking.room_assigned"
  | "booking.room_unassigned"
  | "booking.room_type_change"
  | "booking.aborted_unpaid"
  // Payments
  | "payment.recorded"
  | "payment.refunded"
  // Staff
  | "staff.approved"
  | "staff.rejected"
  | "staff.deactivated"
  | "staff.reactivated"
  | "staff.role_changed"
  // Settings
  | "hotel.settings_updated"
  | "hotel.paystack_configured"
  // Rooms
  | "room.block_created"
  | "room.block_updated"
  | "room.block_deleted"
  | "room.status_changed"
  | "room.note_updated"
  | "room.updated"
  // Night Audit
  | "night_audit.completed"
  // Rates & pricing
  | "rate.season_created"
  | "rate.season_updated"
  | "rate.season_duplicated"
  | "rate.season_deleted"
  | "rate.season_override_upserted"
  | "rate.daily_override_upserted"
  | "rate.daily_override_deleted"
  | "rate.daily_override_bulk_upserted"
  | "rate.daily_override_bulk_deleted"
  | "rate.plan_created"
  | "rate.plan_updated"
  | "rate.restriction_upserted"
  | "rate.restriction_overridden";

export interface AuditEntry {
  hotelId: string;
  staffId?: string | null;
  staffName?: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
}

/**
 * Write one audit log entry. Fire-and-forget safe.
 * Pass the supabase **admin** client when calling from API routes,
 * or the server client when calling from server actions.
 *
 * A rejected write is reported to Sentry rather than swallowed. PostgREST
 * *resolves* with an `{ error }` payload for an RLS or constraint rejection
 * instead of throwing, so the `catch` below never fires for the most likely
 * failure mode — without the explicit check, the audit trail can be silently
 * empty while every call site believes it wrote a row.
 */
export async function writeAuditLog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  entry: AuditEntry
): Promise<void> {
  try {
    const { error } = await supabase.from("audit_logs").insert({
      hotel_id: entry.hotelId,
      staff_id: entry.staffId ?? null,
      staff_name: entry.staffName ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      before_state: entry.beforeState ?? null,
      after_state: entry.afterState ?? null,
    });

    if (error) {
      captureSupabaseError(error, "audit_logs.insert", {
        level: "error",
        hotelId: entry.hotelId,
        tags: { "audit.action": entry.action },
        fingerprint: ["audit-log-write", entry.action],
      });
    }
  } catch (err) {
    // Never propagate — a failed audit write must not break the parent action
    console.error("[audit_log] write failed:", err instanceof Error ? err.message : err);
  }
}
