"use server";

import { requireMinRole, toActionError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requestNightAudit } from "@/lib/night-audit/durable-close";
import type { NightAuditSummary } from "@/lib/night-audit/summary";

export type { NightAuditSummary };

export async function getNightAuditData(dateStr?: string): Promise<NightAuditSummary> {
  const ctx = await requireMinRole("read_only", "view Night Audit");
  if (ctx.hotel.status !== "active") throw new Error("Active hotel access is required.");
  const supabase = await createClient();
  return requestNightAudit(supabase, ctx.hotelId, { close: false, date: dateStr });
}

export async function executeNightAudit(
  dateStr: string,
  notes?: string,
): Promise<
  | { success: true; message: string; summary: NightAuditSummary }
  | { success: false; error: string }
> {
  try {
    const ctx = await requireMinRole("manager", "close a business date");
    if (ctx.hotel.status !== "active") throw new Error("Active hotel access is required.");
    const supabase = await createClient();
    const summary = await requestNightAudit(supabase, ctx.hotelId, { close: true, date: dateStr, notes });
    revalidatePath("/dashboard/night-audit");
    return {
      success: true,
      message: summary.replayed ? `Business date ${summary.auditDate} was already closed.` : `Business date ${summary.auditDate} review closed.`,
      summary,
    };
  } catch (err) {
    return toActionError(err, { action: "night-audit.executeNightAudit" });
  }
}
