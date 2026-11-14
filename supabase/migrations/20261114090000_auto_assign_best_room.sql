-- =============================================================================
-- Auto-assign the best free room to new reservations (staff and guest), the
-- way Mews does: every stay lands on a numbered room straight away, and staff
-- drag it elsewhere when they need to.
--
-- 1. bookings_private.pick_best_room() chooses the room. It is the only place
--    the rule lives:
--      * hard rules: same room type, active, not maintenance/out of service,
--        no availability block and no active stay over [check_in, check_out).
--        Abandoned payment holds still count as occupying the room here, since
--        bookings_no_room_overlap counts them until they are swept, so a
--        chosen room can never fail the insert;
--      * for a stay starting today or earlier, a vacant ready room
--        (status 'available') first, so the guest can go straight in;
--      * then the tightest fit: the fewest empty nights left between this stay
--        and the room's neighbouring stays (each side capped at 30). Back to
--        back stays come first and empty rooms stay free for long bookings;
--      * then room number in numeric order ("room 2" before "room 10").
--    Only stays of the same room type within 30 nights of the stay are read
--    (further ones cannot change the result, since each gap is capped at 30),
--    so the cost does not grow with the hotel's whole booking history.
--    bookings_private.property_today() gives the hotel's local date without
--    scanning pg_timezone_names on every call.
-- 2. create_booking_atomic() uses it when assign_room is true, and now takes
--    the (hotel, room type) advisory lock before it reads availability, so
--    concurrent bookings cannot pick the same room. A staff-chosen room is
--    also checked against abandoned holds, like the picker, so a desk booking
--    of that room gets "room_conflict" instead of failing the overlap
--    constraint. Everything else in the function is unchanged from
--    20261112063939 (verified against the live definition before this change).
-- 3. expire_stale_payment_holds() releases the room of a hold it cancels. A
--    payment that lands after expiry revives the hold; with its old room kept,
--    a colleague's booking of that room since would mark the paid guest as
--    sold out even when another room of the type is free.
-- 4. public.pick_best_room_for_booking() lets the calendar's "Assign" button
--    use the same rule for an existing unassigned stay (service role only).
-- 5. assert_availability_block_no_booking_conflict() no longer ignores
--    abandoned holds: they keep their room until swept, so a block over one
--    would leave a revived (late-paid) stay on a blocked room.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- ── 1. Room picker ────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS bookings_private;
REVOKE ALL ON SCHEMA bookings_private FROM PUBLIC, anon, authenticated, service_role;

-- The hotel's local date. An unknown or malformed zone falls back to the
-- database date (UTC), matching businessToday() in lib/business-date.ts, which
-- falls back to UTC. Only IANA-style names are tried: POSIX strings such as
-- 'UTC+3' mean the opposite offset in Postgres and are rejected by the
-- browser, so they fall back on both sides.
CREATE OR REPLACE FUNCTION bookings_private.property_today(p_hotel_id uuid)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_zone text;
BEGIN
  SELECT h.timezone INTO v_zone FROM public.hotels h WHERE h.id = p_hotel_id;
  IF v_zone IS NULL OR v_zone !~ '^[A-Za-z][A-Za-z0-9_]*(/[A-Za-z0-9_+-]+)*$' THEN
    RETURN current_date;
  END IF;
  RETURN (now() AT TIME ZONE v_zone)::date;
EXCEPTION WHEN invalid_parameter_value THEN
  RETURN current_date;
END;
$fn$;

