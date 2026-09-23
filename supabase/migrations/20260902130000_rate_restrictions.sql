-- =============================================================================
-- 20260902130000_rate_restrictions.sql
--
-- Length-of-stay and open/closed controls per rate plan per date, plus the one
-- function that decides whether a stay clears them.
--
-- Until now a hotel could set a price for a night but not a condition on it.
-- There was no way to say "three nights minimum over the holidays", "no Saturday
-- arrivals", or "stop selling this plan on the 24th", and nothing to project onto
-- a channel manager, whose restriction payload is exactly this shape.
--
-- Column names are Channex's ARI field names verbatim, so the eventual push is a
-- projection with no rename layer to drift. Two facts from that API shape the
-- table:
--
--   * `min_stay` is a virtual field there — a value posted to it is translated
--     into `min_stay_arrival` or `min_stay_through` according to the property's
--     `min_stay_type`, and it may not be used when that setting is `both`. We do
--     not model `min_stay_type`, so `min_stay` is kept as the simple control for
--     a hotel that does not care which of the two it means, and a CHECK forbids
--     setting it alongside either specific field. A hotel that needs both uses
--     the two specific columns and leaves `min_stay` null.
--   * `max_stay` is documented as non-negative rather than positive, because 0 is
--     how the API clears it. Zero therefore means "no maximum" here too, not "no
--     nights allowed".
--
-- The evaluation dates are not stated by that documentation; they are the OTA
-- convention, and because getting one of them wrong silently sells or refuses the
-- wrong stay, each is written on its column below and pinned by
-- supabase/tests/rate_restrictions.sql.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rate_restrictions (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  hotel_id            uuid        NOT NULL,
  rate_plan_id        uuid        NOT NULL,
  date                date        NOT NULL,
  min_stay            smallint,
  min_stay_arrival    smallint,
  min_stay_through    smallint,
  max_stay            smallint,
  closed_to_arrival   boolean     NOT NULL DEFAULT false,
  closed_to_departure boolean     NOT NULL DEFAULT false,
  stop_sell           boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rate_restrictions_pkey PRIMARY KEY (id),

  -- One row per plan per date. This is also the lookup index
  -- stay_restriction_violations ranges over, so no second index is needed for it.
  CONSTRAINT rate_restrictions_plan_date_key UNIQUE (rate_plan_id, date),

  CONSTRAINT rate_restrictions_hotel_id_fkey FOREIGN KEY (hotel_id)
    REFERENCES public.hotels (id) ON DELETE CASCADE,
  -- Composite, in the house style: a restriction can never point at another
  -- hotel's rate plan, so the org-isolation policy cannot be sidestepped by
  -- writing hotel_id of one tenant and rate_plan_id of another.
  CONSTRAINT rate_restrictions_rate_plan_fk FOREIGN KEY (rate_plan_id, hotel_id)
    REFERENCES public.rate_plans (id, hotel_id) ON DELETE CASCADE,

  CONSTRAINT rate_restrictions_min_stay_positive
    CHECK (min_stay IS NULL OR min_stay >= 1),
  CONSTRAINT rate_restrictions_min_stay_arrival_positive
    CHECK (min_stay_arrival IS NULL OR min_stay_arrival >= 1),
  CONSTRAINT rate_restrictions_min_stay_through_positive
    CHECK (min_stay_through IS NULL OR min_stay_through >= 1),
  CONSTRAINT rate_restrictions_max_stay_nonneg
    CHECK (max_stay IS NULL OR max_stay >= 0),
  -- Keeps the three minimum-stay columns from contradicting each other.
  CONSTRAINT rate_restrictions_min_stay_exclusive CHECK (
    min_stay IS NULL OR (min_stay_arrival IS NULL AND min_stay_through IS NULL)
  )
);

COMMENT ON TABLE public.rate_restrictions IS
  'Per-rate-plan, per-date stay controls in Channex ARI field names. A row whose flags are all false and whose stay columns are all null is a no-op; clearing restrictions should delete the row rather than blank it, so the ARI projection stays sparse.';
COMMENT ON COLUMN public.rate_restrictions.date IS
  'The date the restriction is attached to. Which part of a stay that date has to be is per column, and differs: closed_to_departure is the only one that can match the departure day.';
