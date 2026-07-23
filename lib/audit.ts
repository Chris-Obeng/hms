/**
 * lib/audit.ts
 * Append-only audit log writer. Never throws — a log failure must never
 * block the action that triggered it.
 */

import { SupabaseClient } from "@supabase/supabase-js";

export type AuditAction =
  // Bookings
  | "booking.created"
  | "booking.confirmed"
  | "booking.cancelled"
  | "booking.checked_in"
  | "booking.checked_out"
  | "booking.notes_updated"
  | "booking.status_changed"
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
  | "hotel.beds24_configured"
  | "hotel.arkesel_configured"
  // Rooms
  | "room.block_created"
  | "room.block_deleted"
  | "room.status_changed"
  | "room.note_updated"
  // Night Audit
  | "night_audit.completed";

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
 */
export async function writeAuditLog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  entry: AuditEntry
): Promise<void> {
  try {
    await supabase.from("audit_logs").insert({
      hotel_id: entry.hotelId,
      staff_id: entry.staffId ?? null,
      staff_name: entry.staffName ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      before_state: entry.beforeState ?? null,
      after_state: entry.afterState ?? null,
    });
  } catch (err) {
    // Never propagate — a failed audit write must not break the parent action
    console.error("[audit_log] write failed:", err instanceof Error ? err.message : err);
  }
}
