/**
 * Server-side helper to fan out internal + push alerts to active hotel staff
 * while honoring each staff member's `notification_prefs` and excluding the
 * staff actor who triggered the event.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { kickDeliveryWorker } from "@/lib/notifications/kick-delivery";
import { captureSupabaseError } from "@/lib/observability/sentry";

export type StaffNotificationPrefKey =
  | "new_booking"
  | "payment_received"
  | "booking_cancelled"
  | "check_in_reminder"
  | "check_out_reminder"
  | "staff_access_request";

export interface FanoutStaffNotificationInput {
  hotelId: string;
  clerkOrgId?: string | null;
  type:
    | StaffNotificationPrefKey
    | "payment_failed"
    | "channel_conflict"
    | "test_push";
  prefKey?: StaffNotificationPrefKey;
  title: string;
  message: string;
  bookingId?: string | null;
  dedupeKey?: string | null;
  excludeStaffId?: string | null;
  /** Optional role filter (e.g. only managers/admins for staff access alerts). */
  onlyRoles?: string[];
}

export async function notifyHotelStaff(input: FanoutStaffNotificationInput): Promise<void> {
  try {
    let orgId = input.clerkOrgId ?? null;
    if (!orgId) {
      const { data: hotel, error: hotelErr } = await supabaseAdmin
        .from("hotels")
        .select("clerk_org_id")
        .eq("id", input.hotelId)
        .maybeSingle();
      if (hotelErr || !hotel?.clerk_org_id) return;
      orgId = hotel.clerk_org_id;
    }

    let query = supabaseAdmin
      .from("staff_profiles")
      .select("id, role, notification_prefs")
      .eq("clerk_org_id", orgId)
      .eq("is_active", true);

    if (input.excludeStaffId) {
      query = query.neq("id", input.excludeStaffId);
    }
    if (input.onlyRoles && input.onlyRoles.length > 0) {
      query = query.in("role", input.onlyRoles);
    }

    const { data: recipients, error: recipientsErr } = await query;
    if (recipientsErr || !recipients?.length) {
      if (recipientsErr) {
        captureSupabaseError(recipientsErr, "staff_profiles.select.notify_fanout", {
          scope: "notifications",
          hotelId: input.hotelId,
          bookingId: input.bookingId ?? undefined,
        });
      }
      return;
    }

    const prefKey = input.prefKey;
    const rows = recipients
      .filter((staff) => {
        if (!prefKey) return true;
        const prefs = staff.notification_prefs as Record<string, boolean> | null;
        return prefs?.[prefKey] !== false;
      })
      .map((staff) => ({
        hotel_id: input.hotelId,
        recipient_staff_id: staff.id,
        created_by_staff_id: input.excludeStaffId ?? null,
        type: input.type,
        title: input.title,
        message: input.message,
        booking_id: input.bookingId ?? null,
        ...(input.dedupeKey ? { dedupe_key: input.dedupeKey } : {}),
        is_read: false,
      }));

    if (!rows.length) return;

    const { error: insertErr } = await supabaseAdmin.from("notifications").insert(rows);
    if (insertErr) {
      // 23505 = idempotent replay when dedupeKey is provided (e.g. webhook retry).
      if (input.dedupeKey && insertErr.code === "23505") {
        return;
      }
      console.error("[notifyHotelStaff] insert failed", {
        hotelId: input.hotelId,
        type: input.type,
        error: insertErr.message,
      });
      captureSupabaseError(insertErr, "notifications.insert.notify_fanout", {
        scope: "notifications",
        hotelId: input.hotelId,
        bookingId: input.bookingId ?? undefined,
        tags: { "notification.type": input.type },
      });
      return;
    }

    kickDeliveryWorker();
  } catch (err) {
    console.error("[notifyHotelStaff] unexpected error", err);
  }
}
