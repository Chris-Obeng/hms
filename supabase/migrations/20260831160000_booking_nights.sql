-- booking_nights: the per-night snapshot of what a reservation was sold for.
--
-- Today a booking keeps one `room_rate` and one `total_amount`. The
-- `ResolvedNight[]` array that produced them is computed on every quote and
-- thrown away, so the system cannot answer: what was the 24th priced at, what
-- does a guest owe if they leave two nights early, why is this invoice this
-- number. A channel reservation payload carries exactly this per-night shape,
-- so distribution needs it too.
--
-- This migration lands the table, the drift report and the backfill. Phase 8's
-- `create_booking_atomic` wires the writers, so that a quote and the row it
-- persists are the same numbers by construction.
--
-- Deliberately absent: any CHECK or trigger asserting that
-- sum(rate_minor * rooms_count) equals bookings.total_amount. Manual discounts,
-- comped nights and tax handling all make them legitimately differ, and a
-- constraint would start rejecting valid staff edits. Drift is reported to a
-- human in Night Audit instead -- see public.booking_nights_drift below.

CREATE TABLE IF NOT EXISTS public.booking_nights (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id         uuid        NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  booking_id       uuid        NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  stay_date        date        NOT NULL,
  rooms_count      smallint    NOT NULL DEFAULT 1,
  rate_minor       bigint      NOT NULL,
  currency         text        NOT NULL,
  rate_plan_id     uuid,
  occupancy        smallint    NOT NULL DEFAULT 0,
  source           text        NOT NULL,
  seasonal_rate_id uuid,
  season_name      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_nights_unique_night UNIQUE (booking_id, stay_date),
  CONSTRAINT booking_nights_rooms_count_positive CHECK (rooms_count > 0),
  CONSTRAINT booking_nights_rate_positive       CHECK (rate_minor > 0),
  CONSTRAINT booking_nights_occupancy_sane      CHECK (occupancy >= 0),
  CONSTRAINT booking_nights_currency_format     CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT booking_nights_source_known CHECK (
    source IN ('daily', 'seasonal', 'base', 'manual', 'reconstructed'))
);

-- `rate_plan_id` and `seasonal_rate_id` are provenance, not relationships: they
-- are recorded without a foreign key on purpose, so deleting a retired rate plan
-- or last year's season cannot erase why an invoice line says what it says.
COMMENT ON COLUMN public.booking_nights.rate_plan_id IS
  'Rate plan that produced this night, recorded without an FK so retiring a plan cannot rewrite history.';
COMMENT ON COLUMN public.booking_nights.seasonal_rate_id IS
  'Season that produced this night, recorded without an FK for the same reason. season_name keeps the label readable after the season row is gone.';
COMMENT ON COLUMN public.booking_nights.rate_minor IS
  'Per-room, per-night rate in the currency''s smallest unit. Multiply by rooms_count for the night total; lib/money.ts is the reference implementation.';
COMMENT ON COLUMN public.booking_nights.occupancy IS
  'Occupancy the rate was resolved for. 0 means the rate is not occupancy-dependent.';
COMMENT ON COLUMN public.booking_nights.source IS
  'Which pricing tier won: daily override, seasonal, base, a manual staff figure, or reconstructed by the Phase 7 backfill from bookings.room_rate.';
COMMENT ON TABLE public.booking_nights IS
  'One row per booking per night: the rate the reservation was sold at. Written in the same transaction as the booking (Phase 8). Never reconciled against bookings.total_amount by a constraint -- see booking_nights_drift().';

-- The night-audit and folio reads are always "this hotel, this date range".
CREATE INDEX IF NOT EXISTS booking_nights_hotel_date_idx
  ON public.booking_nights (hotel_id, stay_date);
-- Reading every night of one reservation is the folio view.
CREATE INDEX IF NOT EXISTS booking_nights_booking_idx
  ON public.booking_nights (booking_id);

DROP TRIGGER IF EXISTS handle_booking_nights_updated_at ON public.booking_nights;
CREATE TRIGGER handle_booking_nights_updated_at
  BEFORE UPDATE ON public.booking_nights
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- RLS. Org isolation for reads and inserts (front desk creates reservations);
-- rewriting or deleting a night is rewriting an invoice line, so it takes a
-- manager -- mirroring public.payments. Legitimate machine rewrites (a date
-- change re-resolving nights) go through a SECURITY DEFINER RPC in Phase 8,
-- not through a client DELETE.
-- -----------------------------------------------------------------------------

ALTER TABLE public.booking_nights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_nights_org_isolation ON public.booking_nights;
CREATE POLICY booking_nights_org_isolation ON public.booking_nights
  FOR ALL
  USING      (hotel_id IN (SELECT public.get_user_hotel_ids()))
  WITH CHECK (hotel_id IN (SELECT public.get_user_hotel_ids()));

