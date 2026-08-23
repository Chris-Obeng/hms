// Operational ordering for reservation lists, following the convention used
// by established PMS platforms (Opera, Mews, Cloudbeds): the front desk works
// forward from the property's business date.
//
//   1. Current & upcoming stays — earliest arrival first. Today's arrivals and
//      in-house guests sit at the top where operational attention is highest.
//   2. Past stays — most recent first, so history remains reachable without
//      losing its recency context.

export type ReservationLike = { checkIn: string };

/**
 * Sorts reservations into front-desk working order for the given business date
 * ("YYYY-MM-DD", property timezone). Returns a new array; input is untouched.
 */
export function sortByOperationalRelevance<T extends ReservationLike>(
  rows: T[],
  businessDate: string,
): T[] {
  return [...rows].sort((a, b) => {
    const aUpcoming = a.checkIn >= businessDate;
    const bUpcoming = b.checkIn >= businessDate;
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    return aUpcoming
      ? a.checkIn.localeCompare(b.checkIn)
      : b.checkIn.localeCompare(a.checkIn);
  });
}
