-- ============================================================================
-- Payment-hold lifecycle + true multi-room support
--
-- 1. bookings.rooms_count          — quantity of rooms booked per row
-- 2. room_type_available_count()   — rooms_count-aware + ignores stale
--                                    unpaid payment holds (>30 min old)
-- 3. expire_stale_payment_holds()  — cancels abandoned pay-online holds
-- 4. pg_cron schedule              — runs expiry every 5 minutes
-- 5. Supporting indexes
-- ============================================================================

-- 1. Quantity column ---------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS rooms_count integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_rooms_range CHECK (rooms_count BETWEEN 1 AND 50);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Availability RPC — rooms_count aware, skips expired holds ---------------
CREATE OR REPLACE FUNCTION public.room_type_available_count(
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date
)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public, extensions'
AS $function$
  WITH stay_dates AS (
    SELECT generate_series(p_check_in, p_check_out - 1, interval '1 day')::date AS stay_date
  ),
  inventory AS (
    SELECT count(*)::integer AS room_capacity
    FROM public.rooms r
    WHERE r.room_type_id = p_room_type_id
      AND r.is_active = true
      AND r.status NOT IN ('maintenance', 'out_of_service')
  ),
  nightly AS (
    SELECT
      d.stay_date,
      i.room_capacity
        - (
            SELECT count(DISTINCT ab.room_id)::integer
            FROM public.availability_blocks ab
            JOIN public.rooms r ON r.id = ab.room_id
            WHERE r.room_type_id = p_room_type_id
              AND r.is_active = true
              AND ab.start_date <= d.stay_date
              AND ab.end_date > d.stay_date
          )
        - (
            SELECT COALESCE(SUM(b.rooms_count), 0)::integer
            FROM public.bookings b
            WHERE b.room_type_id = p_room_type_id
              AND b.status IN ('pending', 'confirmed', 'checked_in')
              -- Abandoned online-payment holds do not hold inventory forever:
              -- pending + fully unpaid + guest-initiated + older than 30 min.
              AND NOT (
                    b.status = 'pending'
                AND b.payment_status = 'unpaid'
                AND b.payment_preference = 'pay_now'
                AND b.source = 'direct'
                AND b.created_at < now() - interval '30 minutes'
              )
              AND b.check_in <= d.stay_date
              AND b.check_out > d.stay_date
          ) AS available
    FROM stay_dates d
    CROSS JOIN inventory i
  )
  SELECT CASE
    WHEN p_check_out <= p_check_in THEN 0
    ELSE GREATEST(COALESCE(min(available), 0), 0)::integer
  END
  FROM nightly;
$function$;

COMMENT ON FUNCTION public.room_type_available_count(uuid, date, date) IS
  'Public: free-room count for [check_in, check_out). Multiplies booking quantities (rooms_count) and ignores abandoned online-payment holds older than 30 minutes.';

-- 3. Expiry sweeper -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_stale_payment_holds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public, extensions'
AS $function$
DECLARE
  affected integer;
BEGIN
  UPDATE public.bookings
     SET status = 'cancelled',
         cancelled_at = now(),
         cancellation_reason = 'payment_timeout',
         updated_at = now()
   WHERE status = 'pending'
     AND payment_status = 'unpaid'
     AND payment_preference = 'pay_now'
     AND source = 'direct'
     AND created_at < now() - interval '30 minutes';

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$function$;

COMMENT ON FUNCTION public.expire_stale_payment_holds() IS
  'Cancels guest-initiated online bookings left unpaid for over 30 minutes and releases their inventory. Scheduled via pg_cron every 5 minutes.';

-- 4. Cron schedule (idempotent) ----------------------------------------------
DO $outer$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-payment-holds') THEN
    PERFORM cron.schedule(
      'expire-payment-holds',
      '*/5 * * * *',
      $cron$SELECT public.expire_stale_payment_holds();$cron$
    );
  END IF;
END $outer$;

-- 5. Indexes -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bookings_stale_payment_holds
  ON public.bookings (created_at)
  WHERE status = 'pending'
    AND payment_status = 'unpaid'
    AND payment_preference = 'pay_now'
    AND source = 'direct';