DROP POLICY IF EXISTS booking_nights_direct_update_requires_manager ON public.booking_nights;
CREATE POLICY booking_nights_direct_update_requires_manager ON public.booking_nights
  AS RESTRICTIVE FOR UPDATE
  USING      (public.user_role_at_least(hotel_id, 'manager'))
  WITH CHECK (public.user_role_at_least(hotel_id, 'manager'));

DROP POLICY IF EXISTS booking_nights_delete_requires_manager ON public.booking_nights;
CREATE POLICY booking_nights_delete_requires_manager ON public.booking_nights
  AS RESTRICTIVE FOR DELETE
  USING (public.user_role_at_least(hotel_id, 'manager'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_nights TO authenticated, service_role;
-- No anon path exists in this app; see 20260831150000_privilege_parity.sql.
REVOKE ALL ON public.booking_nights FROM anon;

-- -----------------------------------------------------------------------------
-- Drift report. Night Audit already has a human reviewing figures once a day;
-- this gives them the list a constraint would have refused to let happen.
--
-- SECURITY INVOKER on purpose: the caller's own RLS policies filter both tables,
-- so a manager can only ever see their own hotels' bookings through it.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.booking_nights_drift(p_hotel_id uuid)
RETURNS TABLE (
  booking_id         uuid,
  reference          text,
  check_in           date,
  check_out          date,
  status             text,
  currency           text,
  nights_expected    integer,
  nights_recorded    integer,
  room_revenue_minor bigint,
  nights_total_minor bigint,
  difference_minor   bigint
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT b.id,
         b.reference,
         b.check_in,
         b.check_out,
         b.status,
         upper(coalesce(b.currency, public.hotel_currency(b.hotel_id))),
         (b.check_out - b.check_in)::integer                       AS nights_expected,
         coalesce(n.night_count, 0)::integer                       AS nights_recorded,
         public.to_minor(b.subtotal, coalesce(b.currency, public.hotel_currency(b.hotel_id))) AS room_revenue_minor,
         coalesce(n.nights_total_minor, 0)                         AS nights_total_minor,
         coalesce(n.nights_total_minor, 0)
           - public.to_minor(b.subtotal, coalesce(b.currency, public.hotel_currency(b.hotel_id))) AS difference_minor
    FROM public.bookings b
    LEFT JOIN (
      SELECT bn.booking_id,
             count(*)                                AS night_count,
             sum(bn.rate_minor * bn.rooms_count)      AS nights_total_minor
        FROM public.booking_nights bn
       WHERE bn.hotel_id = p_hotel_id
       GROUP BY bn.booking_id
    ) n ON n.booking_id = b.id
   WHERE b.hotel_id = p_hotel_id
     AND coalesce(b.status, '') <> 'cancelled'
     AND (
       coalesce(n.night_count, 0) <> (b.check_out - b.check_in)
       OR coalesce(n.nights_total_minor, 0) <>
          public.to_minor(b.subtotal, coalesce(b.currency, public.hotel_currency(b.hotel_id)))
     )
   ORDER BY b.check_in DESC, b.reference;
$$;

COMMENT ON FUNCTION public.booking_nights_drift(uuid) IS
  'Bookings whose recorded nights do not reconcile with bookings.subtotal, or whose night count is wrong. A report for Night Audit, deliberately not a constraint: manual discounts and comped nights are legitimate reasons to differ.';

REVOKE ALL ON FUNCTION public.booking_nights_drift(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_nights_drift(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Backfill: open stays only.
--
-- Each night gets the rate the guest actually agreed to (bookings.room_rate, the
-- per-room per-night figure already stored on the booking), not a re-resolution
-- of today's pricing configuration -- seasons and daily overrides have moved
-- since these bookings were quoted, and writing today's numbers into what is
-- effectively financial history would be worse than leaving it empty.
--
-- Marked source = 'reconstructed' so a reconstructed night can never be mistaken
-- for a quoted one. Departed stays are deliberately not backfilled.
--
-- Idempotent: ON CONFLICT DO NOTHING, so a re-run adds only what is missing.
-- -----------------------------------------------------------------------------

-- Exposed as a function rather than inlined so the same code path can be
-- re-run later: onboarding a hotel that already has reservations, or repairing
-- a gap left by an incident. service_role only -- it writes across tenants when
-- p_hotel_id is null, which no dashboard session may do.
CREATE OR REPLACE FUNCTION public.backfill_booking_nights(p_hotel_id uuid DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  inserted_count bigint;
BEGIN
  WITH candidate AS (
    SELECT b.id,
           b.hotel_id,
           b.room_rate,
           b.rooms_count,
           upper(coalesce(b.currency, public.hotel_currency(b.hotel_id))) AS currency,
           b.check_in,
           b.check_out
      FROM public.bookings b
     WHERE (p_hotel_id IS NULL OR b.hotel_id = p_hotel_id)
       AND b.check_out >= current_date
       AND coalesce(b.status, '') <> 'cancelled'
       AND b.room_rate > 0
       AND b.check_out > b.check_in
  ), expanded AS (
    INSERT INTO public.booking_nights (
      hotel_id, booking_id, stay_date, rooms_count, rate_minor, currency,
      occupancy, source
    )
    SELECT c.hotel_id,
           c.id,
           d::date,
           c.rooms_count::smallint,
           public.to_minor(c.room_rate, c.currency),
           c.currency,
           0::smallint,
           'reconstructed'
      FROM candidate c
      CROSS JOIN generate_series(
             c.check_in::timestamp,
             (c.check_out - 1)::timestamp,
             interval '1 day') AS d
    ON CONFLICT (booking_id, stay_date) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO inserted_count FROM expanded;

  RETURN inserted_count;
END
$fn$;

COMMENT ON FUNCTION public.backfill_booking_nights(uuid) IS
  'Writes one reconstructed night per stayed date for open, priceable, non-cancelled stays, using the rate already stored on the booking. Idempotent. Returns the number of night rows written. Pass a hotel id to scope it; null covers every tenant, which is why only service_role may execute it.';

REVOKE ALL ON FUNCTION public.backfill_booking_nights(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_booking_nights(uuid) TO service_role;

DO $backfill$
DECLARE
  inserted_count bigint;
  skipped_count  bigint;
BEGIN
  inserted_count := public.backfill_booking_nights();

  SELECT count(*) INTO skipped_count
    FROM public.bookings b
   WHERE b.check_out >= current_date
     AND coalesce(b.status, '') <> 'cancelled'
     AND (b.room_rate <= 0 OR b.check_out <= b.check_in);

  RAISE NOTICE 'booking_nights backfill: % night rows written for open stays, % booking(s) skipped as non-priceable',
    inserted_count, skipped_count;
END
$backfill$;

-- -----------------------------------------------------------------------------
-- Guard. Fails the migration here rather than letting a half-applied table
-- reach an environment where the dashboard would hit it.
-- -----------------------------------------------------------------------------

DO $guard$
DECLARE
  problems text[] := '{}';
  verb      text;
  role_name text;
  gap      bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'public' AND c.relname = 'booking_nights'
                    AND c.relrowsecurity) THEN
    problems := problems || 'row level security is not enabled on booking_nights';
  END IF;

  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'booking_nights') <> 3 THEN
    problems := problems || 'booking_nights should carry exactly 3 policies (1 permissive, 2 restrictive manager gates)';
  END IF;

  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'booking_nights'
         AND permissive = 'RESTRICTIVE') <> 2 THEN
    problems := problems || 'booking_nights is missing a restrictive manager gate on UPDATE or DELETE';
  END IF;

  FOREACH verb IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    IF NOT has_table_privilege('authenticated', 'public.booking_nights', verb) THEN
      problems := problems || format('authenticated cannot %s public.booking_nights', verb);
    END IF;
    IF has_table_privilege('anon', 'public.booking_nights', verb) THEN
      problems := problems || format('anon can %s public.booking_nights; no anon path exists in this app', verb);
    END IF;
  END LOOP;

  IF NOT has_function_privilege('authenticated', 'public.booking_nights_drift(uuid)', 'EXECUTE') THEN
    problems := problems || 'authenticated cannot execute booking_nights_drift; Night Audit would fail';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.booking_nights_drift(uuid)', 'EXECUTE') THEN
    problems := problems || 'service_role cannot execute booking_nights_drift';
  END IF;
  IF has_function_privilege('anon', 'public.booking_nights_drift(uuid)', 'EXECUTE') THEN
    problems := problems || 'anon can execute booking_nights_drift';
  END IF;

  -- The backfill is cross-tenant when called with no argument, so a dashboard
  -- session must not be able to reach it at all.
  IF NOT has_function_privilege('service_role', 'public.backfill_booking_nights(uuid)', 'EXECUTE') THEN
    problems := problems || 'service_role cannot execute backfill_booking_nights';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['authenticated', 'anon'] LOOP
    IF has_function_privilege(role_name, 'public.backfill_booking_nights(uuid)', 'EXECUTE') THEN
      problems := problems || format('%s can execute backfill_booking_nights, which writes across tenants', role_name);
    END IF;
  END LOOP;

  -- Every open, priceable stay should now hold one row per night.
  SELECT count(*) INTO gap
    FROM public.bookings b
    LEFT JOIN (
      SELECT booking_id, count(*) AS n FROM public.booking_nights GROUP BY booking_id
    ) bn ON bn.booking_id = b.id
   WHERE b.check_out >= current_date
     AND coalesce(b.status, '') <> 'cancelled'
     AND b.room_rate > 0
     AND b.check_out > b.check_in
     AND coalesce(bn.n, 0) <> (b.check_out - b.check_in);

  IF gap > 0 THEN
    problems := problems || format('%s open stay(s) still have an incomplete set of nights after backfill', gap);
  END IF;

  IF array_length(problems, 1) > 0 THEN
    RAISE EXCEPTION 'booking_nights guard failed: %', array_to_string(problems, '; ');
  END IF;

  RAISE NOTICE 'PASS booking_nights: RLS, manager gates, grants, drift report and open-stay backfill all verified';
END
$guard$;
