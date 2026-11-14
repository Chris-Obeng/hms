-- Early departures shorten the stay.
--
-- Checking a guest out before their booked departure used to leave the
-- booking's dates alone: the room was released for resale, but Night Audit,
-- Reports and the dashboard still counted the unused nights as room nights
-- and room revenue. Mews, Cloudbeds and OPERA all move the departure date to
-- the day the guest left; USALI / STR count only nights a guest occupied as
-- rooms sold, and money kept for unused nights is a fee, not room revenue.
--
-- This migration:
--   1. adds bookings.early_departure_fee, the part of the bill kept for nights
--      the guest did not use (part of total_amount, never of subtotal or
--      booking_nights, so it is never room revenue or a room night);
--   2. adds public.check_out_early / public.preview_early_check_out
--      (service role only; the server action checks the staff role first).
--      The departure becomes the property's business date today, but never
--      earlier than one night after check-in: a guest who leaves on their
--      arrival day still used that night. Unused nights are dropped from
--      booking_nights and the stay's subtotal and tax shrink in proportion.
--      What happens to the money follows the hotel's
--      settings.early_departure_policy:
--        'charge'  (default) the bill stays the same and the unused nights
--                  become the early departure fee, as before this change;
--        'release' the bill drops by the unused nights; any overpayment is
--                  left for staff to refund.
--   3. shortens the stays already checked out early (charge: no bill
--      changes). Nights already closed by Night Audit keep their receipts;
--   4. adds public.record_manual_refund so staff can record money they gave
--      back in person (cash, mobile money, bank transfer). It never contacts
--      Paystack: the hotel refunds the guest itself.
--
-- The client-write guard also rejects a direct checked_in -> checked_out
-- update that would leave early, so every early check-out is shortened.
BEGIN;

SET LOCAL lock_timeout = '5s';

-- ── 1. The fee ───────────────────────────────────────────────────────────
ALTER TABLE public.bookings
  ADD COLUMN early_departure_fee numeric(10,2) NOT NULL DEFAULT 0
    CONSTRAINT bookings_early_departure_fee_nonnegative CHECK (early_departure_fee >= 0);
COMMENT ON COLUMN public.bookings.early_departure_fee IS
  'Amount kept for nights a guest did not use after checking out early. Included in total_amount; never in subtotal, tax_amount or booking_nights, so it is not room revenue or a room night.';

-- Clients may not write it directly, like every other money field.
CREATE OR REPLACE FUNCTION public.guard_bookings_client_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_jwt_role    text := COALESCE((SELECT auth.jwt()) ->> 'role', current_setting('request.jwt.claim.role', true), '');
  v_sub         text := COALESCE((SELECT auth.jwt()) ->> 'sub',  current_setting('request.jwt.claim.sub', true));
  v_invoker_rol text := COALESCE(current_setting('role', true), 'none');
  v_valid_move  boolean := false;
  v_zone        text;
