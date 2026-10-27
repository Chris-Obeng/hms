import type { SupabaseClient } from "@supabase/supabase-js";
import { fromMinor, sumMinor } from "@/lib/money";
import { assertCurrency, moneyMinor } from "./bi-math";
import { readAllPages } from "./pagination";

export interface TenderTotal { method: string; count: number; amount: number }
export interface TenderMix { byMethod: TenderTotal[]; totalMinor: number }

interface PaymentRow { id: string; amount: unknown; method: string | null; currency: string }

/**
 * Successful collections inside one property-day window, grouped by tender.
 *
 * One implementation for every report that needs a tender mix: the window, the
 * `status = success` filter, the hotel scope and the currency assertion must be
 * identical wherever cash received is shown, or two tabs quietly disagree.
 */
export async function loadTenderMix(
  supabase: SupabaseClient,
  hotelId: string,
  currency: string,
  startISO: string,
  endISO: string,
): Promise<TenderMix> {
  const payments = await readAllPages<PaymentRow>("payments", (after, size) => {
    let q = supabase.from("payments").select("id, amount, method, currency", { count: "exact" })
      .eq("hotel_id", hotelId).eq("status", "success")
      .gte("paid_at", startISO).lt("paid_at", endISO).order("id").limit(size);
    if (after) q = q.gt("id", after);
    return q;
  });
  const methodMap = new Map<string, { count: number; minor: number[] }>();
  for (const payment of payments) {
    assertCurrency(payment.currency, currency);
    const key = payment.method || "other", value = methodMap.get(key) ?? { count: 0, minor: [] };
    value.count++;
    value.minor.push(moneyMinor(payment.amount, currency));
    methodMap.set(key, value);
  }
  const byMethod: TenderTotal[] = [...methodMap]
    .map(([method, value]) => ({ method, count: value.count, amount: fromMinor(sumMinor(value.minor), currency) }))
    .sort((a, b) => b.amount - a.amount || a.method.localeCompare(b.method));
  return { byMethod, totalMinor: sumMinor(byMethod.map((row) => moneyMinor(row.amount, currency))) };
}