COMMENT ON COLUMN public.rate_restrictions.min_stay IS
  'Simple minimum nights, evaluated on the arrival date. Channex treats this as a virtual alias translated by the property min_stay_type, so it may not be combined with min_stay_arrival or min_stay_through (rate_restrictions_min_stay_exclusive).';
COMMENT ON COLUMN public.rate_restrictions.min_stay_arrival IS
  'Minimum nights for a stay that arrives on this date. Ignored for a stay that merely covers it.';
COMMENT ON COLUMN public.rate_restrictions.min_stay_through IS
  'Minimum nights for any stay that includes this date as one of its nights, whatever day it arrived. Evaluated on every night of the stay, which is what makes it the stricter of the two.';
COMMENT ON COLUMN public.rate_restrictions.max_stay IS
  'Maximum nights for a stay arriving on this date. 0 means no maximum, matching how the Channex API clears the field.';
COMMENT ON COLUMN public.rate_restrictions.closed_to_arrival IS
  'A stay may not start on this date. Says nothing about a stay that passes through it.';
COMMENT ON COLUMN public.rate_restrictions.closed_to_departure IS
  'A stay may not end on this date. The departure day is not one of the stay nights, so this is the one restriction read from outside the night range.';
COMMENT ON COLUMN public.rate_restrictions.stop_sell IS
  'Not sellable at all. Violated when any night of the stay carries it.';

CREATE INDEX IF NOT EXISTS idx_rate_restrictions_hotel_date
  ON public.rate_restrictions (hotel_id, date);

DROP TRIGGER IF EXISTS handle_rate_restrictions_updated_at ON public.rate_restrictions;
CREATE TRIGGER handle_rate_restrictions_updated_at
  BEFORE UPDATE ON public.rate_restrictions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Restrictions decide whether a guest may book at all, so they take the access
-- shape of the pricing tables they sit beside: one permissive tenant-isolation
-- policy for every command, plus restrictive manager gates on the writes.

ALTER TABLE public.rate_restrictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rate_restrictions_org_isolation ON public.rate_restrictions;
CREATE POLICY rate_restrictions_org_isolation ON public.rate_restrictions
  USING (hotel_id IN (SELECT public.get_user_hotel_ids()))
  WITH CHECK (hotel_id IN (SELECT public.get_user_hotel_ids()));

DROP POLICY IF EXISTS rate_restrictions_insert_requires_manager ON public.rate_restrictions;
CREATE POLICY rate_restrictions_insert_requires_manager ON public.rate_restrictions
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.user_role_at_least(hotel_id, 'manager'));

DROP POLICY IF EXISTS rate_restrictions_update_requires_manager ON public.rate_restrictions;
CREATE POLICY rate_restrictions_update_requires_manager ON public.rate_restrictions
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'manager'))
  WITH CHECK (public.user_role_at_least(hotel_id, 'manager'));

DROP POLICY IF EXISTS rate_restrictions_delete_requires_manager ON public.rate_restrictions;
CREATE POLICY rate_restrictions_delete_requires_manager ON public.rate_restrictions
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.user_role_at_least(hotel_id, 'manager'));

-- Table privileges arrive from Supabase default privileges on the hosted project
-- but not in a database rebuilt from migrations alone, so state them. The public
-- widget reads restrictions through the service-role client, so anon needs none.
-- The default privileges installed by 20260831150000_privilege_parity.sql hand
-- anon ALL on every table created after it. This app has no anon database path,
-- so the residue is revoked rather than left for RLS alone to cover.
REVOKE ALL ON public.rate_restrictions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_restrictions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_restrictions TO service_role;

