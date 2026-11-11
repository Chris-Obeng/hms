"use server";

import { assertCurrency, moneyMinor } from "@/lib/reports/bi-math";
import { businessDayBounds, businessToday } from "@/lib/business-date";
import { createClient } from "@/lib/supabase/server";
import { requireMinRole, toActionError } from "@/lib/auth";
import { fromMinor, sumMinor } from "@/lib/money";
import { readAllPages } from "@/lib/reports/pagination";

const PAGE_SIZE = 50;
const MAX_RANGE_DAYS = 366;

export type PaymentActivityStatus = "all" | "success" | "pending" | "failed" | "refunded";

export interface PaymentActivityRow {
  id: string;
  amount: number;
  currency: string;
  method: string | null;
  status: string | null;
  paidAt: string | null;
  paystackReference: string | null;
  notes: string | null;
  bookingId: string | null;
  bookingReference: string | null;
  guestName: string | null;
  recordedBy: string | null;
}

export interface PaymentActivityResult {
  rows: PaymentActivityRow[];
  currency: string;
  timeZone: string;
  startDate: string;
  endDate: string;
  page: number;
  pageSize: number;
  totalCount: number;
  hasNextPage: boolean;
  totals: {
    successfulAmount: number;
    successfulCount: number;
    allAmount: number;
    allCount: number;
    /** Successful payments taken online (Paystack rails), never split by rail type. */
    onlineAmount: number;
    onlineCount: number;
    /** Successful payments collected by staff, by tender type. */
    staffAmount: number;
    staffCount: number;
  };
}

export interface PaymentActivityInput {
  startDate?: string;
  endDate?: string;
  page?: number;
  status?: PaymentActivityStatus;
  method?: string;
  search?: string;
}

function validDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function shiftDate(value: string, days: number): string {
  const parsed = new Date(`${value}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function rangeDays(startDate: string, endDate: string): number {
  return (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000 + 1;
}

function cleanSearch(value: string | undefined): string {
  return (value ?? "").trim().slice(0, 120);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function nested<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

interface PaymentJoinRow {
  id: string;
  amount: number | string;
  currency: string | null;
  method: string | null;
  status: string | null;
  paid_at: string | null;
  paystack_reference: string | null;
  notes: string | null;
  booking_id: string | null;
  recorded_by: string | null;
  bookings: { reference: string | null; guests: { full_name: string | null } | { full_name: string | null }[] | null } | { reference: string | null; guests: { full_name: string | null } | { full_name: string | null }[] | null }[] | null;
}

function normalizeRow(row: PaymentJoinRow, currency: string, staffNames: Map<string, string>): PaymentActivityRow {
  const rowCurrency = assertCurrency(row.currency ?? currency, currency);
  const booking = nested(row.bookings);
  const guest = nested(booking?.guests);
  return {
    id: row.id,
    amount: Number(row.amount),
    currency: rowCurrency,
    method: row.method,
    status: row.status,
    paidAt: row.paid_at,
    paystackReference: row.paystack_reference,
    notes: row.notes,
    bookingId: row.booking_id,
    bookingReference: booking?.reference ?? null,
    guestName: guest?.full_name ?? null,
    recordedBy: row.recorded_by ? staffNames.get(row.recorded_by) ?? null : null,
  };
}

export async function getPaymentActivity(input: PaymentActivityInput = {}): Promise<{ success: true; data: PaymentActivityResult } | { success: false; error: string }> {
  try {
    const ctx = await requireMinRole("read_only", "view payment activity");
    if (ctx.hotel.status !== "active") throw new Error("Active hotel access is required.");

    const supabase = await createClient();
    const { data: hotel, error: hotelError } = await supabase
      .from("hotels")
      .select("timezone")
      .eq("id", ctx.hotelId)
      .eq("clerk_org_id", ctx.orgId)
      .single();
    if (hotelError || !hotel?.timezone) throw new Error("Payment activity requires a configured property timezone.");

    const today = businessToday(hotel.timezone);
    const startDate = input.startDate ?? today;
    const endDate = input.endDate ?? startDate;
    if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) throw new Error("Choose a valid payment date range.");
    if (endDate > today) throw new Error("Payment dates cannot be in the future.");
    if (rangeDays(startDate, endDate) > MAX_RANGE_DAYS) throw new Error("Choose a payment date range of 366 days or fewer.");

    const page = Math.max(1, Math.floor(input.page ?? 1));
    const status = input.status && ["all", "success", "pending", "failed", "refunded"].includes(input.status) ? input.status : "all";
    const method = input.method && input.method !== "all" ? input.method : "";
    const search = cleanSearch(input.search);
    const startBounds = businessDayBounds(startDate, hotel.timezone);
    const endBounds = businessDayBounds(shiftDate(endDate, 1), hotel.timezone);

    let bookingIds: string[] | null = null;
    let paymentIds: string[] | null = null;
    if (search) {
      const pattern = `%${escapeLike(search)}%`;
      const [guests, references, paystackReferences] = await Promise.all([
        readAllPages("payment search guests", (after, size) => {
          let query = supabase.from("guests").select("id", { count: "exact" }).eq("hotel_id", ctx.hotelId).ilike("full_name", pattern).order("id").limit(size);
          if (after) query = query.gt("id", after);
          return query;
        }),
        readAllPages("payment search booking references", (after, size) => {
          let query = supabase.from("bookings").select("id", { count: "exact" }).eq("hotel_id", ctx.hotelId).ilike("reference", pattern).order("id").limit(size);
          if (after) query = query.gt("id", after);
          return query;
        }),
        readAllPages("payment search Paystack references", (after, size) => {
          let query = supabase.from("payments").select("id", { count: "exact" }).eq("hotel_id", ctx.hotelId).ilike("paystack_reference", pattern).order("id").limit(size);
          if (after) query = query.gt("id", after);
          return query;
        }),
      ]);
      const guestIds = guests.map((guest) => guest.id);
      const guestBookings: { id: string }[] = [];
      for (let offset = 0; offset < guestIds.length; offset += 500) {
        const chunk = guestIds.slice(offset, offset + 500);
        guestBookings.push(...await readAllPages("payment search guest bookings", (after, size) => {
          let query = supabase.from("bookings").select("id", { count: "exact" }).eq("hotel_id", ctx.hotelId).in("guest_id", chunk).order("id").limit(size);
          if (after) query = query.gt("id", after);
          return query;
        }));
      }
      const matchedBookingIds = [...new Set([...references.map((row) => row.id), ...guestBookings.map((row) => row.id)])];
      const matchedPaymentIds = new Set(paystackReferences.map((row) => row.id));
      for (let offset = 0; offset < matchedBookingIds.length; offset += 500) {
        const chunk = matchedBookingIds.slice(offset, offset + 500);
        const rows = await readAllPages("payment search booking payments", (after, size) => {
          let query = supabase.from("payments").select("id", { count: "exact" }).eq("hotel_id", ctx.hotelId).in("booking_id", chunk).order("id").limit(size);
          if (after) query = query.gt("id", after);
          return query;
        });
        for (const row of rows) matchedPaymentIds.add(row.id);
      }
      paymentIds = [...matchedPaymentIds];
      if (paymentIds.length === 0) {
        return { success: true, data: { rows: [], currency: ctx.hotel.currency, timeZone: hotel.timezone, startDate, endDate, page, pageSize: PAGE_SIZE, totalCount: 0, hasNextPage: false, totals: { successfulAmount: 0, successfulCount: 0, allAmount: 0, allCount: 0, onlineAmount: 0, onlineCount: 0, staffAmount: 0, staffCount: 0 } } };
      }
      bookingIds = null;
    }

    const buildQuery = (withRows: boolean) => {
      let query = supabase
        .from("payments")
        .select(withRows ? "id, amount, currency, method, status, paid_at, paystack_reference, notes, booking_id, recorded_by, bookings(reference, guests(full_name))" : "id, amount, currency, status", { count: "exact" })
        .eq("hotel_id", ctx.hotelId)
        .gte("paid_at", startBounds.startISO)
        .lt("paid_at", endBounds.startISO);
      if (status !== "all") query = query.eq("status", status);
      if (method) query = query.eq("method", method);
      if (bookingIds) query = query.in("booking_id", bookingIds);
      if (paymentIds) query = query.in("id", paymentIds);
      if (withRows) query = query.order("paid_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      return query;
    };

    const { data: rowsRaw, error: rowsError, count } = await buildQuery(true);
    if (rowsError || count == null) throw new Error("Payment activity could not be loaded. Try again.");

    const rawRows = (rowsRaw ?? []) as unknown as PaymentJoinRow[];
    const staffIds = [...new Set(rawRows.map((row) => row.recorded_by).filter((id): id is string => Boolean(id)))];
    const staffNames = new Map<string, string>();
    if (staffIds.length) {
      const { data: staff, error: staffError } = await supabase.from("staff_profiles").select("id, full_name").in("id", staffIds);
      if (staffError) throw new Error("Payment activity could not load staff attribution. Try again.");
      for (const member of staff ?? []) if (member.full_name) staffNames.set(member.id, member.full_name);
    }

    const rows = rawRows.map((row) => normalizeRow(row, ctx.hotel.currency, staffNames));
    const allRows = await readAllPages("payment totals", (after, size) => {
      let query = supabase
        .from("payments")
        .select("id, amount, currency, status, method", { count: "exact" })
        .eq("hotel_id", ctx.hotelId)
        .gte("paid_at", startBounds.startISO)
        .lt("paid_at", endBounds.startISO)
        .order("id", { ascending: true })
        .limit(size);
      if (status !== "all") query = query.eq("status", status);
       if (method) query = query.eq("method", method);
       if (bookingIds) query = query.in("booking_id", bookingIds);
       if (paymentIds) query = query.in("id", paymentIds);
      if (after) query = query.gt("id", after);
      return query;
    });
    const successfulMinor: number[] = [];
    const allMinor: number[] = [];
    const onlineMinor: number[] = [];
    const staffMinor: number[] = [];
    let successfulCount = 0;
    let onlineCount = 0;
    let staffCount = 0;
    for (const row of allRows) {
      const rowCurrency = assertCurrency(row.currency ?? ctx.hotel.currency, ctx.hotel.currency);
      const minor = moneyMinor(row.amount, rowCurrency);
      allMinor.push(minor);
      if (row.status === "success") {
        successfulMinor.push(minor);
        successfulCount += 1;
        if (row.method === "paystack_link") {
          onlineMinor.push(minor);
          onlineCount += 1;
        } else {
          staffMinor.push(minor);
          staffCount += 1;
        }
      }
    }

    return {
      success: true,
      data: {
        rows,
        currency: ctx.hotel.currency,
        timeZone: hotel.timezone,
        startDate,
        endDate,
        page,
        pageSize: PAGE_SIZE,
        totalCount: count,
        hasNextPage: page * PAGE_SIZE < count,
        totals: {
          successfulAmount: fromMinor(sumMinor(successfulMinor), ctx.hotel.currency),
          successfulCount,
          allAmount: fromMinor(sumMinor(allMinor), ctx.hotel.currency),
          allCount: allRows.length,
          onlineAmount: fromMinor(sumMinor(onlineMinor), ctx.hotel.currency),
          onlineCount,
          staffAmount: fromMinor(sumMinor(staffMinor), ctx.hotel.currency),
          staffCount,
        },
      },
    };
  } catch (error) {
    return await toActionError(error, { action: "payments.getPaymentActivity" });
  }
}
