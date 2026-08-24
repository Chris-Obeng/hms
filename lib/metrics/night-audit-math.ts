/**
 * Pure night-audit math. No DB, no "use server" — the seam that reports and
 * tests exercise. app/dashboard/night-audit/actions.ts fetches rows and calls
 * computeNightAuditSummary().
 */

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

  const methodMap = new Map<string, { count: number; amount: number }>();
  let totalPaymentsToday = 0;
  for (const p of input.payments ?? []) {
    const key = p.method || "other";
    const cur = methodMap.get(key) ?? { count: 0, amount: 0 };
    methodMap.set(key, { count: cur.count + 1, amount: cur.amount + Number(p.amount || 0) });
    totalPaymentsToday += Number(p.amount || 0);
  }
  const paymentsByMethod = Array.from(methodMap.entries())
    .map(([method, v]) => ({ method, count: v.count, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount);

  const estimatedRoomRevenue = (input.occupiedBookings ?? []).reduce((sum, b) => {
    const nightly = Number(b.total_amount || 0) / Math.max(1, Number(b.nights || 1));
    return sum + nightly;
  }, 0);

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
    currency: input.currency || "GHS",
    totalRooms,
    occupiedRooms,
    vacantRooms,
    outOfService,
    occupancyRate,
    pendingArrivals: input.pendingArrivals.length,
    pendingDepartures: input.pendingDepartures.length,
    inHouseCount: input.inHouseCount,
    totalPaymentsToday: Math.round(totalPaymentsToday * 100) / 100,
    paymentsByMethod,
    estimatedRoomRevenue: Math.round(estimatedRoomRevenue),
    adrToday,
    revparToday,
    isClosed: Boolean(lastAudit),
    lastAudit,
    unresolvedBookings,
  };
}
