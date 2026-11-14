/**
 * A room-night sales snapshot, not a measure of guests physically in house.
 *
 * Today and later nights come from live inventory (buildRoomsSoldMetric).
 * Past nights come from recorded history (buildHistoricalRoomsSold): the
 * physical rooms on record for that date, the rooms out of service or
 * blocked at the end of that business day, and the stays in house that
 * night. Live room status is never used for a past night.
 *
 * When valid: total = outOfService + blocked + sold + held + available.
 * Out-of-service takes precedence over a dated block. The donut's denominator
 * is sellable = total - outOfService - blocked = sold + held + available.
 *
 * Live inventory semantics mirror 20260830170000's availability primitive;
 * its public batch RPC verifies availability, but cannot establish past truth.
 */
import { businessDate } from "@/lib/business-date";

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
  basis: "live" | "projection" | "historical" | "historical-unavailable";
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

export function unavailableRoomsSold(
  context: OccupancyContext,
  issue = "No room inventory is recorded for this night.",
): RoomsSoldMetric {
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
    issues: [issue],
  };
}

/** Validates counts before producing a chartable partition. Never repairs data. */
export function calculateRoomsSold(
  context: OccupancyContext,
  counts: OccupancyCounts,
  issues: string[] = [],
): RoomsSoldMetric {
  const base = {
    ...unavailableRoomsSold(context),
    basis:
      context.date < context.businessToday
        ? ("historical" as const)
        : context.date === context.businessToday
          ? ("live" as const)
          : ("projection" as const),
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
    const rooms = `${-availableRooms} ${availableRooms === -1 ? "room" : "rooms"}`;
    base.issues.push(
      base.basis === "historical"
        ? `Occupied rooms exceed the rooms you could sell by ${rooms}.`
        : `Reservations and holds exceed sellable inventory by ${rooms}.`,
    );
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

export interface InventoryRecord {
  effective_date: string;
  capacity_by_type: unknown;
  time_zone: string;
}

export interface HistoricalStay {
  id: string;
  rooms_count: number;
  room_id?: string | null;
  status?: string | null;
  /** First night of the stay. */
  check_in?: string | null;
  /** When the guest actually checked out; null while still checked in. */
  check_out_at?: string | null;
}

/**
 * Whether a checked-in or checked-out stay booked over `date` was really in
 * house that night. Checking out early now shortens the stay itself
 * (check_out_early), so for those stays this agrees with the booked dates;
 * it guards stays checked out before that change. A guest who leaves early
 * stops counting from the business day they left, so a room resold that day
 * is not counted twice. The first night always counts: a guest who leaves on
 * their arrival day used it (as the stay keeps that night when shortened).
 * Stays with no recorded check-out time keep their booked dates.
 */
export function wasInHouseOnNight(stay: HistoricalStay, date: string, timeZone: string): boolean {
  if (stay.status !== "checked_out" || !stay.check_out_at) return true;
  if (stay.check_in && date <= stay.check_in) return true;
  const left = new Date(stay.check_out_at);
  if (!Number.isFinite(left.getTime())) return true;
  return businessDate(timeZone, left) > date;
}

/**
 * A past night from recorded history. Inputs are already scoped to the night:
 * `inventory` is the latest physical-capacity record on or before it, the room
 * ids are those out of service / blocked at the end of that business day, and
 * `stays` are checked-in or checked-out bookings booked over it. A stay that
 * checked out before the night is dropped (see wasInHouseOnNight). Holds have
 * resolved by then, so none.
 *
 * Night Audit counts booked dates; with early check-outs shortening the stay,
 * the two agree.
 */
export function buildHistoricalRoomsSold({
  context, timeZone, inventory, outOfServiceRoomIds, blockedRoomIds, stays,
}: {
  context: OccupancyContext;
  timeZone: string;
  inventory: InventoryRecord | null;
  outOfServiceRoomIds: readonly string[];
  blockedRoomIds: readonly string[];
  stays: readonly HistoricalStay[];
}): RoomsSoldMetric {
  if (!inventory) return unavailableRoomsSold(context);
  // Same rule as Reports: a timezone change starts a new baseline, so a record
  // taken under another zone does not describe this property-local night.
  if (inventory.time_zone !== timeZone) {
    return unavailableRoomsSold(context, "Room inventory for this night was recorded under a different time zone.");
  }
  const capacity = inventory.capacity_by_type;
  if (!capacity || typeof capacity !== "object" || Array.isArray(capacity)) {
    return calculateRoomsSold(context, { totalRooms: NaN, outOfService: 0, blocked: 0, soldRooms: 0, heldRooms: 0 });
  }
  let totalRooms = 0;
  for (const count of Object.values(capacity as Record<string, unknown>)) {
    totalRooms += typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? count : NaN;
  }
  // Out of service takes precedence over a block, as it does live.
  const outOfService = new Set(outOfServiceRoomIds);
  const blocked = new Set(blockedRoomIds.filter((id) => !outOfService.has(id)));
  const issues: string[] = [];
  const seen = new Set<string>();
  const roomsInUse = new Set<string>();
  let soldRooms = 0;
  for (const stay of stays) {
    if (!wasInHouseOnNight(stay, context.date, timeZone)) continue;
    if (seen.has(stay.id)) issues.push("Duplicate stays prevent a reliable occupied-rooms total.");
    seen.add(stay.id);
    soldRooms += Number.isSafeInteger(stay.rooms_count) && stay.rooms_count >= 1 ? stay.rooms_count : NaN;
    // The same checks as live: a stay in a room that was out of service or
    // blocked would otherwise be subtracted twice without any warning.
    if (stay.room_id) {
      if (outOfService.has(stay.room_id) || blocked.has(stay.room_id)) {
        issues.push("A stay was in a room recorded as out of service or blocked that night.");
      }
      if (roomsInUse.has(stay.room_id)) issues.push("Two stays were in the same room that night.");
      roomsInUse.add(stay.room_id);
    }
  }
  return calculateRoomsSold(
    context,
    { totalRooms, outOfService: outOfService.size, blocked: blocked.size, soldRooms, heldRooms: 0 },
    [...new Set(issues)],
  );
}

export function formatSoldPercent(percent: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(percent);
}