-- ── effective_rate_plan_id ───────────────────────────────────────────────────
--
-- Which plan a room type is priced and restricted on. Rate plans are per room
-- type, so a caller holding only a room type — the restriction trigger on
-- bookings, the availability grid, the ARI projection — has to resolve one.
--
-- The ORDER BY is a copy of the `plans` LATERAL inside resolve_nightly_rates
-- (20260831030000). It has to stay a copy: that function resolves a plan per
-- room type for an array of room types in one set-based pass and also carries the
-- plan's currency out of the same join, so calling this per row there would buy
-- nothing. The two are pinned together by supabase/tests/rate_restrictions.sql,
-- which fails if they ever disagree.
CREATE OR REPLACE FUNCTION public.effective_rate_plan_id(
  p_hotel_id     uuid,
  p_room_type_id uuid,
  p_rate_plan_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT rp.id
  FROM public.rate_plans rp
  WHERE rp.hotel_id = p_hotel_id
    AND rp.room_type_id = p_room_type_id
    AND (rp.is_active OR rp.id = p_rate_plan_id)
  ORDER BY (rp.id IS NOT DISTINCT FROM p_rate_plan_id) DESC,
           rp.is_default DESC,
           rp.created_at,
           rp.id
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.effective_rate_plan_id(uuid, uuid, uuid) IS
  'The rate plan a room type sells on: the requested plan when it belongs to that room type, otherwise the room type default, otherwise the oldest active plan. Returns null when the room type has no plan. Mirrors the plans CTE in resolve_nightly_rates exactly.';

REVOKE ALL ON FUNCTION public.effective_rate_plan_id(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_rate_plan_id(uuid, uuid, uuid)
  TO anon, authenticated, service_role;

-- ── stay_restriction_violations ──────────────────────────────────────────────
--
-- Every restriction a stay breaks, as `code:detail` strings. Empty array means
-- the stay is sellable, so callers test `cardinality(...) = 0` rather than
-- comparing against a sentinel.
--
-- The detail half is there so a caller can say what is actually wrong without a
-- second query: the binding nights count for the length-of-stay codes
-- ("min_stay_through:3"), the offending ISO date for the boolean ones
-- ("closed_to_arrival:2026-12-24"). At most one element per code, ordered by the
-- ordinals below, so the array is at most 7 long whatever the stay length and the
-- string is stable enough to assert on.
--
-- The window. p_check_in is the first night, p_check_out is the departure day and
-- is NOT a stay night, so the nights are [check_in, check_out) while
-- closed_to_departure is the one restriction read from outside that range.
-- Length of stay is the night count, check_out - check_in.
--
-- A zero- or negative-length window returns an empty array rather than raising:
-- bookings_dates_valid already rejects it, and a pricing preview should not get a
-- restriction error for a date range the user is still typing. A null plan id
-- likewise returns empty — a room type with no rate plan has no restrictions,
-- not an error.
--
-- Reads through RLS by definer right because the guest booking path has to call
-- it before any tenant is established. It discloses nothing a guest quoting that
-- plan on the public widget cannot already see, which is why anon may execute it.
CREATE OR REPLACE FUNCTION public.stay_restriction_violations(
  p_rate_plan_id uuid,
  p_check_in     date,
  p_check_out    date
) RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  WITH stay AS (
    SELECT (p_check_out - p_check_in)::int AS los
  ),
  -- One scan of the plan's rows over the stay, inclusive of the checkout date so
  -- the closed_to_departure check has its row. Everything below slices this.
  covering AS (
    SELECT r.date,
           r.min_stay,
           r.min_stay_arrival,
           r.min_stay_through,
           r.max_stay,
           r.closed_to_arrival,
           r.closed_to_departure,
           r.stop_sell
    FROM public.rate_restrictions r
    WHERE r.rate_plan_id = p_rate_plan_id
      AND r.date >= p_check_in
      AND r.date <= p_check_out
  ),
  arrival AS (
    SELECT * FROM covering WHERE date = p_check_in
  ),
  departure AS (
    SELECT * FROM covering WHERE date = p_check_out
  ),
  night_rows AS (
    SELECT * FROM covering WHERE date >= p_check_in AND date < p_check_out
  ),
  -- Each branch is an aggregate query with no GROUP BY, so it yields exactly one
  -- row or, under HAVING, none — which is what keeps the array to one element per
  -- code. The ordinal orders the output; it is not part of the string.
  found AS (
    SELECT 1 AS ord,
           'stop_sell:' || to_char(min(n.date), 'YYYY-MM-DD') AS v
    FROM night_rows n
    WHERE n.stop_sell
    HAVING count(*) > 0

    UNION ALL
    SELECT 2, 'closed_to_arrival:' || to_char(a.date, 'YYYY-MM-DD')
    FROM arrival a
    WHERE a.closed_to_arrival

    UNION ALL
    SELECT 3, 'closed_to_departure:' || to_char(d.date, 'YYYY-MM-DD')
    FROM departure d
    WHERE d.closed_to_departure

    -- min_stay and min_stay_arrival cannot both be set on a row
    -- (rate_restrictions_min_stay_exclusive), so at most one of these two fires.
    UNION ALL
    SELECT 4, 'min_stay:' || a.min_stay::text
    FROM arrival a CROSS JOIN stay s
    WHERE a.min_stay IS NOT NULL AND s.los < a.min_stay

    UNION ALL
    SELECT 5, 'min_stay_arrival:' || a.min_stay_arrival::text
    FROM arrival a CROSS JOIN stay s
    WHERE a.min_stay_arrival IS NOT NULL AND s.los < a.min_stay_arrival

    -- Every night has to permit a stay this short, so the strictest of the
    -- violating nights is the number to report back.
    UNION ALL
    SELECT 6, 'min_stay_through:' || max(n.min_stay_through)::text
    FROM night_rows n CROSS JOIN stay s
    WHERE n.min_stay_through IS NOT NULL AND s.los < n.min_stay_through
    HAVING count(*) > 0

    -- 0 clears the field rather than forbidding every stay, as in the Channex API.
    UNION ALL
    SELECT 7, 'max_stay:' || a.max_stay::text
    FROM arrival a CROSS JOIN stay s
    WHERE a.max_stay IS NOT NULL AND a.max_stay > 0 AND s.los > a.max_stay
  )
  SELECT COALESCE(array_agg(f.v ORDER BY f.ord), '{}'::text[])
  FROM found f
  WHERE p_rate_plan_id IS NOT NULL
    AND p_check_out > p_check_in;
$function$;

COMMENT ON FUNCTION public.stay_restriction_violations(uuid, date, date) IS
  'Restrictions a stay breaks on one rate plan, as code:detail strings; empty array means sellable. closed_to_arrival is read on the check-in date, closed_to_departure on the check-out date (not a stay night), min_stay and min_stay_arrival and max_stay on the arrival date, min_stay_through and stop_sell on every night. Evaluation dates are the OTA convention and are pinned by supabase/tests/rate_restrictions.sql.';

REVOKE ALL ON FUNCTION public.stay_restriction_violations(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stay_restriction_violations(uuid, date, date)
  TO anon, authenticated, service_role;

-- ── assert_stay_restrictions ─────────────────────────────────────────────────
--
-- Refuses a public booking that breaks the plan's restrictions.
--
-- Only for `source = 'direct'`, and only on INSERT. Both halves of that are
-- deliberate. Restrictions are a distribution control, not a house rule: when a
-- guest is standing at the counter the front desk has to be able to take a
-- two-night booking over a three-night minimum, so a staff-entered booking
-- (`manual`, `phone`, `walk_in`) is never checked, and neither is an OTA booking
-- (`bookings_com`), which the channel already screened on its own side. UPDATE is
-- excluded for the same reason one step later: every update path — check-in,
-- payment, a calendar drag through reprice_booking_stay — is staff-initiated, and
-- a guard on UPDATE would let a restriction set after the fact freeze a booking
-- the front desk needs to move.
--
-- Named so it sorts before bookings_room_type_inventory_guard, which takes an
-- advisory lock: this check is read-only, so failing it first costs nothing and
-- avoids serialising doomed inserts behind that lock.
--
-- The rejection carries the machine code in DETAIL, not in the SQLSTATE. 23514 is
-- shared with every real CHECK on the table (bookings_dates_valid among them), so
-- a caller keying off the SQLSTATE alone would mistranslate those. DETAIL is the
-- house convention already read by classify() in
-- lib/bookings/create-booking-atomic.ts, and HINT carries the violation list
-- verbatim so the front end can name the actual reason.
CREATE OR REPLACE FUNCTION public.assert_stay_restrictions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_rate_plan_id uuid;
  v_violations   text[];
BEGIN
  -- Nothing to check for a stay that holds no inventory, has no window, or is
  -- already closed. Mirrors the guard in assert_room_type_inventory().
  IF NEW.room_type_id IS NULL
     OR NEW.check_in IS NULL
     OR NEW.check_out IS NULL
     OR NEW.check_out <= NEW.check_in
     OR COALESCE(NEW.status, 'pending') NOT IN ('pending', 'confirmed', 'checked_in')
  THEN
    RETURN NEW;
  END IF;

  v_rate_plan_id := NEW.rate_plan_id;

  -- Legacy rows can remain planless; atomic booking always stores one.
  IF v_rate_plan_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_violations := public.stay_restriction_violations(
    v_rate_plan_id, NEW.check_in, NEW.check_out
  );

  IF cardinality(v_violations) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'bookings_restrictions_guard',
      MESSAGE = format(
        'Stay %s to %s is not sellable on this rate plan: %s',
        NEW.check_in, NEW.check_out, array_to_string(v_violations, ', ')
      ),
      DETAIL = 'stay_restrictions',
      HINT = array_to_string(v_violations, ',');
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.assert_stay_restrictions() IS
  'BEFORE INSERT guard on bookings, armed only for an unattributed direct stay: the public booking widget, which sets no created_by. Rejects with SQLSTATE 23514, DETAIL stay_restrictions and the violation list in HINT. A desk booking carries the staff profile that took it and is exempt here, because the front desk may sell a restricted stay - that decision is gated on the actor role and written to the audit log by the server action, which unlike a SECURITY DEFINER function can resolve a Clerk user to a staff profile. OTA sources are exempt because the channel manager applies its own ARI.';

REVOKE ALL ON FUNCTION public.assert_stay_restrictions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_stay_restrictions() TO service_role;

DROP TRIGGER IF EXISTS bookings_restrictions_guard ON public.bookings;
CREATE TRIGGER bookings_restrictions_guard
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  WHEN (NEW.source = 'direct' AND NEW.created_by IS NULL)
  EXECUTE FUNCTION public.assert_stay_restrictions();

COMMENT ON TRIGGER bookings_restrictions_guard ON public.bookings IS
  'Rejects a stay taken through the public booking widget that breaks its rate plan restrictions. WHEN (source = direct AND created_by IS NULL) is the whole distinction between the guest funnel and a desk booking signed for by a staff profile: the guest funnel has no override, so the refusal here is unconditional. Named to sort before bookings_room_type_inventory_guard so a closed stay is refused before that trigger takes its advisory lock.';

-- ---------------------------------------------------------------------------
-- 7. The batch read the booking widget uses
-- ---------------------------------------------------------------------------
-- The widget asks the same question about every room type at once, so it gets a
-- set-returning function rather than one call per room type: the same reason
-- room_type_available_counts exists. A guest polling dates costs one round trip
-- for the whole room list, whatever the hotel's size.
--
-- Booking writes store the plan selected by resolve_nightly_rates. This trigger
-- reads that same authority rather than independently choosing a default plan.

CREATE OR REPLACE FUNCTION public.room_type_stay_restrictions(
  p_hotel_id      uuid,
  p_room_type_ids uuid[],
  p_check_in      date,
  p_check_out     date
) RETURNS TABLE (
  room_type_id uuid,
  rate_plan_id uuid,
  violations   text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT rt.id,
         plan.rate_plan_id,
         -- stay_restriction_violations already returns '{}' for a null plan or a
         -- degenerate window; COALESCE only guarantees the column is never null
         -- so a caller can read .length without a guard.
         COALESCE(
           public.stay_restriction_violations(plan.rate_plan_id, p_check_in, p_check_out),
           '{}'::text[]
         )
  FROM public.room_types rt
  CROSS JOIN LATERAL (
    SELECT public.effective_rate_plan_id(p_hotel_id, rt.id) AS rate_plan_id
  ) plan
  WHERE rt.hotel_id = p_hotel_id
    AND rt.id = ANY(p_room_type_ids)
  ORDER BY rt.id;
$function$;

COMMENT ON FUNCTION public.room_type_stay_restrictions(uuid, uuid[], date, date) IS
  'Per-room-type restriction violations for one stay window, one round trip. Rows are returned for every requested room type of the hotel, with an empty array when the stay is sellable and a null rate_plan_id when the room type has no plan. Room types of another hotel are silently absent rather than an error, so a tampered id leaks nothing.';

REVOKE ALL ON FUNCTION public.room_type_stay_restrictions(uuid, uuid[], date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.room_type_stay_restrictions(uuid, uuid[], date, date)
  TO anon, authenticated, service_role;
