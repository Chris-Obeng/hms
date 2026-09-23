/**
 * Trailing-edge coalescing for Supabase Realtime refresh handlers.
 *
 * A `postgres_changes` subscription delivers one message per changed row, and
 * bursts are the normal case here, not the exception: a night audit rewrites
 * every in-house booking, a rate change writes one `daily_rate_overrides` row
 * per date, a group check-in touches a dozen bookings. Calling `router.refresh()`
 * or `invalidateQueries()` per message turns one operation into a storm of full
 * server renders on every dashboard that happens to be open.
 *
 * Coalescing is safe because these handlers do not consume the payload — they
 * refetch. The fetch triggered by the last event of a burst already includes
 * every earlier change, so the earlier fetches were pure waste.
 *
 *   const refresh = createCoalescer();
 *   const channel = supabase.channel(...).on("postgres_changes", ..., () => refresh.schedule(() => router.refresh()));
 *   return () => { refresh.cancel(); supabase.removeChannel(channel); };
 *
 * Always `cancel()` in the effect cleanup, so a pending timer cannot fire a
 * refresh after the component has unmounted.
 */

/** Same window as the calendar's original inline `batchRefresh`. */
const DEFAULT_WINDOW_MS = 75;

export type Coalescer = {
  /**
   * Runs `run` once the burst goes quiet for the configured window. Each call
   * restarts the timer and replaces the pending callback, so the most recent
   * closure wins — which is what callers want when a query key changes
   * mid-burst.
   */
  schedule: (run: () => void) => void;
  /** Drops any pending callback. Safe to call more than once. */
  cancel: () => void;
};

export function createCoalescer(windowMs: number = DEFAULT_WINDOW_MS): Coalescer {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  return {
    schedule: (run) => {
      cancel();
      timer = setTimeout(() => {
        timer = undefined;
        run();
      }, windowMs);
    },
    cancel,
  };
}
