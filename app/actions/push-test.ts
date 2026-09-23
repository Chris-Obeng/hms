"use server";

import { requireAuth, toActionError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { kickDeliveryWorker } from "@/lib/notifications/kick-delivery";

export async function sendTestPushAction(): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await requireAuth();
    const { error } = await supabaseAdmin.from("notifications").insert({
      hotel_id: ctx.hotelId,
      recipient_staff_id: ctx.staffId,
      created_by_staff_id: ctx.staffId,
      type: "test_push",
      title: "Test notification",
      message: "If you can read this and see a push alert, delivery works end to end.",
      booking_id: null,
      is_read: false,
    });
    if (error) return { success: false, error: error.message };
    kickDeliveryWorker();
    return { success: true };
  } catch (err) {
    return toActionError(err, { action: "push.sendTestPush" });
  }
}
