/**
 * Pure night-audit math. No DB, no "use server" — the seam that reports and
 * tests exercise. app/dashboard/night-audit/actions.ts fetches rows and calls
 * computeNightAuditSummary().
 *
 * Every money figure is accumulated in the hotel's minor units and converted
 * back once, at the end. A night audit is the report a hotel reconciles its cash
 * drawer against, so a totalPaymentsToday that is a pesewa off the sum of the
 * payment rows is a figure someone has to chase.
 */

import { fromMinor, sumMinor, toMinor } from "@/lib/money";

export interface NightAuditSummary {
  auditDate: string;
  currency: string;
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
  outOfService: number;
  occupancyRate: number;
  pendingArrivals: number;
  pendingDepartures: number;
  inHouseCount: number;
  totalPaymentsToday: number;
  paymentsByMethod: { method: string; count: number; amount: number }[];
  estimatedRoomRevenue: number;
  adrToday: number;
  revparToday: number;
  isClosed: boolean;
  lastAudit: { staffName: string | null; notes: string | null; at: string } | null;
  unresolvedBookings: {
    id: string;
    reference: string;
    guestName: string;
    type: "pending_arrival" | "pending_departure";
    roomNumber: string | null;
  }[];
}

export interface NightAuditInputs {
  auditDate: string;
  currency: string;
  rooms: { id: string; status: string | null }[];
  pendingArrivals: { id: string; reference: string; guests: unknown; rooms: unknown }[];
  pendingDepartures: { id: string; reference: string; guests: unknown; rooms: unknown }[];
  inHouseCount: number;
  payments: { amount: unknown; method: string | null }[];
  /** Active bookings spanning the night — confirmed + checked_in. */
  occupiedBookings: { total_amount: unknown; nights: unknown }[];
  lastAuditLog: {
    staff_name: unknown;
    after_state: unknown;
    created_at: string | null;
  } | null;
}

const UNSALEABLE = new Set(["maintenance", "out_of_service"]);

/**
 * Row money as minor units. Amounts arrive typed `unknown` because PostgREST can
 * hand a numeric back as a string; anything that is not a finite number counts
 * as zero rather than turning the whole total into NaN.
 */
function minorOf(value: unknown, currency: string): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? toMinor(n, currency) : 0;
}

/** Embedded joins may arrive as an object or a single-element array */
function joinField<T extends string>(value: unknown, field: T): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (row && typeof row === "object" && field in row) {
    const v = (row as Record<string, unknown>)[field];
    if (typeof v === "string" && v) return v;
    return null;
  }
  return null;
}

export function computeNightAuditSummary(input: NightAuditInputs): NightAuditSummary {
  const currency = input.currency || "GHS";
  const rooms = input.rooms ?? [];
  const totalRooms = rooms.length;
  const occupiedRooms = rooms.filter((r) => r.status === "occupied").length;
  const outOfService = rooms.filter((r) => UNSALEABLE.has(r.status ?? "")).length;
  const vacantRooms = Math.max(0, totalRooms - occupiedRooms - outOfService);
  const occupancyRate =
    totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

  const unresolvedBookings = [
    ...input.pendingArrivals.map((b) => ({
      id: b.id,
      reference: b.reference,
      guestName: joinField(b.guests, "full_name") ?? "Unknown Guest",
      type: "pending_arrival" as const,
      roomNumber: joinField(b.rooms, "room_number"),
    })),
    ...input.pendingDepartures.map((b) => ({
      id: b.id,
      reference: b.reference,
      guestName: joinField(b.guests, "full_name") ?? "Unknown Guest",
      type: "pending_departure" as const,
      roomNumber: joinField(b.rooms, "room_number"),
    })),
  ];

  const methodMap = new Map<string, { count: number; amountMinor: number }>();
  const paymentMinors: number[] = [];
  for (const p of input.payments ?? []) {
    const key = p.method || "other";
    const minor = minorOf(p.amount, currency);
    const cur = methodMap.get(key) ?? { count: 0, amountMinor: 0 };
    methodMap.set(key, { count: cur.count + 1, amountMinor: cur.amountMinor + minor });
    paymentMinors.push(minor);
  }
  const totalPaymentsMinor = sumMinor(paymentMinors);
  const paymentsByMethod = Array.from(methodMap.entries())
    .map(([method, v]) => ({ method, count: v.count, amountMinor: v.amountMinor }))
    .sort((a, b) => b.amountMinor - a.amountMinor)
    .map(({ method, count, amountMinor }) => ({
      method,
      count,
      amount: fromMinor(amountMinor, currency),
    }));

  // Each stay contributes one night's share of its own total. Rounding that
  // share to the minor unit before summing differs from summing exact fractions
  // by under a minor unit per stay, and the three figures derived from it are
  // reported in whole currency units anyway.
  const estimatedRoomRevenueMinor = sumMinor(
    (input.occupiedBookings ?? []).map((b) => {
      const raw = Number(b.nights ?? 1);
      const nights = Number.isFinite(raw) && raw >= 1 ? raw : 1;
      return Math.round(minorOf(b.total_amount, currency) / nights);
    })
  );
  const estimatedRoomRevenue = fromMinor(estimatedRoomRevenueMinor, currency);

  const adrToday =
    occupiedRooms > 0 ? Math.round(estimatedRoomRevenue / occupiedRooms) : 0;
  const revparToday =
    totalRooms > 0 ? Math.round(estimatedRoomRevenue / totalRooms) : 0;

  const logRow = input.lastAuditLog;
  const lastAudit = logRow
    ? {
        staffName:
          typeof logRow.staff_name === "string" ? (logRow.staff_name as string) : null,
        notes:
          typeof logRow.after_state === "object" && logRow.after_state !== null
            ? ((logRow.after_state as Record<string, unknown>).notes as string | null) ?? null
            : null,
        at: logRow.created_at ?? "",
      }
    : null;

  return {
    auditDate: input.auditDate,
    currency,
    totalRooms,
    occupiedRooms,
    vacantRooms,
    outOfService,
    occupancyRate,
    pendingArrivals: input.pendingArrivals.length,
    pendingDepartures: input.pendingDepartures.length,
    inHouseCount: input.inHouseCount,
    totalPaymentsToday: fromMinor(totalPaymentsMinor, currency),
    paymentsByMethod,
    estimatedRoomRevenue: Math.round(estimatedRoomRevenue),
    adrToday,
    revparToday,
    isClosed: Boolean(lastAudit),
    lastAudit,
    unresolvedBookings,
  };
}
