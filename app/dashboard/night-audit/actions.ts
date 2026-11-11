"use server";

import { requireMinRole, toActionError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requestNightAudit } from "@/lib/night-audit/durable-close";
import type { NightAuditSummary } from "@/lib/night-audit/summary";

export type { NightAuditSummary };

export interface NightAuditView {
  summary: NightAuditSummary;
  /** Room revenue with the hotel's configured tax added — display only; the close receipt stays net. */
  roomRevenueInclTax: number | null;
}

export async function getNightAuditData(dateStr?: string): Promise<NightAuditView> {
  const ctx = await requireMinRole("read_only", "view Night Audit");
  if (ctx.hotel.status !== "active") throw new Error("Active hotel access is required.");
  const supabase = await createClient();
  const summary = await requestNightAudit(supabase, ctx.hotelId, { close: false, date: dateStr });
  // Gross-up with the hotel's own tax rate, mirroring lib/bookings/cart.ts
  // (tax = subtotal × percentage, charged on top of the net rate).
  const settings = (ctx.hotel.settings ?? {}) as { tax_enabled?: boolean; tax_percentage?: number };
  const taxRate = settings.tax_enabled === true ? (settings.tax_percentage ?? 0) : 0;
  const roomRevenueInclTax = summary.roomRevenue === null
    ? null
    : taxRate > 0
      ? summary.roomRevenue * (1 + taxRate / 100)
      : summary.roomRevenue;
  return { summary, roomRevenueInclTax };
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
