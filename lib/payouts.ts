/**
 * Shared payout-visibility data layer.
 *
 * RoomLine takes online bookings via Paystack split payments: each guest charge
 * settles the hotel's share directly to that hotel's Paystack subaccount bank
 * account (Ghana default: AUTO, T+1). Paystack emits no settlement webhook, so
 * payout state is read live from the Settlements API and reconciled against our
 * own payment rows here. No sync table, no cron — the Settlements calls are
 * cached in lib/paystack, so this stays cheap on the render path.
 *
 * This module does NO authorization. Callers (a hotel server action, a platform
 * admin action) must gate access and pass an already-scoped Supabase client;
 * every DB read here still filters by hotel_id as defence in depth.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { toMinor } from "@/lib/money";
import {
  listSettlements,
  listSettlementTransactions,
  resolveSubaccountId,
} from "@/lib/paystack";

export type PayoutStatus = "paid_out" | "processing" | "awaiting" | "failed";

export interface PayoutReservation {
  /** group_id for a multi-room reservation, else the single booking id. */
  key: string;
  reference: string;
  guestName: string | null;
  /** When the guest's charge succeeded. */
  paidAt: string | null;
  /** Full charge total for the reservation, minor units. */
  amountMinor: number;
  /** Room lines in the reservation (1 for a single-room booking). */
  roomsCount: number;
  currency: string;
  status: PayoutStatus;
  /** Settlement date once paid_out/processing, else null. */
  settledAt: string | null;
}

export interface PayoutSettlementSummary {
  id: number;
  status: string;
  effectiveAmountMinor: number;
  totalAmountMinor: number;
  currency: string;
  settlementDate: string;
}

export interface HotelPayoutOverview {
  /** False when the hotel has not connected a Paystack subaccount. */
  setupComplete: boolean;
  summary: {
    paidOutMinor: number;
    awaitingMinor: number;
    schedule: string | null;
    currency: string;
    fromISO: string;
    toISO: string;
  };
  reservations: PayoutReservation[];
  settlements: PayoutSettlementSummary[];
  /** Set when Paystack could not be reached; UI degrades to a retry state. */
  error?: string;
}

export interface PayoutWindow {
  /** Explicit range as yyyy-mm-dd or ISO. Takes precedence over `days`. */
  from?: string;
  to?: string;
  /** Fallback: days back from now when no explicit range. Default 30. */
  days?: number;
}

interface BuildInput {
  hotelId: string;
  subaccountCode: string | null;
  settlementSchedule: string | null;
  currency: string;
  supabase: SupabaseClient<Database>;
  window?: PayoutWindow;
}

/** Shape of the payments→bookings→guests join we read below. */
interface PaymentJoinRow {
  amount: number | string;
  currency: string | null;
  paystack_id: string | null;
  paid_at: string | null;
  booking_id: string;
  bookings:
    | {
        reference: string;
        group_id: string | null;
        rooms_count: number | null;
        source: string | null;
        created_by: string | null;
        guests: { full_name: string | null } | { full_name: string | null }[] | null;
      }
    | {
        reference: string;
        group_id: string | null;
        rooms_count: number | null;
        source: string | null;
        created_by: string | null;
        guests: { full_name: string | null } | { full_name: string | null }[] | null;
      }[]
    | null;
}

/** PostgREST returns a to-one embed as an object, but the generated types
 *  sometimes widen it to an array; collapse either to a single row. */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

function emptyOverview(
  setupComplete: boolean,
  schedule: string | null,
  currency: string,
  range: { fromISO: string; toISO: string },
  error?: string
): HotelPayoutOverview {
  return {
    setupComplete,
    summary: {
      paidOutMinor: 0,
      awaitingMinor: 0,
      schedule,
      currency,
      fromISO: range.fromISO,
      toISO: range.toISO,
    },
    reservations: [],
    settlements: [],
    ...(error ? { error } : {}),
  };
}

/** Resolve a PayoutWindow to a concrete [fromISO, toISO], never throwing.
 *  Explicit from/to win over days; the range is clamped so `to` is not in the
 *  future, from <= to, and the span never exceeds 366 days (both branches). Bad
 *  input falls back to the last 30 days. */
export function resolveRange(window?: PayoutWindow): { fromISO: string; toISO: string } {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = new Date();
  const parse = (s: string, endOfDay: boolean): Date | null => {
    const d = new Date(
      s.length <= 10 ? `${s}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z` : s
    );
    return Number.isNaN(d.getTime()) ? null : d;
  };

  if (window?.from || window?.to) {
    const parsedTo = window.to ? parse(window.to, true) : null;
    const parsedFrom = window.from ? parse(window.from, false) : null;
    const to = parsedTo && parsedTo.getTime() <= now.getTime() ? parsedTo : now;
    const fallbackFrom = new Date(to.getTime() - 30 * dayMs);
    let from = parsedFrom && parsedFrom.getTime() <= to.getTime() ? parsedFrom : fallbackFrom;
    // Cap the span so a crafted range can't force an unbounded scan.
    const maxSpanMs = 366 * dayMs;
    if (to.getTime() - from.getTime() > maxSpanMs) from = new Date(to.getTime() - maxSpanMs);
    return { fromISO: from.toISOString(), toISO: to.toISOString() };
  }

  // Same 366-day cap as the from/to branch — an uncapped `days` would otherwise
  // undo it and force an unbounded settlements/payments scan.
  const days = Math.min(Math.max(1, Math.floor(window?.days ?? 30)), 366);
  return {
    fromISO: new Date(now.getTime() - days * dayMs).toISOString(),
    toISO: now.toISOString(),
  };
}

