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
): Promise<
  | { success: true; data: NotificationItem[]; unreadCount: number }
  | { success: false; error: string }
> {
  try {
    const ctx = await requireAuth();
    if (ctx.hotelId !== hotelId) {
      return { success: false, error: "Access denied" };
    }

    const supabase = await createClient();

    const [countRes, listRes] = await Promise.all([
      supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("hotel_id", hotelId)
        .eq("is_read", false)
        .is("archived_at", null)
        .or(visibleToStaff(ctx.staffId)),
      supabase
        .from("notifications")
        .select("id, type, title, message, booking_id, is_read, created_at")
        .eq("hotel_id", hotelId)
        .is("archived_at", null)
        .or(visibleToStaff(ctx.staffId))
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    if (countRes.error) {
      return { success: false, error: countRes.error.message };
    }

    if (listRes.error) {
      return { success: false, error: listRes.error.message };
    }

    return {
      success: true,
      data: (listRes.data ?? []) as NotificationItem[],
      unreadCount: countRes.count ?? 0,
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

export async function clearReadNotificationsAction(
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
      .update({ archived_at: new Date().toISOString() })
      .eq("hotel_id", hotelId)
      .eq("is_read", true)
      .is("archived_at", null)
      .or(visibleToStaff(ctx.staffId));

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return toActionError(err, { action: "notifications.clearRead", hotelId });
  }
}

export async function markSingleReadAction(
  notificationId: string,
  isRead = true
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const ctx = await requireAuth();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("notifications")
      .update({
        is_read: isRead,
        read_at: isRead ? new Date().toISOString() : null,
      })
      .eq("id", notificationId)
      .eq("hotel_id", ctx.hotelId)
      .is("archived_at", null)
      .or(visibleToStaff(ctx.staffId))
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

export async function archiveSingleNotificationAction(
  notificationId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const ctx = await requireAuth();
    const supabase = await createClient();

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("notifications")
      .update({ archived_at: now, is_read: true, read_at: now })
      .eq("id", notificationId)
      .eq("hotel_id", ctx.hotelId)
      .is("archived_at", null)
      .or(visibleToStaff(ctx.staffId))
      .select("id");

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      return { success: false, error: "Notification not found or access denied" };
    }

    return { success: true };
  } catch (err) {
    return toActionError(err, { action: "notifications.archiveSingle" });
  }
}
