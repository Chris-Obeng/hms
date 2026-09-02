"use server";

import { requireAuth, toActionError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface NotificationItem {
  id: string;
  type: string | null;
  title: string;
  message: string;
  booking_id: string | null;
  is_read: boolean;
  created_at: string | null;
}

const visibleToStaff = (staffId: string) =>
  `recipient_staff_id.eq.${staffId},recipient_staff_id.is.null`;

export async function fetchNotificationsAction(
  hotelId: string
): Promise<{ success: true; data: NotificationItem[]; unreadCount: number } | { success: false; error: string }> {
  try {
    const ctx = await requireAuth();
    if (ctx.hotelId !== hotelId) {
      return { success: false, error: "Access denied" };
    }

    const supabase = await createClient();

    // Query exact count of unread notifications
    const { count, error: countError } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotelId)
      .eq("is_read", false)
      .is("archived_at", null)
      .or(visibleToStaff(ctx.staffId));

    if (countError) {
      return { success: false, error: countError.message };
    }

    const { data, error } = await supabase
      .from("notifications")
      .select("id, type, title, message, booking_id, is_read, created_at, created_by_staff_id")
      .eq("hotel_id", hotelId)
      .is("archived_at", null)
      .or(visibleToStaff(ctx.staffId))
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return { success: false, error: error.message };
    }

    return { 
      success: true, 
      data: (data ?? []) as NotificationItem[], 
      unreadCount: count ?? 0 
    };
  } catch (err) {
    return toActionError(err, { action: "notifications.fetch", hotelId });
  }
}

export async function markAllReadAction(
  hotelId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const ctx = await requireAuth();
    if (ctx.hotelId !== hotelId) {
      return { success: false, error: "Access denied" };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("hotel_id", hotelId)
      .eq("is_read", false)
      .is("archived_at", null)
      .or(visibleToStaff(ctx.staffId));

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return toActionError(err, { action: "notifications.markAllRead", hotelId });
  }
}

export async function clearReadNotificationsAction(hotelId: string) {
  try {
    const ctx = await requireAuth();
    if (ctx.hotelId !== hotelId) return { success: false as const, error: "Access denied" };
    const supabase = await createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ archived_at: new Date().toISOString() })
      .eq("hotel_id", hotelId)
      .eq("is_read", true)
      .is("archived_at", null)
      .or(visibleToStaff(ctx.staffId));
    if (error) return { success: false as const, error: error.message };
    return { success: true as const };
  } catch (err) {
    return toActionError(err, { action: "notifications.clearRead", hotelId });
  }
}

export async function markSingleReadAction(
  notificationId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const ctx = await requireAuth();
    const supabase = await createClient();

    // Directly update matching id and hotel_id, returning the updated row to verify authorization/existence
    const { data, error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("hotel_id", ctx.hotelId)
      .select("id");

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      return { success: false, error: "Notification not found or access denied" };
    }

    return { success: true };
  } catch (err) {
    return toActionError(err, { action: "notifications.markSingleRead" });
  }
}