export async function buildHotelPayoutOverview(input: BuildInput): Promise<HotelPayoutOverview> {
  const { hotelId, subaccountCode, settlementSchedule, currency, supabase } = input;
  const { fromISO, toISO } = resolveRange(input.window);

  // No subaccount yet → the hotel has not finished payment setup. Not an error.
  if (!subaccountCode)
    return emptyOverview(false, settlementSchedule, currency, { fromISO, toISO });

  try {
    // 1. Numeric subaccount id (memoised) + this window's settlements.
    const subaccountId = await resolveSubaccountId(subaccountCode);
    const settlements = await listSettlements({ subaccountId, from: fromISO, to: toISO });

    // 2. Reconciliation map: Paystack tx id (string) → the settlement that paid
    //    it. Only success/processing settlements carry payout meaning, and only
    //    those need their (bounded) transaction lists fetched.
    const txStatus = new Map<string, { settledAt: string; status: "paid_out" | "processing" }>();
    for (const s of settlements) {
      if (s.status !== "success" && s.status !== "processing") continue;
      const mapped = s.status === "success" ? "paid_out" : "processing";
      const txns = await listSettlementTransactions(s.id);
      for (const t of txns) {
        if (t.id == null) continue;
        const key = String(t.id);
        if (!txStatus.has(key)) txStatus.set(key, { settledAt: s.settlement_date, status: mapped });
      }
    }

    // 3. Online, paid reservations for this hotel in the window. Only the anchor
    //    line of a group carries a real paystack_id; siblings share group_id.
    const { data, error } = await supabase
      .from("payments")
      .select(
        "amount, currency, paystack_id, paid_at, booking_id, bookings!inner(reference, group_id, rooms_count, source, created_by, guests(full_name))"
      )
      .eq("hotel_id", hotelId)
      .eq("status", "success")
      .not("paystack_reference", "is", null)
      .eq("bookings.source", "direct")
      .is("bookings.created_by", null)
      .gte("paid_at", fromISO)
      .lte("paid_at", toISO)
      .order("paid_at", { ascending: false })
      .limit(1000);

    if (error)
      return emptyOverview(true, settlementSchedule, currency, { fromISO, toISO }, error.message);

    const rows = (data ?? []) as unknown as PaymentJoinRow[];

    // 4. Fold rows into reservations, keyed by group_id ?? booking_id.
    const byKey = new Map<string, PayoutReservation>();
    for (const row of rows) {
      const b = one(row.bookings);
      if (!b) continue;
      const key = b.group_id ?? row.booking_id;
      const rowCur = row.currency ?? currency;
      const lineMinor = toMinor(row.amount, rowCur);
      const rooms = Math.max(1, b.rooms_count ?? 1);

      let res = byKey.get(key);
      if (!res) {
        res = {
          key,
          reference: b.reference,
          guestName: one(b.guests)?.full_name ?? null,
          paidAt: row.paid_at,
          amountMinor: 0,
          roomsCount: 0,
          currency: rowCur,
          status: "awaiting",
          settledAt: null,
        };
        byKey.set(key, res);
      }
      res.amountMinor += lineMinor;
      res.roomsCount += rooms;

      // The anchor line (real paystack_id) fixes identity + payout status.
      if (row.paystack_id) {
        res.reference = b.reference;
        res.guestName = one(b.guests)?.full_name ?? res.guestName;
        res.paidAt = row.paid_at;
        const hit = txStatus.get(row.paystack_id);
        res.status = hit ? hit.status : "awaiting";
        res.settledAt = hit ? hit.settledAt : null;
      }
    }

    const reservations = [...byKey.values()].sort((a, b) =>
      (b.paidAt ?? "").localeCompare(a.paidAt ?? "")
    );

    // 5. Summary — gross online-charge totals bucketed by payout state, so the
    //    stat row reconciles exactly with the table below it. "Awaiting" folds
    //    in "processing" (money in transit but not yet in the bank).
    let paidOutMinor = 0;
    let awaitingMinor = 0;
    for (const r of reservations) {
      if (r.status === "paid_out") paidOutMinor += r.amountMinor;
      else awaitingMinor += r.amountMinor;
    }

    const settlementSummaries: PayoutSettlementSummary[] = settlements.map((s) => ({
      id: s.id,
      status: s.status,
      effectiveAmountMinor: s.effective_amount ?? 0,
      totalAmountMinor: s.total_amount ?? 0,
      currency: s.currency ?? currency,
      settlementDate: s.settlement_date,
    }));

    return {
      setupComplete: true,
      summary: {
        paidOutMinor,
        awaitingMinor,
        schedule: settlementSchedule,
        currency,
        fromISO,
        toISO,
      },
      reservations,
      settlements: settlementSummaries,
    };
  } catch (err) {
    // Paystack unreachable / rate-limited / unexpected shape. Already reported
    // to Sentry inside paystackFetch; degrade to a retry state, never a 500.
    return emptyOverview(
      true,
      settlementSchedule,
      currency,
      { fromISO, toISO },
      (err as Error)?.message ?? "Failed to load payouts"
    );
  }
}
