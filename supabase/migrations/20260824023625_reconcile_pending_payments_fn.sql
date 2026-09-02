-- Safety net for: guest paid, closed the browser, webhook delayed beyond the
-- 30-minute hold expiry. Every 5 min (offset from expire_stale_payment_holds)
-- fire a server-side verify call for each pending hold's known Paystack
-- references. The shared recordOnlinePayment pipeline confirms anything that
-- actually succeeded; expiry then only cancels holds that truly have no money.
CREATE OR REPLACE FUNCTION public.reconcile_pending_payments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, extensions, vault'
AS $$
DECLARE
  base_url text;
  fired integer := 0;
  r record;
BEGIN
  SELECT decrypted_secret INTO base_url
    FROM vault.decrypted_secrets
   WHERE name = 'payment_reconcile_base_url'
   LIMIT 1;

  IF base_url IS NULL OR btrim(base_url) = '' THEN
    RETURN 0; -- not configured: sweep disabled
  END IF;
  base_url := rtrim(btrim(base_url), '/');

  FOR r IN
    SELECT h.slug, ref
      FROM public.bookings b
      JOIN public.hotels h ON h.id = b.hotel_id
      CROSS JOIN LATERAL unnest(b.initiated_payment_refs) AS ref
     WHERE b.status = 'pending'
       AND b.payment_status = 'unpaid'
       AND b.payment_preference = 'pay_now'
       AND b.source = 'direct'
       AND b.created_at > now() - interval '24 hours'
       AND cardinality(b.initiated_payment_refs) > 0
     ORDER BY b.created_at
     LIMIT 100
  LOOP
    -- References are [A-Z0-9-] only (generated app-side), URL-safe as-is.
    -- Fire-and-forget: pg_net delivers async; the verify endpoint is public,
    -- idempotent, and re-validates everything against the Paystack API.
    PERFORM net.http_get(
      url := base_url || '/api/booking/' || r.slug || '/payments/verify?reference=' || ref
    );
    fired := fired + 1;
  END LOOP;

  RETURN fired;
END;
$$;
