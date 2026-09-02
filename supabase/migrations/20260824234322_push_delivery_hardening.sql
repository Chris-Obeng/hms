-- Push delivery hardening: atomic job claiming, per-subscription tracking, retention.

ALTER TABLE public.notification_delivery_outbox
  ADD COLUMN IF NOT EXISTS delivered_subscription_ids uuid[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.claim_push_jobs(p_limit integer DEFAULT 50)
RETURNS SETOF public.notification_delivery_outbox
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.notification_delivery_outbox o
  SET status = 'processing',
      locked_at = now(),
      updated_at = now()
  WHERE o.id IN (
    SELECT j.id
    FROM public.notification_delivery_outbox j
    WHERE j.status IN ('pending', 'retry')
      AND j.next_attempt_at <= now()
    ORDER BY j.next_attempt_at
    LIMIT LEAST(GREATEST(p_limit, 1), 200)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING o.*;
$$;

REVOKE ALL ON FUNCTION public.claim_push_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_jobs(integer) TO service_role;

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

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM cron.job WHERE jobname = 'prune-push-delivery-data';
  IF v_count > 0 THEN
    PERFORM cron.unschedule('prune-push-delivery-data');
  END IF;
END $$;

SELECT cron.schedule(
  'prune-push-delivery-data',
  '17 3 * * *',
  $$SELECT public.prune_push_delivery_data();$$
);