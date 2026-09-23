/**
 * Supabase Realtime subscription health reporting.
 *
 * `channel.subscribe()` takes an optional status callback. Most subscriptions in
 * this app omitted it, and the few that passed one only reconnected locally or
 * flipped a "connecting" badge. Either way the failure was invisible off-screen:
 * on `CHANNEL_ERROR` or `TIMED_OUT` the channel stops delivering
 * `postgres_changes`, the dashboard keeps rendering whatever it last fetched,
 * and staff act on stale occupancy, arrivals and payment state.
 *
 * Pass the callback returned here to `.subscribe()` so that failure becomes an
 * issue instead of a stale screen:
 *
 *   .subscribe(onRealtimeStatus({ label: "dashboard", hotelId, table: "bookings" }))
 */

import { captureIssue, type CaptureMeta } from "./sentry";

/**
 * Stable, low-cardinality name for the subscription. Used for grouping, so it
 * must not contain a hotel id — the channel names do, and fingerprinting on
 * those would create one Sentry issue per tenant.
 */
export type RealtimeLabel =
  | "dashboard"
  | "calendar"
  | "availability"
  | "bookings-list"
  | "rooms-directory"
  | "transactions"
  | "outstanding"
  | "notifications";

/**
 * Statuses supabase-js can report. Typed as a plain string union rather than
 * importing `REALTIME_SUBSCRIBE_STATES` so this module does not depend on the
 * enum's runtime value.
 */
type RealtimeStatus = "SUBSCRIBED" | "CLOSED" | "CHANNEL_ERROR" | "TIMED_OUT";

/** The subset worth reporting: the channel has stopped delivering changes. */
type RealtimeFailure = Extract<RealtimeStatus, "CHANNEL_ERROR" | "TIMED_OUT">;

/**
 * Builds a `.subscribe()` status callback that reports broken subscriptions.
 *
 * `SUBSCRIBED` is the healthy case. `CLOSED` is what a normal unmount produces
 * (every one of these effects calls `removeChannel` in its cleanup), so neither
 * is reported — only the two states that mean "this screen has silently stopped
 * updating".
 */
export function onRealtimeStatus(options: {
  label: RealtimeLabel;
  hotelId?: string | null;
  orgId?: string | null;
  /** Table(s) the channel watches. Context only, for triage. */
  table?: string;
}): (status: string, err?: Error) => void {
  return (status, err) => {
    // Narrowed by assignment rather than by early return: supabase-js types the
    // callback argument as `string`, and excluding literals from `string` does
    // not narrow it, so the tag below would otherwise be untyped.
    const failure: RealtimeFailure | null =
      status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? status : null;
    if (!failure) return;

    const meta: CaptureMeta = {
      scope: "realtime",
      // TIMED_OUT is often a transient network blip that the client retries;
      // CHANNEL_ERROR usually means RLS, a missing publication or a bad filter,
      // and will not recover on its own.
      level: failure === "CHANNEL_ERROR" ? "error" : "warning",
      hotelId: options.hotelId,
      orgId: options.orgId,
      tags: {
        "realtime.channel": options.label,
        "realtime.status": failure,
        ...(options.table ? { "realtime.table": options.table } : {}),
      },
      contexts: {
        realtime: {
          label: options.label,
          status: failure,
          table: options.table ?? null,
          // supabase-js passes an Error here only sometimes; keep the text.
          error: err?.message ?? null,
        },
      },
      fingerprint: ["realtime", options.label, failure],
    };

    captureIssue(`Realtime channel ${failure}: ${options.label}`, meta);
  };
}
