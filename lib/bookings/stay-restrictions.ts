/**
 * lib/bookings/stay-restrictions.ts
 *
 * The one place that reads a rate plan's length-of-stay and open/closed controls
 * on the way in, and the one place that turns a refusal into a sentence.
 *
 * Two callers ask the same question at different moments. The booking widget
 * asks it about every room type before the guest has picked one, so it gets
 * `fetchStayRestrictions` — a single round trip over the whole room list, for the
 * same reason `room_type_available_counts` exists: a hotel with forty room types
 * must not cost forty pooled connections. The insert path asks it after the fact,
 * because `bookings_restrictions_guard` is what actually holds the line, and its
 * rejection arrives as SQLSTATE 23514 with the violation list in HINT.
 *
 * `parseStayRestrictions` reads that HINT. The wire format is the SQL's, not
 * ours: a comma-joined list of `code:detail` elements, already ordered by
 * severity by `stay_restriction_violations`, where detail is a night count for
 * the four length-of-stay codes and an ISO date for the three closed ones.
 * Element order is why the guest copy can take the first element and stop.
 *
 * Copy is split by audience on purpose. A guest is told what would let the stay
 * through ("these dates need a minimum of 3 nights"); staff are told every
 * reason at once, because they are the ones who will change a restriction or
 * override it.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";

/**
 * Every code `stay_restriction_violations` can emit, in the severity order it
 * emits them. Kept in one place so a caller cannot switch on a code the SQL
 * never produces — the mirror of REJECTION_CODES in create-booking-atomic.ts.
 */
export const STAY_RESTRICTION_CODES = [
  "stop_sell",
  "closed_to_arrival",
  "closed_to_departure",
  "min_stay",
  "min_stay_arrival",
  "min_stay_through",
  "max_stay",
] as const;

export type StayRestrictionCode = (typeof STAY_RESTRICTION_CODES)[number];

export type StayRestriction = {
  /** `"unknown"` when a newer migration emits a code this build has not learned. */
  code: StayRestrictionCode | "unknown";
  /** The element verbatim, so an unknown code is still reportable. */
  raw: string;
  /** Night count for the length-of-stay codes, else null. */
  nights: number | null;
  /** ISO date for the three closed codes, else null. */
  date: string | null;
};

const NIGHT_CODES = new Set<StayRestrictionCode>([
  "min_stay",
  "min_stay_arrival",
  "min_stay_through",
  "max_stay",
]);

function isKnown(value: string): value is StayRestrictionCode {
  return (STAY_RESTRICTION_CODES as readonly string[]).includes(value);
}

/**
 * Splits the guard's HINT into its elements. Tolerant by design: an empty or
 * absent hint yields an empty array, and an element whose detail is missing or
 * unreadable still comes back with its code so the caller can name a reason
 * rather than fall through to "something went wrong".
 */
export function parseStayRestrictions(hint: string | null | undefined): StayRestriction[] {
  if (!hint) return [];

  return hint
    .split(",")
    .map((element) => element.trim())
    .filter((element) => element.length > 0)
    .map((element) => {
      const separator = element.indexOf(":");
      const name = separator === -1 ? element : element.slice(0, separator);
      const detail = separator === -1 ? "" : element.slice(separator + 1);
      const code: StayRestriction["code"] = isKnown(name) ? name : "unknown";

      const nights =
        code !== "unknown" && NIGHT_CODES.has(code) && /^\d+$/.test(detail)
          ? Number(detail)
          : null;

      return {
        code,
        raw: element,
        nights,
        date: /^\d{4}-\d{2}-\d{2}$/.test(detail) ? detail : null,
      };
    });
}

/** Plural without a library: these are all small integers of nights. */
function nights(count: number): string {
  return count === 1 ? "1 night" : `${count} nights`;
}

/**
 * A sentence a guest can act on. Never names the rate plan or the machine code —
 * a public visitor learns only what the calendar would already have told them.
 */
export function guestRestrictionSentence(restriction: StayRestriction): string {
  const on = restriction.date ? formatDate(restriction.date) : null;

  switch (restriction.code) {
    case "stop_sell":
      return "These dates are not available for booking.";
    case "closed_to_arrival":
      return on
        ? `Check-in is not available on ${on} for these dates.`
        : "Check-in is not available on your arrival date.";
    case "closed_to_departure":
      return on
        ? `Check-out is not available on ${on}. Try a different departure date.`
        : "Check-out is not available on your departure date.";
    case "min_stay":
    case "min_stay_arrival":
      return restriction.nights
        ? `These dates need a minimum stay of ${nights(restriction.nights)}.`
        : "These dates need a longer stay.";
    case "min_stay_through":
      return restriction.nights
        ? `One of these nights needs a minimum stay of ${nights(restriction.nights)}.`
        : "One of these nights needs a longer stay.";
    case "max_stay":
      return restriction.nights
        ? `These dates allow a maximum stay of ${nights(restriction.nights)}.`
        : "These dates allow a shorter stay.";
    default:
      return "These dates are not available for booking.";
  }
}