REVOKE ALL ON FUNCTION bookings_private.property_today(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION bookings_private.pick_best_room(
  p_hotel_id uuid,
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
  -- Only stays on rooms of this type, within 30 nights of the stay: a stay
  -- further away cannot change the order, since each gap is capped at 30.
  -- Filtering on the room (not bookings.room_type_id) also covers an assigned
  -- stay whose room_type_id is NULL.
  WITH stays AS (
    SELECT b.room_id, b.check_in, b.check_out
      FROM public.bookings b
      JOIN public.rooms tr
        ON tr.id = b.room_id
       AND tr.hotel_id = p_hotel_id
       AND tr.room_type_id = p_room_type_id
     WHERE b.hotel_id = p_hotel_id
       AND b.status IN ('pending', 'confirmed', 'checked_in')
       AND b.check_in < p_check_out + 30
       AND b.check_out > p_check_in - 30
       AND (p_exclude_booking_id IS NULL OR b.id <> p_exclude_booking_id)
  ),
  property_today AS (
    SELECT bookings_private.property_today(p_hotel_id) AS d
  )
  SELECT r.id
    FROM public.rooms r
   WHERE r.hotel_id = p_hotel_id
     AND r.room_type_id = p_room_type_id
     AND r.is_active IS TRUE
     AND r.status NOT IN ('maintenance', 'out_of_service')
     AND NOT EXISTS (
           SELECT 1 FROM public.availability_blocks ab
            WHERE ab.hotel_id = p_hotel_id
              AND ab.room_id = r.id
              AND ab.start_date < p_check_out
              AND ab.end_date > p_check_in)
     AND NOT EXISTS (
           SELECT 1 FROM stays s
            WHERE s.room_id = r.id
              AND s.check_in < p_check_out
              AND s.check_out > p_check_in)
   ORDER BY
     (p_check_in <= (SELECT d FROM property_today) AND r.status IS DISTINCT FROM 'available'),
     LEAST(30, COALESCE(p_check_in - (SELECT max(s.check_out) FROM stays s
                                       WHERE s.room_id = r.id AND s.check_out <= p_check_in), 30))
       + LEAST(30, COALESCE((SELECT min(s.check_in) FROM stays s
                             WHERE s.room_id = r.id AND s.check_in >= p_check_out) - p_check_out, 30)),
     NULLIF(regexp_replace(r.room_number, '[^0-9]', '', 'g'), '')::numeric NULLS LAST,
     r.room_number,
     r.id
   LIMIT 1
$fn$;

COMMENT ON FUNCTION bookings_private.pick_best_room(uuid, uuid, date, date, uuid) IS
  'Best free room of a type for [check_in, check_out), or NULL. Hard rules: active, in service, unblocked, no overlapping active stay (abandoned holds included). Order: ready rooms first for stays starting today, then tightest fit with neighbouring stays, then numeric room number. Used by create_booking_atomic(assign_room) and pick_best_room_for_booking().';

REVOKE ALL ON FUNCTION bookings_private.pick_best_room(uuid, uuid, date, date, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ── 2. create_booking_atomic: lock first, then pick with the shared rule ─────
CREATE OR REPLACE FUNCTION public.create_booking_atomic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_hotel_id            uuid     := (p_payload->>'hotel_id')::uuid;
  v_room_type_id        uuid     := (p_payload->>'room_type_id')::uuid;
  v_check_in            date     := (p_payload->>'check_in')::date;
  v_check_out           date     := (p_payload->>'check_out')::date;
  v_adults              smallint := COALESCE((p_payload->>'adults')::smallint, 1);
  v_children            smallint := COALESCE((p_payload->>'children')::smallint, 0);
  v_rooms_count         smallint := COALESCE((p_payload->>'rooms_count')::smallint, 1);
  v_rate_plan_id        uuid     := NULLIF(p_payload->>'rate_plan_id', '')::uuid;
  v_occupancy           smallint := COALESCE((p_payload->>'occupancy')::smallint, 0);
  v_status              text     := COALESCE(NULLIF(p_payload->>'status', ''), 'pending');
  v_payment_status      text     := COALESCE(NULLIF(p_payload->>'payment_status', ''), 'unpaid');
  v_source              text     := COALESCE(NULLIF(p_payload->>'source', ''), 'direct');
  v_prefix              text     := COALESCE(NULLIF(p_payload->>'reference_prefix', ''), 'BK');
  v_assign_room         boolean  := COALESCE((p_payload->>'assign_room')::boolean, false);
  v_room_id             uuid     := NULLIF(p_payload->>'room_id', '')::uuid;
  v_guest_id            uuid     := NULLIF(p_payload->>'guest_id', '')::uuid;
  v_guest_name          text     := btrim(COALESCE(p_payload->>'guest_name', ''));
  v_guest_email         text     := lower(btrim(COALESCE(p_payload->>'guest_email', '')));
  v_guest_phone         text     := btrim(COALESCE(p_payload->>'guest_phone', ''));
  v_nationality         text     := NULLIF(btrim(COALESCE(p_payload->>'nationality', '')), '');
  v_special_requests    text     := NULLIF(btrim(COALESCE(p_payload->>'special_requests', '')), '');
  v_internal_notes      text     := NULLIF(btrim(COALESCE(p_payload->>'internal_notes', '')), '');
  v_arrival_text        text     := NULLIF(btrim(COALESCE(p_payload->>'estimated_arrival', '')), '');
  v_created_by          uuid     := NULLIF(p_payload->>'created_by', '')::uuid;
  v_arrival             time;
  v_currency            text;
  v_hotel_currency      text;
  v_settings            jsonb;
  v_tax_bps             integer  := 0;
  v_nights              integer;
  v_night_count         integer;
  v_distinct_date_count integer;
  v_out_of_range_count  integer;
  v_invalid_rate_count  integer;
  v_null_plan_count     integer;
  v_null_currency_count integer;
  v_currency_count      integer;
  v_available           integer;
  v_unit_minor          bigint;
  v_subtotal_minor      bigint;
  v_tax_minor           bigint;
  v_total_minor         bigint;
  v_reference           text;
  v_booking_id          uuid;
  v_guest_created       boolean  := false;
  v_nights_json         jsonb;
  v_resolved_plan_id    uuid;
  v_plan_count          integer;
  v_requested_plan_id   uuid     := v_rate_plan_id;
  v_resolver_guc        text     := current_setting('roomline.rate_resolver', true);
BEGIN
  IF v_hotel_id IS NULL OR v_room_type_id IS NULL
     OR v_check_in IS NULL OR v_check_out IS NULL THEN
    RAISE EXCEPTION 'hotel_id, room_type_id, check_in and check_out are required'
      USING ERRCODE = 'P0001', DETAIL = 'invalid_payload';
  END IF;

  IF v_check_out <= v_check_in THEN
    RAISE EXCEPTION 'check_out must be after check_in'
      USING ERRCODE = 'P0001', DETAIL = 'invalid_date_range';
  END IF;

  IF v_rooms_count < 1 THEN
    RAISE EXCEPTION 'rooms_count must be at least 1'
      USING ERRCODE = 'P0001', DETAIL = 'invalid_rooms_count';
  END IF;

  IF v_guest_name = '' THEN
    RAISE EXCEPTION 'guest_name is required'
      USING ERRCODE = 'P0001', DETAIL = 'invalid_guest_name';
  END IF;

  v_nights := v_check_out - v_check_in;

  SELECT h.settings, public.hotel_currency(h.id)
    INTO v_settings, v_hotel_currency
    FROM public.hotels h
   WHERE h.id = v_hotel_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'hotel % not found', v_hotel_id
      USING ERRCODE = 'P0001', DETAIL = 'hotel_not_found';
  END IF;

  PERFORM 1 FROM public.room_types rt
   WHERE rt.id = v_room_type_id AND rt.hotel_id = v_hotel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'room type % does not belong to hotel %', v_room_type_id, v_hotel_id
      USING ERRCODE = 'P0001', DETAIL = 'room_type_not_found';
  END IF;

  IF v_requested_plan_id IS NOT NULL THEN
    PERFORM 1
      FROM public.rate_plans rp
     WHERE rp.id = v_requested_plan_id
       AND rp.hotel_id = v_hotel_id
       AND rp.room_type_id = v_room_type_id
       AND rp.is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'rate plan % is not valid for room type %',
        v_requested_plan_id, v_room_type_id
        USING ERRCODE = 'P0001', DETAIL = 'rate_plan_not_found';
    END IF;
  END IF;

  IF (v_settings->>'tax_enabled')::boolean IS TRUE
     AND jsonb_typeof(v_settings->'tax_percentage') = 'number' THEN
    v_tax_bps := round((v_settings->>'tax_percentage')::numeric * 100)::integer;
  END IF;

  IF v_arrival_text IS NOT NULL THEN
    BEGIN
      v_arrival := v_arrival_text::time;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'estimated_arrival % is not a time', v_arrival_text
        USING ERRCODE = 'P0001', DETAIL = 'invalid_estimated_arrival';
    END;
  END IF;

  -- Serialise with every other writer of this room type before reading
  -- availability or choosing a room. The inventory and physical-room guards
  -- take the same lock at INSERT; taking it here as well means two bookings
  -- racing for the last free room cannot both choose it: the second waits,
  -- then sees the first. Re-entrant, so the group writer (which already holds
  -- it) is unaffected. Lock order is type, then guest row, the same order the
  -- booking triggers (type lock BEFORE, guest statistics AFTER) already use.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_hotel_id::text || ':' || v_room_type_id::text, 0)
  );

  v_available := public.room_type_available_count(v_room_type_id, v_check_in, v_check_out);
  IF v_available < v_rooms_count THEN
    RAISE EXCEPTION 'only % room(s) of that type are available', v_available
      USING ERRCODE = 'P0001',
            DETAIL  = 'no_availability',
            HINT    = v_available::text;
  END IF;

  IF v_room_id IS NOT NULL THEN
    PERFORM 1 FROM public.rooms r
     WHERE r.id = v_room_id
       AND r.hotel_id = v_hotel_id
       AND r.room_type_id = v_room_type_id
       AND r.is_active = true
       AND r.status NOT IN ('maintenance', 'out_of_service');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'room % is not a bookable room of that type', v_room_id
        USING ERRCODE = 'P0001', DETAIL = 'room_not_bookable';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.availability_blocks ab
       WHERE ab.hotel_id = v_hotel_id
         AND ab.room_id = v_room_id
         AND ab.start_date < v_check_out
         AND ab.end_date > v_check_in
    ) THEN
      RAISE EXCEPTION 'room % is blocked for those dates', v_room_id
        USING ERRCODE = 'P0001', DETAIL = 'room_not_bookable';
    END IF;

    -- Abandoned holds count here too: bookings_no_room_overlap counts them
    -- until they are swept, so ignoring them only turned a named
    -- room_conflict into a bare overlap violation at INSERT.
    DECLARE
      v_conflict text;
    BEGIN
      SELECT COALESCE(g.full_name, b.reference)
        INTO v_conflict
        FROM public.bookings b
        LEFT JOIN public.guests g ON g.id = b.guest_id
       WHERE b.room_id = v_room_id
         AND b.hotel_id = v_hotel_id
         AND b.status IN ('pending', 'confirmed', 'checked_in')
         AND b.check_in < v_check_out
         AND b.check_out > v_check_in
       LIMIT 1;
      IF v_conflict IS NOT NULL THEN
        RAISE EXCEPTION 'room % is occupied for those dates', v_room_id
          USING ERRCODE = 'P0001', DETAIL = 'room_conflict', HINT = v_conflict;
      END IF;
    END;
  ELSIF v_assign_room THEN
    -- The best free room of the type (bookings_private.pick_best_room). NULL
    -- when no single room is free for the whole stay: the reservation is
    -- still valid, and the calendar shows it in the unassigned tray.
    v_room_id := bookings_private.pick_best_room(
      v_hotel_id, v_room_type_id, v_check_in, v_check_out);
  END IF;

  -- Owner-session test seam uses %I.%I over the strictly allowlisted GUC so
  -- plpgsql_check does not statically probe pg_temp outside a test transaction.
  IF session_user = current_user
     AND v_resolver_guc = 'pg_temp.malformed_nightly_rates' THEN
    EXECUTE format(
      'SELECT jsonb_agg(jsonb_build_object(
         ''stay_date'', r.stay_date,
         ''rate_minor'', r.rate_minor,
         ''currency'', r.currency,
         ''rate_plan_id'', r.rate_plan_id,
         ''occupancy'', r.occupancy,
         ''source'', r.source,
         ''seasonal_rate_id'', r.seasonal_rate_id,
         ''season_name'', r.season_name,
         ''is_weekend'', r.is_weekend) ORDER BY r.stay_date)
       FROM %I.%I($1, $2, $3, $4, $5, $6) r',
      split_part(v_resolver_guc, '.', 1),
      split_part(v_resolver_guc, '.', 2)
    )
      INTO v_nights_json
      USING v_hotel_id, ARRAY[v_room_type_id], v_check_in, v_check_out,
            v_rate_plan_id, v_occupancy;
  ELSE
    SELECT jsonb_agg(
             jsonb_build_object(
               'stay_date',        r.stay_date,
               'rate_minor',       r.rate_minor,
               'currency',         r.currency,
               'rate_plan_id',     r.rate_plan_id,
               'occupancy',        r.occupancy,
               'source',           r.source,
               'seasonal_rate_id', r.seasonal_rate_id,
               'season_name',      r.season_name,
               'is_weekend',       r.is_weekend)
             ORDER BY r.stay_date)
      INTO v_nights_json
      FROM public.resolve_nightly_rates(
             v_hotel_id, ARRAY[v_room_type_id], v_check_in, v_check_out,
             v_rate_plan_id, v_occupancy) r;
  END IF;

  SELECT count(*)::integer,
         count(DISTINCT (n->>'stay_date')::date)::integer,
         count(*) FILTER (
           WHERE (n->>'stay_date')::date < v_check_in
              OR (n->>'stay_date')::date >= v_check_out)::integer,
         count(*) FILTER (
           WHERE (n->>'rate_minor') IS NULL
              OR (n->>'rate_minor')::bigint <= 0)::integer,
         count(*) FILTER (WHERE (n->>'rate_plan_id') IS NULL)::integer,
         count(*) FILTER (WHERE (n->>'currency') IS NULL)::integer,
         count(DISTINCT n->>'currency')::integer,
         COALESCE(sum((n->>'rate_minor')::bigint), 0),
         min(n->>'currency'),
         (array_agg(DISTINCT (n->>'rate_plan_id')::uuid))[1],
         count(DISTINCT (n->>'rate_plan_id')::uuid)::integer
    INTO v_night_count, v_distinct_date_count, v_out_of_range_count,
         v_invalid_rate_count, v_null_plan_count, v_null_currency_count,
         v_currency_count, v_unit_minor, v_currency,
         v_resolved_plan_id, v_plan_count
    FROM jsonb_array_elements(COALESCE(v_nights_json, '[]'::jsonb)) n;

  IF v_night_count <> v_nights
     OR v_distinct_date_count <> v_nights
     OR v_out_of_range_count <> 0
     OR v_invalid_rate_count <> 0
     OR v_null_plan_count <> 0
     OR v_null_currency_count <> 0
     OR v_currency_count <> 1
     OR v_currency IS DISTINCT FROM v_hotel_currency
     OR v_plan_count <> 1 OR v_resolved_plan_id IS NULL THEN
    RAISE EXCEPTION 'room type % has no consistent usable rate for % night(s) from %',
      v_room_type_id, v_nights, v_check_in
      USING ERRCODE = 'P0001', DETAIL = 'unpriced_stay';
  END IF;

  v_rate_plan_id := v_resolved_plan_id;

  IF v_requested_plan_id IS NOT NULL
     AND v_rate_plan_id IS DISTINCT FROM v_requested_plan_id THEN
    RAISE EXCEPTION 'rate plan % is not valid for room type %',
      v_requested_plan_id, v_room_type_id
      USING ERRCODE = 'P0001', DETAIL = 'rate_plan_not_found';
  END IF;

  v_subtotal_minor := v_unit_minor * v_rooms_count;
  v_tax_minor      := round(v_subtotal_minor::numeric * v_tax_bps / 10000);
  v_total_minor    := v_subtotal_minor + v_tax_minor;

  IF v_guest_id IS NOT NULL THEN
    PERFORM 1 FROM public.guests g
     WHERE g.id = v_guest_id AND g.hotel_id = v_hotel_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'guest % does not belong to hotel %', v_guest_id, v_hotel_id
        USING ERRCODE = 'P0001', DETAIL = 'guest_not_found';
    END IF;
  ELSE
    IF v_guest_email <> '' THEN
      SELECT g.id INTO v_guest_id
        FROM public.guests g
       WHERE g.hotel_id = v_hotel_id AND lower(g.email) = v_guest_email
       LIMIT 1;
    END IF;

    IF v_guest_id IS NULL AND v_guest_phone <> '' THEN
      SELECT g.id INTO v_guest_id
        FROM public.guests g
       WHERE g.hotel_id = v_hotel_id AND g.phone = v_guest_phone
       LIMIT 1;
    END IF;

    IF v_guest_id IS NULL THEN
      INSERT INTO public.guests (hotel_id, full_name, email, phone, nationality)
      VALUES (v_hotel_id, v_guest_name,
              NULLIF(v_guest_email, ''), NULLIF(v_guest_phone, ''), v_nationality)
      RETURNING id INTO v_guest_id;
      v_guest_created := true;
    END IF;
  END IF;

  IF NOT v_guest_created AND v_nationality IS NOT NULL THEN
    UPDATE public.guests
       SET nationality = v_nationality, updated_at = now()
     WHERE id = v_guest_id AND nationality IS DISTINCT FROM v_nationality;
  END IF;

  v_reference := public.generate_booking_reference(v_hotel_id, v_prefix);

  INSERT INTO public.bookings (
    hotel_id, reference, guest_id, room_id, room_type_id, rate_plan_id,
    check_in, check_out, adults, children, rooms_count,
    room_rate, subtotal, tax_amount, total_amount, currency,
    status, payment_status, payment_preference, source,
    special_requests, internal_notes, estimated_arrival, created_by
  ) VALUES (
    v_hotel_id, v_reference, v_guest_id, v_room_id, v_room_type_id, v_rate_plan_id,
    v_check_in, v_check_out, v_adults, v_children, v_rooms_count,
    public.from_minor(round(v_unit_minor::numeric / v_night_count)::bigint, v_currency),
    public.from_minor(v_subtotal_minor, v_currency),
    public.from_minor(v_tax_minor, v_currency),
    public.from_minor(v_total_minor, v_currency),
    v_currency,
    v_status, v_payment_status,
    COALESCE(NULLIF(p_payload->>'payment_preference', ''), 'pay_at_checkin'),
    v_source,
    v_special_requests, v_internal_notes, v_arrival, v_created_by
  )
  RETURNING id INTO v_booking_id;

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

  RETURN jsonb_build_object(
    'booking_id',     v_booking_id,
    'reference',      v_reference,
    'guest_id',       v_guest_id,
    'guest_created',  v_guest_created,
    'room_id',        v_room_id,
    'rate_plan_id',   v_rate_plan_id,
    'currency',       v_currency,
    'night_count',    v_night_count,
    'room_rate',      public.from_minor(round(v_unit_minor::numeric / v_night_count)::bigint, v_currency),
    'subtotal',       public.from_minor(v_subtotal_minor, v_currency),
    'tax_amount',     public.from_minor(v_tax_minor, v_currency),
    'total_amount',   public.from_minor(v_total_minor, v_currency),
    'subtotal_minor', v_subtotal_minor,
    'tax_minor',      v_tax_minor,
    'total_minor',    v_total_minor,
    'nights',         v_nights_json
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_booking_atomic(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_atomic(jsonb) TO service_role;

-- ── 3. Expired holds give their room back ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_stale_payment_holds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $function$
DECLARE
  affected integer;
BEGIN
  UPDATE public.bookings
     SET status = 'cancelled',
         cancelled_at = now(),
         cancellation_reason = 'payment_timeout',
         room_id = NULL,
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
  'Cancels guest-initiated online bookings left unpaid for over 30 minutes, releasing their inventory and their room. Scheduled via pg_cron every 5 minutes.';

REVOKE ALL ON FUNCTION public.expire_stale_payment_holds() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_payment_holds() TO service_role;

-- ── 4. Best room for an existing unassigned stay (calendar "Assign") ─────────
-- The calendar only loads the visible dates, so it cannot see neighbouring
-- or overlapping stays outside them. The server action asks here instead and
-- then assigns through its usual checks. NULL when no single room is free,
-- the booking is not open, or it does not belong to the hotel.
CREATE OR REPLACE FUNCTION public.pick_best_room_for_booking(
  p_hotel_id uuid,
  p_booking_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
  SELECT bookings_private.pick_best_room(
           b.hotel_id, b.room_type_id, b.check_in, b.check_out, b.id)
    FROM public.bookings b
   WHERE b.id = p_booking_id
     AND b.hotel_id = p_hotel_id
     AND b.room_type_id IS NOT NULL
     AND b.status IN ('pending', 'confirmed', 'checked_in')
$fn$;

COMMENT ON FUNCTION public.pick_best_room_for_booking(uuid, uuid) IS
  'Best free room (bookings_private.pick_best_room) for an open booking of the hotel, excluding the booking itself, or NULL. Service role only; the caller assigns it.';

REVOKE ALL ON FUNCTION public.pick_best_room_for_booking(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pick_best_room_for_booking(uuid, uuid) TO service_role;

-- ── 5. Blocks respect abandoned holds until they are swept ──────────────────
-- Same body as 20261112063939 minus the abandoned-hold exemption. Such a hold
-- keeps its room until expire_stale_payment_holds() runs, and a late payment
-- in that window confirms it in place, so a block over it would leave a paid
-- stay on a blocked room.
CREATE OR REPLACE FUNCTION public.assert_availability_block_no_booking_conflict()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_room_type_id uuid;
  v_conflict_ref text;
BEGIN
  SELECT r.room_type_id INTO v_room_type_id
    FROM public.rooms r
   WHERE r.id = NEW.room_id
     AND r.hotel_id = NEW.hotel_id;

  IF v_room_type_id IS NULL THEN
    RAISE EXCEPTION 'Room % does not belong to hotel %', NEW.room_id, NEW.hotel_id
      USING ERRCODE = '23503';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.hotel_id::text || ':' || v_room_type_id::text, 0)
  );

  SELECT b.reference INTO v_conflict_ref
    FROM public.bookings b
   WHERE b.hotel_id = NEW.hotel_id
     AND b.room_id = NEW.room_id
     AND b.status IN ('pending', 'confirmed', 'checked_in')
     AND b.check_in < NEW.end_date
     AND b.check_out > NEW.start_date
   ORDER BY b.check_in
   LIMIT 1;

  IF v_conflict_ref IS NOT NULL THEN
    RAISE EXCEPTION 'Room % has active booking % overlapping [% to %)',
      NEW.room_id, v_conflict_ref, NEW.start_date, NEW.end_date
      USING ERRCODE = '23P01',
            CONSTRAINT = 'availability_blocks_no_booking_overlap',
            DETAIL = 'room_conflict',
            HINT = v_conflict_ref;
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.assert_availability_block_no_booking_conflict() IS
  'BEFORE INSERT/UPDATE guard on availability_blocks: serializes on (hotel_id, room_type_id) with assert_room_type_inventory() and refuses blocks overlapping an active assigned reservation, abandoned payment holds included until they are swept.';

REVOKE ALL ON FUNCTION public.assert_availability_block_no_booking_conflict() FROM PUBLIC, anon, authenticated;

COMMIT;
