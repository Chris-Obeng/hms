-- Stale-lock recovery for push delivery: requeue jobs whose worker died
-- mid-flight (crash/timeout/redeploy) so they can never strand in 'processing'.
-- Edge Function wall-clock cap is 400s, so locks older than 8 minutes are
-- guaranteed orphaned. Reclaims consume an attempt (MAX_ATTEMPTS = 7).
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