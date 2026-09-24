"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createPlatformClient } from "@/lib/supabase/platform-server";

/**
 * Platform admin server actions — Hotel Oversight.
 *
 * Auth: every action verifies the Supabase Auth session via getClaims() and
 * resolves an active platform_admins row. Data access uses supabaseAdmin
 * (service role) because platform admins operate across all hotels — RLS on
 * operational tables is scoped to hotel staff, not platform admins.
 *
 * Every lifecycle mutation appends a row to platform_admin_audit_logs with
 * actor identity and before/after state. Status transitions are guarded both
 * in code (allowed map) and in SQL (.eq("status", expected)) so concurrent
 * requests cannot double-apply a transition.
 */

const ALLOWED_TRANSITIONS: Record<string, string> = {
  "pending->active": "hotel.approve",
  "active->suspended": "hotel.suspend",
  "suspended->active": "hotel.reactivate",
};

async function assertPlatformAdmin(): Promise<{
  adminId: string;
  adminEmail: string;
}> {
  const supabase = await createPlatformClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) throw new Error("Not authenticated");

  const { data: admin } = await supabaseAdmin
    .from("platform_admins")
    .select("id, email, is_active")
    .eq("supabase_user_id", data.claims.sub)
    .single();

  if (!admin || !admin.is_active) {
    throw new Error("Platform admin access required");
  }
  return { adminId: admin.id, adminEmail: admin.email ?? "unknown" };
}

export type LifecycleAction = "approve" | "suspend" | "reactivate";

