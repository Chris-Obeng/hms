export interface GuestStay { id: string; guest_id: string | null; check_in: string; check_out: string }

/** Classify once at the first arrival in the selected window, never by lifetime totals. */
export function classifyArrivingGuests(arrivals: GuestStay[], history: GuestStay[]): { newGuests: number; repeatGuests: number } {
  const first = new Map<string, string>();
  for (const stay of arrivals) {
    if (stay.guest_id && (!first.has(stay.guest_id) || stay.check_in < first.get(stay.guest_id)!)) first.set(stay.guest_id, stay.check_in);
  }
  const repeats = new Set<string>();
  for (const stay of history) {
    if (!stay.guest_id) continue;
    const arrival = first.get(stay.guest_id);
    if (arrival && stay.check_in < arrival && stay.check_out <= arrival) repeats.add(stay.guest_id);
  }
  return { newGuests: first.size - repeats.size, repeatGuests: repeats.size };
}