BEGIN
  IF v_jwt_role = 'service_role'
     OR (
       current_user IN ('postgres', 'service_role', 'supabase_admin')
       AND v_invoker_rol IN ('none', 'postgres', 'service_role', 'supabase_admin')
       AND v_jwt_role NOT IN ('authenticated', 'anon')
       AND v_sub IS NULL
     ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Bookings must be created through the server booking workflow'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.hotel_id IS DISTINCT FROM OLD.hotel_id
     OR NEW.reference IS DISTINCT FROM OLD.reference
     OR NEW.guest_id IS DISTINCT FROM OLD.guest_id
     OR NEW.room_type_id IS DISTINCT FROM OLD.room_type_id
     OR NEW.check_in IS DISTINCT FROM OLD.check_in
     OR NEW.check_out IS DISTINCT FROM OLD.check_out
     OR NEW.rooms_count IS DISTINCT FROM OLD.rooms_count
     OR NEW.room_rate IS DISTINCT FROM OLD.room_rate
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
     OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.amount_paid IS DISTINCT FROM OLD.amount_paid
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.payment_preference IS DISTINCT FROM OLD.payment_preference
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.rate_plan_id IS DISTINCT FROM OLD.rate_plan_id
     OR NEW.group_id IS DISTINCT FROM OLD.group_id
     OR NEW.initiated_payment_refs IS DISTINCT FROM OLD.initiated_payment_refs
     OR NEW.channel_provider IS DISTINCT FROM OLD.channel_provider
     OR NEW.external_booking_id IS DISTINCT FROM OLD.external_booking_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.early_departure_fee IS DISTINCT FROM OLD.early_departure_fee THEN
    RAISE EXCEPTION 'Cannot directly modify immutable or financial booking fields'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_valid_move := (
      (OLD.status = 'pending'    AND NEW.status IN ('confirmed', 'cancelled', 'no_show')) OR
      (OLD.status = 'confirmed'  AND NEW.status IN ('checked_in', 'cancelled', 'no_show')) OR
      (OLD.status = 'checked_in' AND NEW.status IN ('checked_out')) OR
      (OLD.status = 'cancelled'  AND NEW.status IN ('confirmed')) OR
      (OLD.status = 'no_show'    AND NEW.status IN ('confirmed'))
    );
    IF NOT v_valid_move THEN
      RAISE EXCEPTION 'Invalid booking status transition from % to %', OLD.status, NEW.status
        USING ERRCODE = '22023';
    END IF;

    -- Leaving before the booked departure shortens the stay, which only
    -- public.check_out_early may do. Same rule as that function.
    IF OLD.status = 'checked_in' AND NEW.status = 'checked_out' THEN
      SELECT h.timezone INTO v_zone FROM public.hotels h WHERE h.id = OLD.hotel_id;
      IF greatest((clock_timestamp() AT TIME ZONE coalesce(v_zone, 'UTC'))::date, OLD.check_in + 1) < OLD.check_out THEN
        RAISE EXCEPTION 'Checking out before the booked departure must go through check_out_early'
          USING ERRCODE = '22023', DETAIL = 'early_departure';
      END IF;
    END IF;

    IF NEW.status = 'cancelled'
       AND COALESCE(OLD.amount_paid, 0) > 0
       AND NOT public.user_role_at_least(OLD.hotel_id, 'manager') THEN
      RAISE EXCEPTION 'Cancelling a booking with recorded payments requires manager privileges'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.guard_bookings_client_write() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_bookings_client_write() TO service_role;

-- ── 2. Shortening a stay ─────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS bookings_private;
REVOKE ALL ON SCHEMA bookings_private FROM PUBLIC, anon, authenticated, service_role;

-- Ends a stay at p_new_check_out. Subtotal and tax shrink in proportion to
-- the nights dropped (by their booked rates when every night is on record,
-- else by night count), so a discount or the tax rate the stay was sold at is
-- kept. With p_charge_unused the dropped amount becomes the early departure
-- fee and the bill stays the same; without it the bill drops by that amount.
-- With p_write false nothing is written (a preview).
CREATE FUNCTION bookings_private.shorten_stay(
  p_booking_id uuid,
  p_new_check_out date,
  p_charge_unused boolean,
  p_write boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_check_in        date;
  v_check_out       date;
  v_currency        text;
  v_subtotal        numeric;
  v_tax             numeric;
  v_total           numeric;
  v_fee             numeric;
  v_paid            numeric;
  v_payment_status  text;
  v_old_nights      integer;
  v_rows            integer;
  v_all_minor       bigint;
  v_kept_minor      bigint;
  v_ratio           numeric;
  v_old_sub_minor   bigint;
  v_old_tax_minor   bigint;
  v_new_sub_minor   bigint;
  v_new_tax_minor   bigint;
  v_released_minor  bigint;
  v_fee_minor       bigint;
  v_total_minor     bigint;
  v_paid_minor      bigint;
  v_new_status      text;
BEGIN
  SELECT b.check_in, b.check_out, coalesce(b.currency, public.hotel_currency(b.hotel_id)),
         b.subtotal, coalesce(b.tax_amount, 0), b.total_amount, b.early_departure_fee,
         coalesce(b.amount_paid, 0), b.payment_status
    INTO v_check_in, v_check_out, v_currency, v_subtotal, v_tax, v_total, v_fee,
         v_paid, v_payment_status
    FROM public.bookings b
   WHERE b.id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking % not found', p_booking_id
      USING ERRCODE = 'P0001', DETAIL = 'booking_not_found';
  END IF;

  IF p_new_check_out <= v_check_in OR p_new_check_out >= v_check_out THEN
    RAISE EXCEPTION 'booking % does not end after %', p_booking_id, p_new_check_out
      USING ERRCODE = 'P0001', DETAIL = 'not_early';
  END IF;

  v_old_nights := v_check_out - v_check_in;

  SELECT count(*)::integer,
         coalesce(sum(n.rate_minor * n.rooms_count), 0)::bigint,
         coalesce(sum(n.rate_minor * n.rooms_count) FILTER (WHERE n.stay_date < p_new_check_out), 0)::bigint
    INTO v_rows, v_all_minor, v_kept_minor
    FROM public.booking_nights n
   WHERE n.booking_id = p_booking_id
     AND n.stay_date >= v_check_in
     AND n.stay_date < v_check_out;

  IF v_rows = v_old_nights AND v_all_minor > 0 THEN
    v_ratio := v_kept_minor::numeric / v_all_minor;
  ELSE
    v_ratio := (p_new_check_out - v_check_in)::numeric / v_old_nights;
  END IF;

  v_old_sub_minor  := public.to_minor(v_subtotal, v_currency);
  v_old_tax_minor  := public.to_minor(v_tax, v_currency);
  v_new_sub_minor  := round(v_old_sub_minor * v_ratio)::bigint;
  v_new_tax_minor  := round(v_old_tax_minor * v_ratio)::bigint;
  v_released_minor := (v_old_sub_minor - v_new_sub_minor) + (v_old_tax_minor - v_new_tax_minor);
  v_fee_minor      := public.to_minor(v_fee, v_currency)
                      + CASE WHEN p_charge_unused THEN v_released_minor ELSE 0 END;
  v_total_minor    := public.to_minor(v_total, v_currency)
                      - CASE WHEN p_charge_unused THEN 0 ELSE v_released_minor END;
  v_paid_minor     := public.to_minor(v_paid, v_currency);

  -- Same rule as reprice_booking_stay: only a stay already paid against moves
  -- between partial and paid; unpaid and refunded stay as they are.
  v_new_status := v_payment_status;
  IF v_paid_minor > 0 AND v_payment_status IN ('partial', 'paid') THEN
    v_new_status := CASE WHEN v_paid_minor >= v_total_minor THEN 'paid' ELSE 'partial' END;
  END IF;

  IF p_write THEN
    DELETE FROM public.booking_nights n
     WHERE n.booking_id = p_booking_id
       AND n.stay_date >= p_new_check_out;

    UPDATE public.bookings b
       SET check_out           = p_new_check_out,
           subtotal            = public.from_minor(v_new_sub_minor, v_currency),
           tax_amount          = public.from_minor(v_new_tax_minor, v_currency),
           early_departure_fee = public.from_minor(v_fee_minor, v_currency),
           total_amount        = public.from_minor(v_total_minor, v_currency),
           payment_status      = v_new_status
     WHERE b.id = p_booking_id;
  END IF;

  RETURN jsonb_build_object(
    'booking_id',          p_booking_id,
    'currency',            v_currency,
    'check_out_before',    v_check_out,
    'check_out_after',     p_new_check_out,
    'nights_released',     v_check_out - p_new_check_out,
    'released_amount',     public.from_minor(v_released_minor, v_currency),
    'early_departure_fee', public.from_minor(v_fee_minor, v_currency),
    'total_before',        v_total,
    'total_after',         public.from_minor(v_total_minor, v_currency),
    'amount_paid',         v_paid,
    'overpaid',            public.from_minor(greatest(v_paid_minor - v_total_minor, 0), v_currency),
    'payment_status',      v_new_status);
END;
$fn$;

REVOKE ALL ON FUNCTION bookings_private.shorten_stay(uuid, date, boolean, boolean)
  FROM PUBLIC, anon, authenticated, service_role;

-- Checks a guest out before their booked departure, in one transaction:
-- shortens the stay (see bookings_private.shorten_stay) and marks it
-- checked out. p_unused_nights overrides the hotel's policy for this stay.
CREATE FUNCTION public.check_out_early(
  p_booking_id uuid,
  p_hotel_id uuid,
  p_unused_nights text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_status    text;
  v_check_in  date;
  v_check_out date;
  v_zone      text;
  v_policy    text;
  v_today     date;
  v_new_out   date;
  v_result    jsonb;
BEGIN
  IF p_unused_nights IS NOT NULL AND p_unused_nights NOT IN ('charge', 'release') THEN
    RAISE EXCEPTION 'unused nights must be charge or release'
      USING ERRCODE = 'P0001', DETAIL = 'invalid_payload';
  END IF;

  SELECT b.status, b.check_in, b.check_out, coalesce(h.timezone, 'UTC'),
         h.settings->>'early_departure_policy'
    INTO v_status, v_check_in, v_check_out, v_zone, v_policy
    FROM public.bookings b
    JOIN public.hotels h ON h.id = b.hotel_id
   WHERE b.id = p_booking_id
     AND b.hotel_id = p_hotel_id
     FOR UPDATE OF b;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking % not found', p_booking_id
      USING ERRCODE = 'P0001', DETAIL = 'booking_not_found';
  END IF;

  IF v_status IS DISTINCT FROM 'checked_in' THEN
    RAISE EXCEPTION 'booking % is not in house', p_booking_id
      USING ERRCODE = 'P0001', DETAIL = 'booking_not_in_house', HINT = v_status;
  END IF;

  v_policy  := coalesce(p_unused_nights,
                        CASE WHEN v_policy IN ('charge', 'release') THEN v_policy ELSE 'charge' END);
  v_today   := (clock_timestamp() AT TIME ZONE v_zone)::date;
  v_new_out := greatest(v_today, v_check_in + 1);

  IF v_new_out >= v_check_out THEN
    RAISE EXCEPTION 'booking % is not leaving early', p_booking_id
      USING ERRCODE = 'P0001', DETAIL = 'not_early';
  END IF;

  -- Check out first: the room guards only police active stays, and a room
  -- that went out of service (or was blocked) while the guest was in it must
  -- not stop them leaving.
  UPDATE public.bookings b
     SET status = 'checked_out',
         check_out_at = now()
   WHERE b.id = p_booking_id;

  v_result := bookings_private.shorten_stay(p_booking_id, v_new_out, v_policy = 'charge', true);

  RETURN v_result || jsonb_build_object('policy', v_policy, 'departure_date', v_today);
END;
$fn$;

-- What an early check-out would do today, both ways, without writing.
CREATE FUNCTION public.preview_early_check_out(p_booking_id uuid, p_hotel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_status    text;
  v_check_in  date;
  v_check_out date;
  v_zone      text;
  v_policy    text;
  v_today     date;
  v_new_out   date;
BEGIN
  SELECT b.status, b.check_in, b.check_out, coalesce(h.timezone, 'UTC'),
         h.settings->>'early_departure_policy'
    INTO v_status, v_check_in, v_check_out, v_zone, v_policy
    FROM public.bookings b
    JOIN public.hotels h ON h.id = b.hotel_id
   WHERE b.id = p_booking_id
     AND b.hotel_id = p_hotel_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking % not found', p_booking_id
      USING ERRCODE = 'P0001', DETAIL = 'booking_not_found';
  END IF;

  v_today   := (clock_timestamp() AT TIME ZONE v_zone)::date;
  v_new_out := greatest(v_today, v_check_in + 1);

  IF v_status IS DISTINCT FROM 'checked_in' OR v_new_out >= v_check_out THEN
    RETURN jsonb_build_object('early', false);
  END IF;

  RETURN jsonb_build_object(
    'early',          true,
    'policy',         CASE WHEN v_policy IN ('charge', 'release') THEN v_policy ELSE 'charge' END,
    'departure_date', v_today,
    'charge',         bookings_private.shorten_stay(p_booking_id, v_new_out, true, false),
    'release',        bookings_private.shorten_stay(p_booking_id, v_new_out, false, false));
END;
$fn$;

REVOKE ALL ON FUNCTION public.check_out_early(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_early_check_out(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_out_early(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.preview_early_check_out(uuid, uuid) TO service_role;

-- ── 3. Stays already checked out early ───────────────────────────────────
-- Shorten them to the day the guest left (at least one night), keeping each
-- bill exactly as it is: the unused nights become the early departure fee.
-- One audit row per stay records the change.
DO $$
DECLARE
  r record;
  v_result jsonb;
BEGIN
  FOR r IN
    SELECT b.id, b.hotel_id, b.reference,
           greatest((b.check_out_at AT TIME ZONE coalesce(h.timezone, 'UTC'))::date, b.check_in + 1) AS new_out
      FROM public.bookings b
      JOIN public.hotels h ON h.id = b.hotel_id
     WHERE b.status = 'checked_out'
       AND b.check_out_at IS NOT NULL
       AND greatest((b.check_out_at AT TIME ZONE coalesce(h.timezone, 'UTC'))::date, b.check_in + 1) < b.check_out
     ORDER BY b.id
  LOOP
    v_result := bookings_private.shorten_stay(r.id, r.new_out, true, true);
    INSERT INTO public.audit_logs (hotel_id, staff_name, action, entity_type, entity_id, before_state, after_state)
    VALUES (
      r.hotel_id, 'Oriel', 'booking.early_checkout', 'booking', r.id,
      jsonb_build_object('reference', r.reference, 'check_out', v_result->>'check_out_before'),
      jsonb_build_object('reference', r.reference, 'check_out', v_result->>'check_out_after',
                         'nights_released', (v_result->>'nights_released')::integer,
                         'early_departure_fee', (v_result->>'early_departure_fee')::numeric,
                         'reason', 'Stay shortened to the day the guest checked out'));
  END LOOP;
END;
$$;

-- ── 4. Recording a refund given in person ────────────────────────────────
-- After an early check-out with the unused nights taken off the bill, the
-- guest may have paid more than the new total. The hotel gives that money
-- back itself; this records it. Only the credit can be refunded, so a bill
-- is never left unpaid by a refund. No Paystack refund is ever started.
CREATE FUNCTION public.record_manual_refund(
  p_hotel_id    uuid,
  p_booking_id  uuid,
  p_amount      numeric,
  p_method      text,
  p_notes       text DEFAULT NULL,
  p_recorded_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_currency     text;
  v_total        numeric;
  v_paid         numeric;
  v_credit_minor bigint;
  v_amount_minor bigint;
  v_paid_minor   bigint;
  v_status       text;
  v_payment_id   uuid;
BEGIN
  IF p_method IS NULL OR p_method NOT IN ('cash', 'mobile_money', 'bank_transfer', 'pos', 'other') THEN
    RAISE EXCEPTION 'refund method must be cash, mobile_money, bank_transfer, pos or other'
      USING ERRCODE = 'P0001', DETAIL = 'invalid_payload';
  END IF;

  SELECT coalesce(b.currency, public.hotel_currency(b.hotel_id)), b.total_amount, coalesce(b.amount_paid, 0)
    INTO v_currency, v_total, v_paid
    FROM public.bookings b
   WHERE b.id = p_booking_id
     AND b.hotel_id = p_hotel_id
     FOR UPDATE OF b;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking % not found', p_booking_id
      USING ERRCODE = 'P0001', DETAIL = 'booking_not_found';
  END IF;

  v_paid_minor   := public.to_minor(v_paid, v_currency);
  v_credit_minor := v_paid_minor - public.to_minor(v_total, v_currency);
  v_amount_minor := public.to_minor(p_amount, v_currency);

  IF p_amount IS NULL OR v_amount_minor <= 0 THEN
    RAISE EXCEPTION 'refund amount must be positive'
      USING ERRCODE = 'P0001', DETAIL = 'invalid_payload';
  END IF;

  IF v_amount_minor > v_credit_minor THEN
    RAISE EXCEPTION 'refund is more than the guest has paid above the bill'
      USING ERRCODE = 'P0001', DETAIL = 'refund_exceeds_credit',
            HINT = public.from_minor(greatest(v_credit_minor, 0), v_currency)::text;
  END IF;

  INSERT INTO public.payments (
    hotel_id, booking_id, amount, currency, method, status, paid_at, notes, recorded_by, metadata
  ) VALUES (
    p_hotel_id, p_booking_id, public.from_minor(v_amount_minor, v_currency), upper(v_currency),
    'refund', 'refunded', now(), nullif(btrim(coalesce(p_notes, '')), ''), p_recorded_by,
    jsonb_build_object('source', 'manual', 'refund_method', p_method)
  )
  RETURNING id INTO v_payment_id;

  v_paid_minor := v_paid_minor - v_amount_minor;
  v_status := CASE
                WHEN v_paid_minor <= 0 THEN 'refunded'
                WHEN v_paid_minor < public.to_minor(v_total, v_currency) THEN 'partial'
                ELSE 'paid'
              END;

  UPDATE public.bookings b
     SET amount_paid    = public.from_minor(v_paid_minor, v_currency),
         payment_status = v_status
   WHERE b.id = p_booking_id;

  RETURN jsonb_build_object(
    'payment_id',     v_payment_id,
    'currency',       v_currency,
    'amount',         public.from_minor(v_amount_minor, v_currency),
    'amount_paid',    public.from_minor(v_paid_minor, v_currency),
    'credit_left',    public.from_minor(v_credit_minor - v_amount_minor, v_currency),
    'payment_status', v_status);
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_manual_refund(uuid, uuid, numeric, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_manual_refund(uuid, uuid, numeric, text, text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