export async function setHotelStatus(
  hotelId: string,
  action: LifecycleAction
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate the id shape before it reaches any query — never trust client params.
    if (!/^[0-9a-f-]{36}$/i.test(hotelId)) {
      return { success: false, error: "Invalid hotel" };
    }

    const { adminId, adminEmail } = await assertPlatformAdmin();
    const target = action === "suspend" ? "suspended" : "active";

    // Read current state to validate the transition and record before/after.
    const { data: hotel } = await supabaseAdmin
      .from("hotels")
      .select("id, name, status")
      .eq("id", hotelId)
      .single();

    if (!hotel) return { success: false, error: "Hotel not found" };

    const auditAction =
      ALLOWED_TRANSITIONS[`${hotel.status}->${target}`] ??
      (action === "approve" ? "hotel.approve" : null);

    if (
      !auditAction ||
      hotel.status === target ||
      (action === "approve" && hotel.status !== "pending") ||
      (action === "suspend" && hotel.status !== "active") ||
      (action === "reactivate" && hotel.status !== "suspended")
    ) {
      return {
        success: false,
        error: `Cannot ${action} a ${hotel.status ?? "unknown"} hotel`,
      };
    }

    // Conditional update — fails if another admin changed the status meanwhile.
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("hotels")
      .update({ status: target })
      .eq("id", hotelId)
      .eq("status", hotel.status as string)
      .select("id")
      .maybeSingle();

    if (updateError) return { success: false, error: updateError.message };
    if (!updated) {
      return { success: false, error: "Hotel status changed — refresh and retry" };
    }

    const { error: auditError } = await supabaseAdmin
      .from("platform_admin_audit_logs")
      .insert({
        admin_id: adminId,
        admin_email: adminEmail,
        action: auditAction,
        hotel_id: hotelId,
        entity_type: "hotel",
        entity_id: hotelId,
        before_state: { status: hotel.status },
        after_state: { status: target },
      });

    if (auditError) {
      console.error("audit log insert failed:", auditError.message);
    }

    revalidatePath("/platform");
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ── Hotel 360 data ───────────────────────────────────────────────

export interface Hotel360Result {
  success: boolean;
  error?: string;
  profile?: {
    id: string;
    name: string;
    slug: string;
    city: string | null;
    country: string | null;
    status: string | null;
    currency: string;
    created_at: string;
    custom_domain: string | null;
    paystack_business_name: string | null;
  };
  operations?: {
    hasData: boolean;
    bookings: number;
    nightsSold: number;
    avgOccupancy: number | null;
    adr: number | null;
    revpar: number | null;
    /** Currency the ADR/RevPAR rates are denominated in. */
    rateCurrency: string | null;
    /** True when the window's bookings span multiple currencies. */
    mixedRates: boolean;
    activeRooms: number;
  };
  money?: {
    /** Per-currency — payments may be recorded in a different currency than the hotel's default. */
    collected: { currency: string; amount: number }[];
    fees: { currency: string; amount: number }[];
    outstanding: { currency: string; amount: number }[];
    lastPayments: {
      amount: number;
      currency: string;
      method: string | null;
      status: string | null;
      paid_at: string | null;
    }[];
  };
  staff?: { role: string; count: number }[];
  audit?: {
    id: string;
    admin_email: string;
    action: string;
    before_state: Record<string, unknown> | null;
    after_state: Record<string, unknown> | null;
    created_at: string;
  }[];
}

export async function getHotel360(hotelId: string): Promise<Hotel360Result> {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(hotelId)) {
      return { success: false, error: "Invalid hotel" };
    }
    await assertPlatformAdmin();

    const { data: hotel } = await supabaseAdmin
      .from("hotels")
      .select(
        "id, name, slug, city, country, status, currency, created_at, custom_domain, clerk_org_id, paystack_business_name"
      )
      .eq("id", hotelId)
      .single();

    if (!hotel) return { success: false, error: "Hotel not found" };

    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - 29);
    const windowStartStr = windowStart.toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);

    const ACTIVE = ["confirmed", "checked_in", "checked_out"];

    const [
      roomsRes,
      opsBookingsRes,
      paymentsTotalsRes,
      outstandingRes,
      lastPaymentsRes,
      staffRes,
      auditRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("rooms")
        .select("id", { count: "exact", head: true })
        .eq("hotel_id", hotelId)
        .eq("is_active", true),
      supabaseAdmin
        .from("bookings")
        .select("nights, total_amount, currency")
        .eq("hotel_id", hotelId)
        .in("status", ACTIVE)
        .gte("check_in", windowStartStr)
        .lte("check_in", todayStr),
      supabaseAdmin
        .from("payments")
        .select("amount, platform_fee, currency")
        .eq("hotel_id", hotelId)
        .eq("status", "success"),
      supabaseAdmin
        .from("bookings")
        .select("outstanding_balance, currency")
        .eq("hotel_id", hotelId)
        .in("status", ["confirmed", "checked_in", "checked_out"])
        .neq("payment_status", "paid")
        .gt("outstanding_balance", 0),
      supabaseAdmin
        .from("payments")
        .select("amount, currency, method, status, paid_at")
        .eq("hotel_id", hotelId)
        .order("created_at", { ascending: false })
        .limit(5),
      hotel.clerk_org_id
        ? supabaseAdmin
            .from("staff_profiles")
            .select("role")
            .eq("clerk_org_id", hotel.clerk_org_id)
            .eq("is_active", true)
        : Promise.resolve({ data: [] as { role: string | null }[] }),
      supabaseAdmin
        .from("platform_admin_audit_logs")
        .select(
          "id, admin_email, action, before_state, after_state, created_at"
        )
        .eq("hotel_id", hotelId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    // ── Operations (last 30 days) ──
    // Rates are derived from the dominant booking currency only — never mix.
    const activeRooms = roomsRes.count ?? 0;
    const opsRows = opsBookingsRes.data ?? [];
    const nightsSold = opsRows.reduce((s, b) => s + (b.nights ?? 0), 0);
    const hasData = opsRows.length > 0;

    const revByCur = new Map<string, { revenue: number; nights: number }>();
    for (const b of opsRows) {
      const cur = b.currency ?? "GHS";
      const cur2 = revByCur.get(cur) ?? { revenue: 0, nights: 0 };
      cur2.revenue += Number(b.total_amount);
      cur2.nights += b.nights ?? 0;
      revByCur.set(cur, cur2);
    }
    const primaryOps = Array.from(revByCur.entries()).sort(
      (a, b) => b[1].revenue - a[1].revenue
    )[0];

    const capacity = activeRooms * 30;
    const operations = {
      hasData,
      bookings: opsRows.length,
      nightsSold,
      avgOccupancy:
        hasData && capacity > 0
          ? Math.round((nightsSold / capacity) * 1000) / 10
          : null,
      adr:
        hasData && primaryOps && primaryOps[1].nights > 0
          ? Math.round(primaryOps[1].revenue / primaryOps[1].nights)
          : null,
      revpar:
        hasData && primaryOps && capacity > 0
          ? Math.round(primaryOps[1].revenue / capacity)
          : null,
      rateCurrency: primaryOps?.[0] ?? null,
      mixedRates: revByCur.size > 1,
      activeRooms,
    };

    // ── Money ──
    const paidRows = paymentsTotalsRes.data ?? [];
    const paidByCur = new Map<string, number>();
    const feeByCur = new Map<string, number>();
    for (const p of paidRows) {
      const cur = p.currency ?? "GHS";
      paidByCur.set(cur, (paidByCur.get(cur) ?? 0) + Number(p.amount));
      feeByCur.set(
        cur,
        (feeByCur.get(cur) ?? 0) + Number(p.platform_fee ?? 0)
      );
    }
    const outByCur = new Map<string, number>();
    for (const b of outstandingRes.data ?? []) {
      const cur = b.currency ?? "GHS";
      outByCur.set(
        cur,
        (outByCur.get(cur) ?? 0) + Number(b.outstanding_balance ?? 0)
      );
    }
    const sorted = (m: Map<string, number>) =>
      Array.from(m.entries())
        .map(([currency, amount]) => ({ currency, amount }))
        .sort((a, b) => b.amount - a.amount);

    const roleCounts = new Map<string, number>();
    for (const s of staffRes.data ?? []) {
      const key = s.role ?? "pending";
      roleCounts.set(key, (roleCounts.get(key) ?? 0) + 1);
    }

    return {
      success: true as const,
      profile: {
        id: hotel.id,
        name: hotel.name,
        slug: hotel.slug,
        city: hotel.city,
        country: hotel.country,
        status: hotel.status,
        currency: hotel.currency ?? "GHS",
        created_at: hotel.created_at ?? "",
        custom_domain: hotel.custom_domain,
        paystack_business_name: hotel.paystack_business_name,
      },
      operations,
      money: {
        collected: sorted(paidByCur),
        fees: sorted(feeByCur),
        outstanding: sorted(outByCur),
        lastPayments: (lastPaymentsRes.data ?? []).map((p) => ({
          amount: Number(p.amount),
          currency: p.currency ?? "GHS",
          method: p.method,
          status: p.status,
          paid_at: p.paid_at,
        })),
      },
      staff: Array.from(roleCounts.entries())
        .map(([role, count]) => ({ role, count }))
        .sort((a, b) => b.count - a.count),
      audit: (auditRes.data ?? []).map((row) => ({
        id: row.id,
        admin_email: row.admin_email,
        action: row.action,
        before_state:
          row.before_state && typeof row.before_state === "object"
            ? (row.before_state as Record<string, unknown>)
            : null,
        after_state:
          row.after_state && typeof row.after_state === "object"
            ? (row.after_state as Record<string, unknown>)
            : null,
        created_at: row.created_at,
      })),
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
