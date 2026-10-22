/**
 * A room-night sales snapshot, not a measure of guests physically in house.
 *
 * When valid: total = outOfService + blocked + sold + held + available.
 * Out-of-service takes precedence over a dated block. The donut's denominator
 * is sellable = total - outOfService - blocked = sold + held + available.
 *
 * Live inventory semantics mirror 20260830170000's availability primitive;
 * its public batch RPC verifies availability, but cannot establish past truth.
 */
export interface OccupancyContext {
  date: string;
  businessToday: string;
  asOf: string;
}

export interface OccupancyCounts {
  totalRooms: number;
  outOfService: number;
  blocked: number;
  soldRooms: number;
  heldRooms: number;
}

export interface RoomsSoldMetric {
  date: string;
  asOf: string;
  basis: "live" | "projection" | "historical-unavailable";
  state: "ready" | "empty" | "unavailable" | "inconsistent";
  totalRooms: number | null;
  outOfService: number | null;
  blocked: number | null;
  soldRooms: number | null;
  heldRooms: number | null;
  sellableRooms: number | null;
  availableRooms: number | null;
  /** Unrounded, and deliberately not capped at 100. */
  soldPercent: number | null;
  issues: string[];
}

export function unavailableRoomsSold(context: OccupancyContext): RoomsSoldMetric {
  return {
    date: context.date,
    asOf: context.asOf,
    basis: "historical-unavailable",
    state: "unavailable",
    totalRooms: null,
    outOfService: null,
    blocked: null,
    soldRooms: null,
    heldRooms: null,
    sellableRooms: null,
    availableRooms: null,
    soldPercent: null,
    issues: ["Historical room inventory is not recorded for this date. Today's room status cannot establish past rooms sold or capacity."],
  };
}

/** Validates counts before producing a chartable partition. Never repairs data. */
export function calculateRoomsSold(
  context: OccupancyContext,
  counts: OccupancyCounts,
  issues: string[] = [],
): RoomsSoldMetric {
  if (context.date < context.businessToday) return unavailableRoomsSold(context);
  const base = {
    ...unavailableRoomsSold(context),
    basis: context.date === context.businessToday ? "live" as const : "projection" as const,
    issues: [...issues],
  };
  if (Object.values(counts).some((count) => !Number.isSafeInteger(count) || count < 0)) {
    return { ...base, state: "inconsistent", issues: [...issues, "Inventory counts must be finite, non-negative whole numbers."] };
  }
  const sellableRooms = counts.totalRooms - counts.outOfService - counts.blocked;
  const availableRooms = sellableRooms - counts.soldRooms - counts.heldRooms;
  if (!Number.isSafeInteger(availableRooms)) {
    return { ...base, state: "inconsistent", issues: [...issues, "Inventory totals exceed the supported numeric range."] };
  }
  if (sellableRooms < 0) base.issues.push("Excluded rooms exceed the total room inventory.");
  if (availableRooms < 0) {
    base.issues.push(`Reservations and holds exceed sellable inventory by ${-availableRooms} ${availableRooms === -1 ? "room" : "rooms"}.`);
  }
  return {
    ...base,
    ...counts,
    sellableRooms,
    availableRooms,
    soldPercent: sellableRooms > 0 ? counts.soldRooms / sellableRooms * 100 : null,
    state: base.issues.length ? "inconsistent" : sellableRooms === 0 ? "empty" : "ready",
  };
}

export interface OccupancyRoom {
  id: string;
  room_type_id: string;
  status: string | null;
}

export interface OccupancyReservation {
  id: string;
  room_id: string | null;
  room_type_id: string | null;
  rooms_count: number;
  status: string | null;
  payment_status: string | null;
  payment_preference: string | null;
  source: string | null;
  created_at: string | null;
}

export interface AvailabilityCount {
  room_type_id: string;
  available: number;
}

