import { differenceInCalendarDays, parseISO } from "date-fns";
import type { CalendarAvailabilityBlock, CalendarBooking, CalendarRoom } from "../actions";

/**
 * Optimistic overlay for the room rack.
 *
 * Edits are kept as pending entries next to the server data and applied at
 * render time, instead of being written into the query cache. A refetch that
 * lands mid-request (realtime, another tab, a view switch) replaces the cache
 * but not the overlay, so a moved bar never jumps back while it is saving.
 *
 * Lifecycle of an entry:
 *   1. Created with `settledAt: null` when the edit starts (applied).
 *   2. On success, `settledAt` is stamped and the calendar is refetched. The
 *      entry stays applied until the query holds data fetched after that
 *      moment (`dataUpdatedAt >= settledAt`), then the server copy takes over.
 *   3. On failure the entry is removed at once, which is the rollback.
 */
export interface PendingEntry<T> {
  value: T;
  /** Date.now() when the server confirmed the edit; null while in flight. */
  settledAt: number | null;
  /** Identifies one edit, so a late response never clears a newer edit. */
  token: number;
}

export type BookingPatch = Pick<
  CalendarBooking,
  "roomId" | "roomNumber" | "checkIn" | "checkOut" | "nights" | "roomTypeId" | "roomTypeName"
>;

export function isEntryActive(entry: PendingEntry<unknown>, dataUpdatedAt: number): boolean {
  return entry.settledAt === null || dataUpdatedAt < entry.settledAt;
}

/** Drops entries the server data has caught up with. Returns the same map when nothing changed. */
export function pruneSettled<T>(
  entries: ReadonlyMap<string, PendingEntry<T>>,
  dataUpdatedAt: number
): Map<string, PendingEntry<T>> {
  let changed = false;
  const next = new Map<string, PendingEntry<T>>();
  for (const [key, entry] of entries) {
    if (isEntryActive(entry, dataUpdatedAt)) next.set(key, entry);
    else changed = true;
  }
  return changed ? next : (entries as Map<string, PendingEntry<T>>);
}

export function buildBookingPatch(
  booking: CalendarBooking,
  room: CalendarRoom | null,
  checkIn: string,
  checkOut: string,
  roomTypeIdOverride?: string
): BookingPatch {
  return {
    roomId: room?.id ?? null,
    roomNumber: room?.roomNumber ?? null,
    checkIn,
    checkOut,
    nights: Math.max(1, differenceInCalendarDays(parseISO(checkOut), parseISO(checkIn))),
    roomTypeId: roomTypeIdOverride ?? booking.roomTypeId,
    roomTypeName: roomTypeIdOverride
      ? room?.roomTypeName ?? booking.roomTypeName
      : booking.roomTypeName,
  };
}

export function applyBookingPatches(
  bookings: CalendarBooking[],
  patches: ReadonlyMap<string, PendingEntry<BookingPatch>>,
  dataUpdatedAt: number
): CalendarBooking[] {
  if (patches.size === 0) return bookings;
  let changed = false;
  const next = bookings.map((booking) => {
    const entry = patches.get(booking.id);
    if (!entry || !isEntryActive(entry, dataUpdatedAt)) return booking;
    changed = true;
    return { ...booking, ...entry.value };
  });
  return changed ? next : bookings;
}

/**
 * Blocks: `hidden` holds deletions; `upserts` holds blocks saved on the server
 * but not yet refetched (an edit replaces the block with the same id, a new
 * block has a `pending:` id and is appended).
 */
export function applyBlockOverlay(
  blocks: CalendarAvailabilityBlock[],
  hidden: ReadonlyMap<string, PendingEntry<null>>,
  upserts: ReadonlyMap<string, PendingEntry<CalendarAvailabilityBlock>>,
  dataUpdatedAt: number
): CalendarAvailabilityBlock[] {
  if (hidden.size === 0 && upserts.size === 0) return blocks;
  const isHidden = (id: string) => {
    const entry = hidden.get(id);
    return entry !== undefined && isEntryActive(entry, dataUpdatedAt);
  };
  const activeUpserts = new Map<string, CalendarAvailabilityBlock>();
  for (const [id, entry] of upserts) {
    if (isEntryActive(entry, dataUpdatedAt)) activeUpserts.set(id, entry.value);
  }
  const result: CalendarAvailabilityBlock[] = [];
  for (const block of blocks) {
    if (isHidden(block.id)) continue;
    const replacement = activeUpserts.get(block.id);
    if (replacement) {
      activeUpserts.delete(block.id);
      result.push(replacement);
    } else {
      result.push(block);
    }
  }
  for (const [id, block] of activeUpserts) {
    if (!isHidden(id)) result.push(block);
  }
  return result;
}
