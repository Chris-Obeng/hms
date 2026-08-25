-- Push delivery hardening: atomic job claiming, per-subscription tracking, retention.

-- 1. Track which subscriptions already received a notification so retries
--    never double-send to a device that already got it.
ALTER TABLE public.notification_delivery_outbox
  ADD COLUMN IF NOT EXISTS delivered_subscription_ids uuid[] NOT NULL DEFAULT '{}';

-- 2. Atomically claim due jobs. FOR UPDATE SKIP LOCKED prevents overlapping
--    cron invocations from processing the same job twice.
--    Before claiming, requeue jobs whose worker died mid-flight (crash,
--    timeout, redeploy): Supabase caps Edge Function wall-clock time at 400s,
--    so a 'processing' lock older than 8 minutes is guaranteed orphaned.
--    Reclaims consume an attempt and honour MAX_ATTEMPTS (7, mirrored by the
--    deliver-push-notifications worker) so poison jobs cannot loop forever.
--    Note: the reclaiming statement's snapshot means reclaimed rows become
--    claimable on the NEXT tick, which is fine (they were just requeued).
CREATE OR REPLACE FUNCTION public.claim_push_jobs(p_limit integer DEFAULT 50)
RETURNS SETOF public.notification_delivery_outbox
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH reclaimed AS (
    UPDATE public.notification_delivery_outbox j
    SET status = CASE WHEN j.attempt_count + 1 >= 7 THEN 'dead_letter' ELSE 'retry' END,
        attempt_count = j.attempt_count + 1,
        last_error = 'Reclaimed: delivery lock expired before completion',
        next_attempt_at = now(),
        locked_at = NULL,
        updated_at = now()
    WHERE j.status = 'processing'
      AND j.locked_at < now() - interval '8 minutes'
  )
  UPDATE public.notification_delivery_outbox o
  SET status = 'processing',
      locked_at = now(),
      updated_at = now()
  WHERE o.id IN (
    SELECT c.id
    FROM (
      SELECT j2.id
      FROM public.notification_delivery_outbox j2
      WHERE j2.status IN ('pending', 'retry')
        AND j2.next_attempt_at <= now()
      ORDER BY j2.next_attempt_at
      LIMIT LEAST(GREATEST(p_limit, 1), 200)
      FOR UPDATE SKIP LOCKED
    ) AS c
  )
  RETURNING o.*;
$$;

REVOKE ALL ON FUNCTION public.claim_push_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_jobs(integer) TO service_role;

-- 3. Retention: keep the outbox and subscription tables bounded.
CREATE OR REPLACE FUNCTION public.prune_push_delivery_data()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.notification_delivery_outbox
  WHERE status = 'delivered' AND delivered_at < now() - interval '30 days';

  DELETE FROM public.notification_delivery_outbox
  WHERE status = 'dead_letter' AND updated_at < now() - interval '90 days';

  DELETE FROM public.push_subscriptions
  WHERE disabled_at IS NOT NULL AND disabled_at < now() - interval '30 days';

  DELETE FROM public.push_subscriptions
  WHERE expires_at IS NOT NULL AND expires_at < now() - interval '7 days';
END; $$;

REVOKE ALL ON FUNCTION public.prune_push_delivery_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_push_delivery_data() TO service_role;

SELECT cron.unschedule('prune-push-delivery-data');
SELECT cron.schedule(
  'prune-push-delivery-data',
  '17 3 * * *',
  $$SELECT public.prune_push_delivery_data();$$
);