/** Inputs are scoped to active rooms and the selected [date, next date) night. */
export function buildRoomsSoldMetric({
  context, rooms, reservations, blockedRoomIds, availability,
}: {
  context: OccupancyContext;
  rooms: readonly OccupancyRoom[];
  reservations: readonly OccupancyReservation[];
  blockedRoomIds: readonly string[];
  availability: readonly AvailabilityCount[];
}): RoomsSoldMetric {
  if (context.date < context.businessToday) return unavailableRoomsSold(context);
  const issues = new Set<string>();
  const counts: OccupancyCounts = { totalRooms: rooms.length, outOfService: 0, blocked: 0, soldRooms: 0, heldRooms: 0 };
  const roomsById = new Map(rooms.map((room) => [room.id, room]));
  const blocked = new Set(blockedRoomIds);
  const assigned = new Set<string>();
  const reservationIds = new Set<string>();
  const byType = new Map<string, { capacity: number; reserved: number }>();
  const typeCounts = (id: string) => {
    let value = byType.get(id);
    if (!value) { value = { capacity: 0, reserved: 0 }; byType.set(id, value); }
    return value;
  };
  const outOfService = (room: OccupancyRoom) => room.status === "maintenance" || room.status === "out_of_service";
  if (roomsById.size !== rooms.length) issues.add("Duplicate room records prevent a reliable inventory total.");
  for (const room of rooms) {
    const type = typeCounts(room.room_type_id);
    if (!["available", "occupied", "maintenance", "out_of_service"].includes(room.status ?? "")) {
      issues.add("A room has an unknown inventory status.");
    }
    if (outOfService(room)) counts.outOfService += 1;
    else if (blocked.has(room.id)) counts.blocked += 1;
    else type.capacity += 1;
  }
  const cutoff = Date.parse(context.asOf) - 30 * 60 * 1000;
  if (!Number.isFinite(cutoff)) issues.add("The inventory snapshot time is invalid.");
  for (const booking of reservations) {
    if (!["pending", "confirmed", "checked_in"].includes(booking.status ?? "")) continue;
    // Retain zero-capacity types even if their only pending hold has expired;
    // the batch RPC also returns those requested types with zero available.
    if (booking.room_type_id !== null) typeCounts(booking.room_type_id);
    // SQL uses a strict < cutoff. Other pending reservations keep holding
    // inventory regardless of age; all pending units are separate from sold.
    if (booking.status === "pending" && booking.payment_status === "unpaid" &&
      booking.payment_preference === "pay_now" && booking.source === "direct") {
      const created = booking.created_at === null ? NaN : Date.parse(booking.created_at);
      if (!Number.isFinite(created)) issues.add("A payment hold has no valid creation time.");
      else if (created < cutoff) continue;
    }
    if (reservationIds.has(booking.id)) issues.add("Duplicate reservations prevent a reliable rooms-sold total.");
    reservationIds.add(booking.id);
    if (!Number.isSafeInteger(booking.rooms_count) || booking.rooms_count < 1) {
      return calculateRoomsSold(context, { ...counts, soldRooms: NaN }, [...issues]);
    }
    if (booking.status === "pending") counts.heldRooms += booking.rooms_count;
    else counts.soldRooms += booking.rooms_count;
    if (booking.room_type_id === null) issues.add("A reservation has no room type and cannot be reconciled with inventory.");
    else typeCounts(booking.room_type_id).reserved += booking.rooms_count;
    if (booking.room_id) {
      const room = roomsById.get(booking.room_id);
      if (!room || outOfService(room) || blocked.has(room.id)) issues.add("A reservation is assigned to an inactive, out-of-service or blocked room.");
      if (room && room.room_type_id !== booking.room_type_id) issues.add("An assigned room does not match its reservation's room type.");
      if (assigned.has(booking.room_id)) issues.add("Multiple reservations or holds are assigned to the same room.");
      assigned.add(booking.room_id);
    }
  }
  const availableByType = new Map(availability.map((row) => [row.room_type_id, row.available]));
  if (availableByType.size !== availability.length || availableByType.size !== byType.size) {
    issues.add("Availability returned an incomplete or inconsistent set of room types. Refresh to reconcile.");
  }
  for (const [id, type] of byType) {
    const expected = type.capacity - type.reserved;
    if (expected < 0) issues.add(`A room type is oversold or over-held by ${-expected} ${expected === -1 ? "room" : "rooms"}.`);
    const reported = availableByType.get(id);
    // The RPC intentionally floors available at zero. Check this at the source
    // boundary only; preserve the negative balance and warning in our model.
    if (reported === undefined || !Number.isSafeInteger(reported) || reported < 0 || reported !== (expected < 0 ? 0 : expected)) {
      issues.add("Availability and the room breakdown disagree. Refresh to reconcile before using these counts.");
    }
  }
  return calculateRoomsSold(context, counts, [...issues]);
}

export function formatSoldPercent(percent: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(percent);
}
