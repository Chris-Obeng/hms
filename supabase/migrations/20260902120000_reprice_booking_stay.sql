-- =============================================================================
-- reprice_booking_stay: the one seam through which a booked stay window moves.
--
-- `create_booking_atomic` made the quote and the persisted nightly rates the
-- same numbers by construction at the moment a reservation is written. Nothing
-- did that afterwards. A drag-move or a room-type change on the calendar
-- rewrote `bookings.check_in`/`check_out`/`room_type_id` and stopped there, so
-- the stay kept `booking_nights` rows describing dates it no longer occupied
-- and a `total_amount` priced for a window that no longer existed. Every
-- downstream consumer of those rows -- the folio, the night audit's rate drift
-- report, and any future channel-manager ARI push -- read the stale figures.
--
-- This function closes that gap in one transaction: it re-resolves the nights
-- for the new window through `resolve_nightly_rates`, recomputes the money with
-- `create_booking_atomic`'s formula, replaces `booking_nights`, and writes the
-- booking row -- or rejects and leaves every one of them as it was.
--
-- Two decisions worth stating, because neither is obvious from the code:
--
-- 1. It writes no audit row. `moveBooking` already writes one, with the
--    Clerk-user-to-staff_profiles actor resolution that a SECURITY DEFINER
--    function has no way to perform. Two rows for one staff action would be
--    worse than one, so the function returns `before`/`after` blocks for the
--    caller to fold into the audit row it was already writing.
--
-- 2. A night a human priced by hand (`source = 'manual'`) is kept only while it
--    remains inside the new window and both room type and authoritative plan are
--    unchanged. Changing either pricing authority re-resolves every night.
--
-- Failure model matches `create_booking_atomic` exactly -- P0001 with a stable
-- machine code in DETAIL for policy, native SQLSTATE for integrity -- so the
-- TypeScript classifier needs no second vocabulary.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reprice_booking_stay(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_booking_id      uuid := NULLIF(p_payload->>'booking_id', '')::uuid;
  v_hotel_id        uuid := NULLIF(p_payload->>'hotel_id', '')::uuid;

  -- Key *presence* means "change this field", matching the caller's own
  -- `updates.x !== undefined` semantics. Presence rather than NULL-ness,
  -- because `room_id: null` is a legitimate instruction (unassign) and an
  -- absent `room_id` is not.
  v_has_check_in    boolean := jsonb_exists(p_payload, 'check_in');
  v_has_check_out   boolean := jsonb_exists(p_payload, 'check_out');
  v_has_room_type   boolean := jsonb_exists(p_payload, 'room_type_id');
  v_has_room        boolean := jsonb_exists(p_payload, 'room_id');
  v_has_rooms_count boolean := jsonb_exists(p_payload, 'rooms_count');
  v_has_rate_plan   boolean := jsonb_exists(p_payload, 'rate_plan_id');
  v_has_occupancy   boolean := jsonb_exists(p_payload, 'occupancy');

  -- Seeded from the stored reservation, then overwritten only where the
  -- payload asks. Anything the caller omits keeps the value it already had.
  v_check_in        date;
  v_check_out       date;
  v_room_type_id    uuid;
  v_room_id         uuid;
  v_rooms_count     smallint;
  v_rate_plan_id    uuid;
  v_occupancy       smallint;

  v_status          text;
  v_payment_status  text;
  v_amount_paid     numeric;
  v_old_type_id     uuid;
  v_old_plan_id     uuid;
  v_before          jsonb;
  v_type_changed    boolean;
  v_plan_changed    boolean;
  v_new_payment_status text;

  v_settings        jsonb;
  v_hotel_currency  text;
  v_currency        text;
  v_tax_bps         integer := 0;
  v_nights          integer;
  v_night_count     integer;
  v_distinct_date_count integer;
  v_out_of_range_count integer;
  v_invalid_rate_count integer;
  v_null_plan_count integer;
  v_null_currency_count integer;
  v_currency_count  integer;
  v_unit_minor      bigint;
  v_subtotal_minor  bigint;
  v_tax_minor       bigint;
  v_total_minor     bigint;
  v_room_rate       numeric;
  v_nights_json     jsonb;
  v_resolved_json   jsonb;
  v_kept            integer := 0;
  v_plan_count      integer;
  v_resolved_plan_id uuid;
  v_constraint      text;
  v_occupied_by     text;
BEGIN
  IF v_booking_id IS NULL OR v_hotel_id IS NULL THEN
    RAISE EXCEPTION 'booking_id and hotel_id are required'
      USING ERRCODE = 'P0001', DETAIL = 'invalid_payload';
  END IF;

  -- The row lock serialises two desks dragging the same reservation at once:
  -- the second waits, then re-reads the window the first committed. Scoping the
  -- lookup by hotel is what keeps this callable with the service key -- RLS is
  -- not in play here, so tenancy is checked by hand. A booking belonging to
  -- another property is reported as missing rather than as forbidden, because
  -- the distinction is itself information the caller has no right to.
  SELECT b.status, b.payment_status, COALESCE(b.amount_paid, 0),
         b.check_in, b.check_out, b.room_type_id, b.room_id,
         GREATEST(COALESCE(b.rooms_count, 1), 1)::smallint,
         b.rate_plan_id, b.rate_plan_id, b.room_type_id,
         jsonb_build_object(
           'check_in',     b.check_in,
           'check_out',    b.check_out,
           'room_id',      b.room_id,
           'room_type_id', b.room_type_id,
           'rate_plan_id', b.rate_plan_id,
           'rooms_count',  b.rooms_count,
           'nights',       b.nights,
           'currency',     b.currency,
           'room_rate',    b.room_rate,
           'subtotal',     b.subtotal,
           'tax_amount',   b.tax_amount,
           'total_amount', b.total_amount,
           'amount_paid',  b.amount_paid,
           'payment_status', b.payment_status)
    INTO v_status, v_payment_status, v_amount_paid,
         v_check_in, v_check_out, v_room_type_id, v_room_id, v_rooms_count,
         v_rate_plan_id, v_old_plan_id, v_old_type_id, v_before
    FROM public.bookings b
   WHERE b.id = v_booking_id
     AND b.hotel_id = v_hotel_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking % not found', v_booking_id
      USING ERRCODE = 'P0001', DETAIL = 'booking_not_found';
  END IF;

  -- A departed, cancelled or no-show stay is settled history. Repricing it
  -- would rewrite a folio nobody can re-issue, so it is refused by name and
  -- the status travels in HINT for the caller's copy.
  IF v_status NOT IN ('pending', 'confirmed', 'checked_in') THEN
    RAISE EXCEPTION 'booking % is % and cannot be repriced', v_booking_id, v_status
      USING ERRCODE = 'P0001', DETAIL = 'booking_not_open', HINT = v_status;
  END IF;

  -- Occupancy is historical pricing input, so preserve it from consistent nights.
  SELECT (array_agg(DISTINCT bn.occupancy))[1]
    INTO v_occupancy
    FROM public.booking_nights bn
   WHERE bn.booking_id = v_booking_id
  HAVING count(DISTINCT bn.occupancy) <= 1;

  v_occupancy := COALESCE(v_occupancy, 0);

  -- Every cast the payload can force lives in one block, so a malformed date or
  -- uuid is rejected by name instead of surfacing as a bare 22007 the caller
  -- would have to classify as unknown. The handler names only cast failures, so
  -- it cannot swallow a policy rejection raised further down.
  BEGIN
    IF v_has_check_in    THEN v_check_in     := NULLIF(p_payload->>'check_in', '')::date; END IF;
    IF v_has_check_out   THEN v_check_out    := NULLIF(p_payload->>'check_out', '')::date; END IF;
    IF v_has_room_type   THEN v_room_type_id := NULLIF(p_payload->>'room_type_id', '')::uuid; END IF;
    IF v_has_room        THEN v_room_id      := NULLIF(p_payload->>'room_id', '')::uuid; END IF;
    IF v_has_rooms_count THEN v_rooms_count  := (p_payload->>'rooms_count')::smallint; END IF;
    IF v_has_rate_plan   THEN v_rate_plan_id := NULLIF(p_payload->>'rate_plan_id', '')::uuid; END IF;
    IF v_has_occupancy   THEN v_occupancy    := COALESCE((p_payload->>'occupancy')::smallint, 0); END IF;
  EXCEPTION
    WHEN invalid_datetime_format OR datetime_field_overflow
      OR invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'payload field is not well formed: %', SQLERRM
        USING ERRCODE = 'P0001', DETAIL = 'invalid_payload';
  END;

  -- The stay window and its room type are the reservation's identity. They can
  -- be moved, never cleared.
  IF v_check_in IS NULL OR v_check_out IS NULL OR v_room_type_id IS NULL THEN
    RAISE EXCEPTION 'check_in, check_out and room_type_id cannot be cleared'
      USING ERRCODE = 'P0001', DETAIL = 'invalid_payload';
  END IF;

  IF v_check_out <= v_check_in THEN
    RAISE EXCEPTION 'check_out must be after check_in'
      USING ERRCODE = 'P0001', DETAIL = 'invalid_date_range';
  END IF;

  IF v_rooms_count IS NULL OR v_rooms_count < 1 THEN
    RAISE EXCEPTION 'rooms_count must be at least 1'
      USING ERRCODE = 'P0001', DETAIL = 'invalid_rooms_count';
  END IF;

  v_nights       := v_check_out - v_check_in;
  v_type_changed := v_room_type_id IS DISTINCT FROM v_old_type_id;
  v_plan_changed := v_rate_plan_id IS DISTINCT FROM v_old_plan_id;

  -- Existence and tenancy, deliberately not `is_active`: a stay already sold on
  -- a type that has since been retired must still be movable. Whether staff may
  -- *choose* a retired type is the caller's rule, and it enforces it.
  PERFORM 1
     FROM public.room_types rt
    WHERE rt.id = v_room_type_id
      AND rt.hotel_id = v_hotel_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room type % does not belong to hotel %', v_room_type_id, v_hotel_id
      USING ERRCODE = 'P0001', DETAIL = 'room_type_not_found';
  END IF;

  -- Booking authority is retained unless payload explicitly names another plan.
  PERFORM 1
    FROM public.rate_plans rp
   WHERE rp.id = v_rate_plan_id
     AND rp.hotel_id = v_hotel_id
     AND rp.room_type_id = v_room_type_id
     AND (rp.is_active OR NOT v_plan_changed);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rate plan % is not valid for room type %',
      v_rate_plan_id, v_room_type_id
      USING ERRCODE = 'P0001', DETAIL = 'rate_plan_not_found';
  END IF;

  SELECT h.settings, public.hotel_currency(h.id)
    INTO v_settings, v_hotel_currency
    FROM public.hotels h
   WHERE h.id = v_hotel_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'hotel % not found', v_hotel_id
      USING ERRCODE = 'P0001', DETAIL = 'hotel_not_found';
  END IF;

  -- Tax, read exactly as create_booking_atomic reads it. Matching the
  -- bug-for-bug behaviour here is the point, because the two must never
  -- disagree about what a stay costs.
  IF (v_settings->>'tax_enabled')::boolean IS TRUE
     AND jsonb_typeof(v_settings->'tax_percentage') = 'number' THEN
    v_tax_bps := round((v_settings->>'tax_percentage')::numeric * 100)::integer;
  END IF;

  IF v_room_id IS NOT NULL THEN
    PERFORM 1
       FROM public.rooms r
      WHERE r.id = v_room_id
        AND r.hotel_id = v_hotel_id
        AND r.room_type_id = v_room_type_id
        AND r.status NOT IN ('maintenance', 'out_of_service');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'room % is not bookable for room type %', v_room_id, v_room_type_id
        USING ERRCODE = 'P0001', DETAIL = 'room_not_bookable';
    END IF;

    -- Names the occupant before the write, so the usual case gets a sentence a
    -- guest-facing desk can read out. The EXCLUDE constraint below is still the
    -- authority; this only turns the common rejection into a useful one.
    DECLARE
      v_conflict text;
    BEGIN
      SELECT COALESCE(g.full_name, b.reference)
        INTO v_conflict
        FROM public.bookings b
        LEFT JOIN public.guests g ON g.id = b.guest_id
       WHERE b.room_id = v_room_id
         AND b.id <> v_booking_id
         AND b.status IN ('pending', 'confirmed', 'checked_in')
         AND b.check_in < v_check_out
         AND b.check_out > v_check_in
       LIMIT 1;

      IF v_conflict IS NOT NULL THEN
        RAISE EXCEPTION 'room % is occupied for those dates', v_room_id
          USING ERRCODE = 'P0001', DETAIL = 'room_conflict', HINT = v_conflict;
      END IF;
    END;
  END IF;

  -- === Pricing =============================================================
  --
  -- One statement resolves the new window, merges the hand-priced nights worth
  -- keeping, and produces both the money and the rows that will be stored --
  -- so the totals and `booking_nights` cannot describe different stays.
  --
  -- A kept night must match the hotel's currency: the resolver always returns
  -- that currency, and a night left over from a currency change would otherwise
  -- poison the total it feeds.
  -- Tests may opt into one transaction-local pg_temp resolver. SECURITY DEFINER
  -- calls from application roles cannot activate this owner-session-only seam.
  IF session_user = current_user
     AND current_setting('roomline.rate_resolver', true)
           = 'pg_temp.malformed_nightly_rates' THEN
    EXECUTE format(
      'SELECT jsonb_agg(to_jsonb(r) ORDER BY r.stay_date)
       FROM pg_temp.malformed_nightly_rates($1, $2, $3, $4, $5, $6) r')
      INTO v_resolved_json
      USING v_hotel_id, ARRAY[v_room_type_id], v_check_in, v_check_out,
            v_rate_plan_id, v_occupancy;
  ELSE
    SELECT jsonb_agg(to_jsonb(r) ORDER BY r.stay_date)
      INTO v_resolved_json
      FROM public.resolve_nightly_rates(
             v_hotel_id, ARRAY[v_room_type_id], v_check_in, v_check_out,
             v_rate_plan_id, v_occupancy) r;
  END IF;

  WITH kept AS (
    SELECT bn.stay_date, bn.rate_minor, bn.currency, bn.rate_plan_id,
           bn.occupancy, bn.source, bn.seasonal_rate_id, bn.season_name
      FROM public.booking_nights bn
     WHERE bn.booking_id = v_booking_id
       AND NOT v_type_changed
       AND NOT v_plan_changed
       AND bn.source = 'manual'
       AND bn.currency = v_hotel_currency
       AND bn.stay_date >= v_check_in
       AND bn.stay_date <  v_check_out
  ),
  resolved AS (
    SELECT r.stay_date, r.rate_minor, r.currency, r.rate_plan_id,
           r.occupancy, r.source, r.seasonal_rate_id, r.season_name
      FROM jsonb_to_recordset(COALESCE(v_resolved_json, '[]'::jsonb)) AS r(
             stay_date date, rate_minor bigint, currency text, rate_plan_id uuid,
             occupancy smallint, source text, seasonal_rate_id uuid,
             season_name text)
     WHERE NOT EXISTS (SELECT 1 FROM kept k WHERE k.stay_date = r.stay_date)
  ),
  merged AS (
    SELECT * FROM kept
    UNION ALL
    SELECT * FROM resolved
  )
  SELECT jsonb_agg(jsonb_build_object(
           'stay_date',        m.stay_date,
           'rate_minor',       m.rate_minor,
           'currency',         m.currency,
           'rate_plan_id',     m.rate_plan_id,
           'occupancy',        m.occupancy,
           'source',           m.source,
           'seasonal_rate_id', m.seasonal_rate_id,
           'season_name',      m.season_name) ORDER BY m.stay_date),
         count(*)::integer,
         count(DISTINCT m.stay_date)::integer,
         count(*) FILTER (
           WHERE m.stay_date < v_check_in
              OR m.stay_date >= v_check_out)::integer,
         count(*) FILTER (
           WHERE m.rate_minor IS NULL OR m.rate_minor <= 0)::integer,
         count(*) FILTER (WHERE m.rate_plan_id IS NULL)::integer,
         count(*) FILTER (WHERE m.currency IS NULL)::integer,
         count(DISTINCT m.currency)::integer,
         COALESCE(sum(m.rate_minor), 0),
         min(m.currency),
         count(*) FILTER (WHERE m.source = 'manual')::integer,
         (array_agg(DISTINCT m.rate_plan_id))[1],
         count(DISTINCT m.rate_plan_id)::integer
    INTO v_nights_json, v_night_count, v_distinct_date_count,
         v_out_of_range_count, v_invalid_rate_count, v_null_plan_count,
         v_null_currency_count, v_currency_count, v_unit_minor, v_currency,
         v_kept, v_resolved_plan_id, v_plan_count
    FROM merged m;

  -- Same gate as creation: exact dates, positive rates, one plan and currency.
  IF v_night_count <> v_nights
     OR v_distinct_date_count <> v_nights
     OR v_out_of_range_count <> 0
     OR v_invalid_rate_count <> 0
     OR v_null_plan_count <> 0
     OR v_null_currency_count <> 0
     OR v_currency_count <> 1
     OR v_currency IS DISTINCT FROM v_hotel_currency
     OR v_plan_count <> 1
     OR v_resolved_plan_id IS DISTINCT FROM v_rate_plan_id THEN
    RAISE EXCEPTION 'room type % has no consistent usable rate for % night(s) from %',
      v_room_type_id, v_nights, v_check_in
      USING ERRCODE = 'P0001', DETAIL = 'unpriced_stay';
  END IF;

  v_subtotal_minor := v_unit_minor * v_rooms_count;
  v_tax_minor      := round(v_subtotal_minor::numeric * v_tax_bps / 10000);
  v_total_minor    := v_subtotal_minor + v_tax_minor;
  v_room_rate      := public.from_minor(
                        round(v_unit_minor::numeric / v_night_count)::bigint, v_currency);

  -- Repricing moves the total, so a stay that was marked paid can quietly
  -- become underpaid. The rule mirrors record_payment_atomic's, because those
  -- two are the only writers of this column and they must not disagree.
  -- 'unpaid' and 'refunded' are left exactly as they are: a refund is a
  -- decision someone made, not an arithmetic consequence of a drag-move.
  v_new_payment_status := v_payment_status;

  IF v_amount_paid > 0 AND v_payment_status IN ('partial', 'paid') THEN
    v_new_payment_status := CASE
                              WHEN public.to_minor(v_amount_paid, v_currency) >= v_total_minor
                                THEN 'paid'
                              ELSE 'partial'
                            END;
  END IF;

  -- === First write. Everything above this line rejects without side effects. ==
  --
  -- The window, the room and the money move in one statement, so the BEFORE
  -- UPDATE inventory guard sees the reservation's final shape rather than an
  -- intermediate one. `nights` and `outstanding_balance` are GENERATED ALWAYS
  -- and recompute themselves; writing them would be an error.
  BEGIN
    UPDATE public.bookings b
       SET check_in       = v_check_in,
           check_out      = v_check_out,
           room_type_id   = v_room_type_id,
           rate_plan_id   = v_rate_plan_id,
           room_id        = v_room_id,
           rooms_count    = v_rooms_count,
           room_rate      = v_room_rate,
           subtotal       = public.from_minor(v_subtotal_minor, v_currency),
           tax_amount     = public.from_minor(v_tax_minor, v_currency),
           total_amount   = public.from_minor(v_total_minor, v_currency),
           currency       = v_currency,
           payment_status = v_new_payment_status
     WHERE b.id = v_booking_id
       AND b.hotel_id = v_hotel_id;
  EXCEPTION
    -- 23P01 reaches here from three places: the room-type inventory guard and
    -- the two room-overlap EXCLUDE constraints. The guard's own message already
    -- names the short night and the count, so it is re-thrown untouched and
    -- keeps classifying as inventory_conflict. A room-level overlap is a
    -- different fact and is renamed into create_booking_atomic's vocabulary,
    -- with the occupant in HINT, so one caller switch covers both functions.
    -- Naming only exclusion_violation is deliberate: a handler broad enough to
    -- catch P0001 would swallow the rejections raised above.
    WHEN exclusion_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;

      IF v_constraint = 'bookings_room_type_inventory_guard' THEN
        RAISE;
      END IF;

      SELECT COALESCE(g.full_name, b.reference)
        INTO v_occupied_by
        FROM public.bookings b
        LEFT JOIN public.guests g ON g.id = b.guest_id
       WHERE b.room_id = v_room_id
         AND b.id <> v_booking_id
         AND b.status IN ('pending', 'confirmed', 'checked_in')
         AND b.check_in < v_check_out
         AND b.check_out > v_check_in
       LIMIT 1;

      RAISE EXCEPTION 'room % is occupied for those dates', v_room_id
        USING ERRCODE = 'P0001', DETAIL = 'room_conflict',
              HINT = COALESCE(v_occupied_by, 'another reservation');
  END;

  -- Replaced rather than patched. The merged set above is the whole truth for
  -- the new window, and delete-then-insert is the only shape that cannot leave
  -- a night behind pointing at a date the stay no longer occupies. Both
  -- statements are in the same transaction as the UPDATE, so a reader never
  -- sees a reservation without nights.
  DELETE FROM public.booking_nights bn
   WHERE bn.booking_id = v_booking_id;

  INSERT INTO public.booking_nights (
    hotel_id, booking_id, stay_date, rooms_count, rate_minor, currency,
    rate_plan_id, occupancy, source, seasonal_rate_id, season_name
  )
  SELECT v_hotel_id, v_booking_id, n.stay_date, v_rooms_count, n.rate_minor,
         n.currency, n.rate_plan_id, n.occupancy, n.source,
         n.seasonal_rate_id, n.season_name
    FROM jsonb_to_recordset(v_nights_json) AS n(
           stay_date date, rate_minor bigint, currency text, rate_plan_id uuid,
           occupancy smallint, source text, seasonal_rate_id uuid, season_name text);

  -- `before` and `after` carry the same keys so the caller can hand them
  -- straight to an audit row and the two columns diff cleanly. The flat fields
  -- beside them are what the calling code needs to act on -- minor units so a
  -- payment retry does not re-round, and `nights_kept` so staff can be told
  -- when a manual price survived the move.
  RETURN jsonb_build_object(
    'booking_id',     v_booking_id,
    'night_count',    v_night_count,
    'nights_kept',    v_kept,
    'type_changed',   v_type_changed,
    'currency',       v_currency,
    'subtotal_minor', v_subtotal_minor,
    'tax_minor',      v_tax_minor,
    'total_minor',    v_total_minor,
    'nights',         v_nights_json,
    'before',         v_before,
    'after',          jsonb_build_object(
                        'check_in', v_check_in,
                        'check_out', v_check_out,
                        'room_id', v_room_id,
                        'room_type_id', v_room_type_id,
                        'rate_plan_id', v_rate_plan_id,
                        'rooms_count', v_rooms_count,
                        'nights', v_nights,
                        'currency', v_currency,
                        'room_rate', v_room_rate,
                        'subtotal', public.from_minor(v_subtotal_minor, v_currency),
                        'tax_amount', public.from_minor(v_tax_minor, v_currency),
                        'total_amount', public.from_minor(v_total_minor, v_currency),
                        'amount_paid', v_amount_paid,
                        'payment_status', v_new_payment_status));
END;
$fn$;

COMMENT ON FUNCTION public.reprice_booking_stay(jsonb) IS
  'Moves a booked stay window, room, room type, or explicitly selected rate plan '
  'and re-resolves its nightly rates, money and booking_nights in one transaction. '
  'Payload keys are presence-sensitive: an absent key leaves the column alone, '
  'and room_id null unassigns. booking_id and hotel_id are required, and a booking '
  'another hotel is reported as booking_not_found. Writes no audit row -- it '
  'returns before/after blocks for the caller to audit under the acting staff '
  'member, which a SECURITY DEFINER function cannot resolve.';

REVOKE ALL ON FUNCTION public.reprice_booking_stay(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reprice_booking_stay(jsonb) TO service_role;
