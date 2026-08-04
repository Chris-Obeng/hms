"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  DEFAULT_TEMPLATES,
  ALL_EVENT_TYPES,
  type NotificationTemplatesMap,
  type NotificationEventType,
  type NotificationTemplate,
} from "@/lib/notification-templates";

// ── Auth helper ───────────────────────────────────────────────────

async function getSuperAdmin() {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) throw new Error("Not authenticated");

  const supabase = await createClient();

  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, settings")
    .eq("clerk_org_id", orgId)
    .single();

  if (!hotel) throw new Error("Hotel not found");

  const { data: staff } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("clerk_user_id", userId)
    .eq("clerk_org_id", orgId)
    .single();

  if (staff?.role !== "super_admin") throw new Error("Super Admin only");

  return { supabase, hotelId: hotel.id, settings: (hotel.settings ?? {}) as Record<string, unknown> };
}

// ── Get templates ─────────────────────────────────────────────────

export async function getNotificationTemplates(): Promise<
  | { success: true; data: Record<NotificationEventType, NotificationTemplate> }
  | { success: false; error: string }
> {
  try {
    const { settings } = await getSuperAdmin();

    const stored = (settings?.notification_templates ?? {}) as NotificationTemplatesMap;

    // Merge stored overrides over defaults so the UI always has complete objects
    const merged = {} as Record<NotificationEventType, NotificationTemplate>;
    for (const key of ALL_EVENT_TYPES) {
      merged[key] = { ...DEFAULT_TEMPLATES[key], ...(stored[key] ?? {}) };
    }

    return { success: true, data: merged };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ── Save templates ────────────────────────────────────────────────

export async function saveNotificationTemplates(
  templates: NotificationTemplatesMap
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { supabase, hotelId, settings } = await getSuperAdmin();

    // Sanitize: only store known event types, strip unknown keys
    const sanitized: NotificationTemplatesMap = {};
    for (const key of ALL_EVENT_TYPES) {
      const tpl = templates[key];
      if (!tpl) continue;
      sanitized[key] = {
        email_enabled: Boolean(tpl.email_enabled),
        email_subject: typeof tpl.email_subject === "string" ? tpl.email_subject.slice(0, 200) : undefined,
        email_template: typeof tpl.email_template === "string" ? tpl.email_template.slice(0, 4000) : undefined,
      };
    }

    const updatedSettings = {
      ...settings,
      notification_templates: sanitized,
    };

    const { error } = await supabase
      .from("hotels")
      .update({ settings: updatedSettings })
      .eq("id", hotelId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/settings/notifications");
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