/**
 * The guest headline: the first element, which the SQL has already ordered from
 * hardest to softest, so a stay that is both stopped and too short is reported as
 * stopped. Falls back to the plain unavailable sentence for an empty list, which
 * only happens if a caller asks before checking `length`.
 */
export function guestStayRestrictionMessage(restrictions: StayRestriction[]): string {
  const first = restrictions[0];
  return first ? guestRestrictionSentence(first) : "These dates are not available for booking.";
}

/**
 * Every reason at once, for someone who can act on it. Staff see the codes
 * because the codes are what the availability grid and the rate plan editor are
 * labelled with, and a manager fixing a restriction needs to know which field.
 */
export function staffStayRestrictionMessage(restrictions: StayRestriction[]): string {
  if (restrictions.length === 0) return "This stay breaks the rate plan's restrictions.";

  return restrictions
    .map((restriction) => {
      switch (restriction.code) {
        case "stop_sell":
          return restriction.date
            ? `stop sell on ${formatDate(restriction.date)}`
            : "stop sell";
        case "closed_to_arrival":
          return restriction.date
            ? `closed to arrival on ${formatDate(restriction.date)}`
            : "closed to arrival";
        case "closed_to_departure":
          return restriction.date
            ? `closed to departure on ${formatDate(restriction.date)}`
            : "closed to departure";
        case "min_stay":
          return `minimum stay ${restriction.nights ?? "?"} nights`;
        case "min_stay_arrival":
          return `minimum stay on arrival ${restriction.nights ?? "?"} nights`;
        case "min_stay_through":
          return `minimum stay through ${restriction.nights ?? "?"} nights`;
        case "max_stay":
          return `maximum stay ${restriction.nights ?? "?"} nights`;
        default:
          return restriction.raw;
      }
    })
    .join("; ");
}

/** One row of `room_type_stay_restrictions`, as the function returns it. */
type StayRestrictionRow = {
  room_type_id: string;
  /** Null when the room type has no rate plan, which means no restrictions. */
  rate_plan_id: string | null;
  violations: string[] | null;
};

export type RoomTypeStayRestrictions = {
  ratePlanId: string | null;
  restrictions: StayRestriction[];
  /** True when the stay is sellable on this room type's plan. */
  sellable: boolean;
  /** Guest headline, or null when sellable. */
  reason: string | null;
};

/**
 * Restrictions for a whole room list over one stay window, in one round trip.
 *
 * Room types of another hotel and ids that do not exist are absent from the
 * result rather than an error, so a tampered query string leaks nothing; a
 * caller reads `.get(id)` and treats a miss as unrestricted, which is what the
 * INSERT guard would also conclude. Errors are thrown rather than swallowed:
 * a caller that wants to keep serving on a failed read has to say so, and the
 * guard is still there behind it.
 *
 * The cast below is the same documented gap as in lib/pricing/nightly-rates.ts.
 * `types/database.types.ts` is generated against the remote project, which has
 * not been migrated yet, so its Functions map does not know this function.
 * Delete the cast once db:types has been regenerated from a project carrying
 * migration 20260902130000.
 */
export async function fetchStayRestrictions(
  hotelId: string,
  roomTypeIds: string[],
  checkIn: string,
  checkOut: string
): Promise<Map<string, RoomTypeStayRestrictions>> {
  const result = new Map<string, RoomTypeStayRestrictions>();
  if (roomTypeIds.length === 0) return result;

  const rpc = supabaseAdmin.rpc as unknown as (
    fn: "room_type_stay_restrictions",
    params: {
      p_hotel_id: string;
      p_room_type_ids: string[];
      p_check_in: string;
      p_check_out: string;
    }
  ) => Promise<{ data: StayRestrictionRow[] | null; error: { message: string } | null }>;

  const { data, error } = await rpc("room_type_stay_restrictions", {
    p_hotel_id: hotelId,
    p_room_type_ids: roomTypeIds,
    p_check_in: checkIn,
    p_check_out: checkOut,
  });

  if (error) {
    throw new Error(`room_type_stay_restrictions failed: ${error.message}`);
  }

  for (const row of data ?? []) {
    const restrictions = (row.violations ?? []).flatMap((element) =>
      parseStayRestrictions(element)
    );
    result.set(row.room_type_id, {
      ratePlanId: row.rate_plan_id,
      restrictions,
      sellable: restrictions.length === 0,
      reason: restrictions.length === 0 ? null : guestStayRestrictionMessage(restrictions),
    });
  }

  return result;
}
