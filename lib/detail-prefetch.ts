"use client";

/**
 * Client-side "preload on intent" cache for detail-sheet server actions.
 *
 * Detail drawers open from client state, not routing, so Next's <Link>
 * prefetch does not apply. Instead we warm the server action on row
 * hover/focus and let the drawer consume the in-flight promise on open —
 * hiding the click→data round-trip.
 *
 * Guards:
 * - intent delay: a hover must settle for INTENT_MS before it fetches, and
 *   only the most-recently hovered id stays armed, so sweeping a cursor down
 *   a table fires one server action (the row you land on), not one per row.
 * - dedupe: `prefetch` no-ops while a result is still fresh.
 * - one-shot `take`: consumes a warmed promise once (so a refetch after a
 *   mutation always hits the server) and treats anything older than TTL_MS
 *   as a miss.
 * - failures are never cached, and an un-consumed warm that rejects is
 *   swallowed here, so prefetch stays fire-and-forget with no unhandled
 *   rejection. `take` hands back the same promise, so a consumed rejection
 *   still reaches the awaiting caller.
 * - the store is size-capped (oldest evicted) so a long session hovering many
 *   rows it never opens cannot grow without bound.
 */

import { getFullBookingDetail } from "@/app/actions/bookings-detail";
import { getGuestBookings } from "@/app/actions/customers";

// Warmed data older than this is considered stale and refetched.
const TTL_MS = 15_000;
// A hover must settle this long before it triggers a fetch.
const INTENT_MS = 100;
// Upper bound on retained warmed entries; oldest is evicted past this.
const MAX_ENTRIES = 50;

interface Entry<T> {
  at: number;
  promise: Promise<T>;
}

function makeCache<T>(fetcher: (id: string) => Promise<T>) {
  const store = new Map<string, Entry<T>>();
  let pendingId: string | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;

  const isFresh = (id: string) => {
    const hit = store.get(id);
    return !!hit && Date.now() - hit.at < TTL_MS;
  };

  const warm = (id: string) => {
    if (isFresh(id)) return;
    const promise = fetcher(id);
    // Never cache a failure, and never leak an unhandled rejection when the
    // warm is never consumed.
    promise.catch(() => {
      // Identity-guard: a late reject of an already-taken promise must not
      // evict a newer warm that re-took this id in the interim.
      if (store.get(id)?.promise === promise) store.delete(id);
    });
    if (store.size >= MAX_ENTRIES) {
      let oldestId: string | null = null;
      let oldestAt = Infinity;
      for (const [k, v] of store) {
        if (v.at < oldestAt) {
          oldestAt = v.at;
          oldestId = k;
        }
      }
      if (oldestId) store.delete(oldestId);
    }
    store.set(id, { at: Date.now(), promise });
  };

  return {
    // Arm a fetch on intent; only the last-hovered id survives the delay, so a
    // cursor sweep collapses to a single fetch. No-op while a fresh one exists.
    prefetch(id: string) {
      if (!id || isFresh(id)) return;
      pendingId = id;
      if (pendingTimer) clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => {
        const armed = pendingId;
        pendingTimer = null;
        pendingId = null;
        if (armed) warm(armed);
      }, INTENT_MS);
    },
    // Consume a warmed promise once; miss (or stale) → undefined, caller fetches.
    take(id: string): Promise<T> | undefined {
      // Cancel a still-pending intent for this id so opening it does not leave
      // a redundant warm to fire after the caller has already fetched.
      if (pendingId === id) {
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingTimer = null;
        pendingId = null;
      }
      const hit = store.get(id);
      if (!hit) return undefined;
      store.delete(id);
      return Date.now() - hit.at < TTL_MS ? hit.promise : undefined;
    },
  };
}

const bookingCache = makeCache(getFullBookingDetail);
const guestCache = makeCache(getGuestBookings);

export const prefetchBookingDetail = (id: string) => bookingCache.prefetch(id);
export const takeBookingDetail = (id: string) => bookingCache.take(id);
export const prefetchGuestBookings = (id: string) => guestCache.prefetch(id);
export const takeGuestBookings = (id: string) => guestCache.take(id);
