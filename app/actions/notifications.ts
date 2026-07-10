"use server";

import { requireAuth } from "@/lib/auth";
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
      .eq("is_read", false);

    if (countError) {
      return { success: false, error: countError.message };
    }

    const { data, error } = await supabase
      .from("notifications")
      .select("id, type, title, message, booking_id, is_read, created_at")
      .eq("hotel_id", hotelId)
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
  } catch (error: any) {
    console.error("fetchNotificationsAction error:", error);
    return { success: false, error: error.message || "Failed to fetch notifications" };
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
      .eq("is_read", false);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error("markAllReadAction error:", error);
    return { success: false, error: error.message || "Failed to mark all as read" };
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
  } catch (error: any) {
    console.error("markSingleReadAction error:", error);
    return { success: false, error: error.message || "Failed to mark notification as read" };
  }
}
