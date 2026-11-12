"use server";

import { createClient } from "@/lib/supabase/server";
import { requireMinRole } from "@/lib/auth";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { type HotelCurrency } from "@/lib/money";

// ── Hotel Profile ────────────────────────────────────────────────────

export const hotelSettingsSchema = z.object({
  name: z.string().min(1, "Hotel name is required"),
  address: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  country: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
  checkInTime: z.string().optional().or(z.literal("")),
  checkOutTime: z.string().optional().or(z.literal("")),
  timezone: z.string().optional().or(z.literal("")),
  currency: z.literal("GHS").default("GHS"),
  cancellationPolicy: z.string().max(500).optional().or(z.literal("")),
  taxEnabled: z.boolean().default(false),
  taxPercentage: z.number().min(0).max(100).default(0),
});

export type HotelProfileInput = z.infer<typeof hotelSettingsSchema>;

export async function getHotelProfile(): Promise<
  | { success: true; data: HotelProfileInput & { id: string; logoUrl: string | null; coverImageUrl: string | null } }
  | { success: false; error: string }
> {
  try {
    const ctx = await requireMinRole("super_admin", "access hotel settings");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("hotels")
      .select("name, address, city, country, phone, email, description, check_in_time, check_out_time, timezone, currency, cancellation_policy, logo_url, cover_image_url, settings")
      .eq("id", ctx.hotelId)
      .single();

    if (error || !data) return { success: false, error: error?.message || "Hotel not found" };

    const settings = (data.settings as Record<string, unknown>) ?? {};

    return {
      success: true,
      data: {
        id: ctx.hotelId,
        name: data.name,
        address: data.address || "",
        city: data.city || "",
        country: data.country || "",
        phone: data.phone || "",
        email: data.email || "",
        description: data.description || "",
        checkInTime: data.check_in_time || "",
        checkOutTime: data.check_out_time || "",
        timezone: data.timezone || "",
        currency: (data.currency as HotelCurrency) || "GHS",
        cancellationPolicy: data.cancellation_policy || "",
        logoUrl: data.logo_url,
        coverImageUrl: data.cover_image_url,
        taxEnabled: (settings.tax_enabled as boolean) ?? false,
        taxPercentage: (settings.tax_percentage as number) ?? 0,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to fetch hotel profile",
    };
  }
}

export async function updateHotelProfile(
  input: HotelProfileInput
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const ctx = await requireMinRole("super_admin", "update hotel settings");
    const supabase = await createClient();

    const parsed = hotelSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message || "Validation failed" };
    }

    const data = parsed.data;

    // Read existing settings to preserve other keys (e.g. payment_policy)
    const { data: existing } = await supabase
      .from("hotels")
      .select("settings")
      .eq("id", ctx.hotelId)
      .single();

    const existingSettings = (existing?.settings as Record<string, unknown>) ?? {};

    const { error } = await supabase
      .from("hotels")
      .update({
        name: data.name,
        address: data.address || null,
        city: data.city || null,
        country: data.country || null,
        phone: data.phone || null,
        email: data.email || null,
        description: data.description || null,
        check_in_time: data.checkInTime || null,
        check_out_time: data.checkOutTime || null,
        timezone: data.timezone || null,
        currency: data.currency,
        cancellation_policy: data.cancellationPolicy || null,
        settings: {
          ...existingSettings,
          tax_enabled: data.taxEnabled,
          tax_percentage: data.taxPercentage,
        },
      })
      .eq("id", ctx.hotelId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/settings");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update hotel profile",
    };
  }
}

// ── Notification Preferences ─────────────────────────────────────────

export async function getNotificationPrefs(): Promise<
  | { success: true; data: Record<string, boolean> }
  | { success: false; error: string }
> {
  try {
    const ctx = await requireMinRole("read_only", "view notification preferences");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("staff_profiles")
      .select("notification_prefs")
      .eq("clerk_user_id", ctx.userId)
      .eq("clerk_org_id", ctx.orgId)
      .single();

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: (data?.notification_prefs as Record<string, boolean>) || {},
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to fetch preferences",
    };
  }
}

export async function updateNotificationPrefs(
  prefs: Record<string, boolean>
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const ctx = await requireMinRole("read_only", "update notification preferences");
    const supabase = await createClient();

    const { error } = await supabase
      .from("staff_profiles")
      .update({ notification_prefs: prefs })
      .eq("clerk_user_id", ctx.userId)
      .eq("clerk_org_id", ctx.orgId);

    if (error) return { success: false, error: error.message };

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update preferences",
    };
  }
}
