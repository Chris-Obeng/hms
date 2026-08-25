const KICK_TIMEOUT_MS = 5000;

/**
 * Nudge the deliver-push-notifications worker so queued push jobs are
 * processed immediately instead of waiting up to 60s for the pg_cron tick.
 * Fire-and-forget by design: the cron schedule remains the safety net, so
 * any failure here must never block or fail the caller.
 */
export function kickDeliveryWorker(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.PUSH_WORKER_SECRET;
  if (!url || !secret) return;

  void fetch(`${url}/functions/v1/deliver-push-notifications`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
    body: "{}",
    signal: AbortSignal.timeout(KICK_TIMEOUT_MS),
  }).catch(() => {
    // Cron will pick the jobs up on its next tick.
  });
}
