-- =============================================================================
-- One transaction per reservation.
--
-- Until now a reservation was assembled by four or five round trips from the
-- application: find-or-create the guest, mint a reference, resolve the nightly
-- rates, insert the booking, and (since booking_nights landed) insert the
-- nights. Every gap between those calls is a window in which the process can
-- die and leave a half-built reservation behind — an orphan guest with no
-- booking, or worse, a booking whose stored total was computed from rates that
-- changed between the quote and the insert.
--
-- create_booking_atomic() collapses that sequence into a single statement. The
-- rates are resolved once and the same resolved rows are used for both the
-- money on public.bookings and the audit trail in public.booking_nights, so the
-- quote and the persisted rate are equal by construction rather than by
-- convention. Availability is still enforced by the existing
-- bookings_room_type_inventory_guard trigger, which fires on the insert inside
-- this transaction and takes its advisory lock there; SQLSTATE 23P01 is allowed
-- to propagate untouched so both call sites keep their 409 translation.
--
-- Paystack initialisation deliberately stays OUTSIDE this function. It is a
-- network call and must never be made while holding a row lock. When it fails,
-- the caller calls abort_unpaid_booking() to undo the hold in one transaction.
--
-- Failure channel: every rejection raises. Nothing is returned on the unhappy
-- path, so there is no way for this function to commit a partial reservation.
-- Policy rejections use SQLSTATE P0001 with a stable machine code in DETAIL and
-- guest-facing copy left to the caller; integrity rejections keep their native
-- SQLSTATE (23P01 inventory, 22007 bad time, 23503 bad foreign key).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Minor units back to major units.
--
--    to_minor() has existed since the rate_plans migration; its inverse has
--    only ever existed in TypeScript (fromMinor in lib/money.ts). Every SQL
--    caller has had to write the division by hand, which is how a hard-coded
--    /100 ends up in a codebase that also sells in a zero-decimal currency.
--
--    public.bookings stores money as numeric(10,2) major units, so the
--    conversion is needed on the way in. Rounding to the currency's own
--    exponent keeps a 0-decimal currency free of phantom fractions.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.from_minor(p_minor bigint, p_currency text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $fn$
  SELECT round(
           p_minor::numeric / (10::numeric ^ public.currency_exponent(p_currency)),
           public.currency_exponent(p_currency)
         );
$fn$;

COMMENT ON FUNCTION public.from_minor(bigint, text) IS
  'Minor currency units to major, rounded to the currency exponent. Exact inverse of public.to_minor() and the SQL twin of fromMinor() in lib/money.ts.';

REVOKE ALL ON FUNCTION public.from_minor(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.from_minor(bigint, text)
  TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. The reservation writer.
--
--    p_payload is the union of what the two call sites know. The public funnel
--    (app/api/booking/[slug]/bookings/route.ts) sends rooms_count and a hold
--    status and never assigns a room; the staff action (app/actions/bookings.ts)
--    sends guest_id/room_id/internal_notes/created_by and asks for a room to be
--    assigned. Keys absent from a payload fall back to the value the schema
--    already defaults to, so neither caller has to send the other's fields.
--
--    Order matters: everything that can be rejected is checked before the first
--    write, so a rejection cannot leave an orphan guest behind the way the
--    application-side sequence could.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking_atomic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_hotel_id          uuid     := (p_payload->>'hotel_id')::uuid;
  v_room_type_id      uuid     := (p_payload->>'room_type_id')::uuid;
  v_check_in          date     := (p_payload->>'check_in')::date;
  v_check_out         date     := (p_payload->>'check_out')::date;
  v_adults            smallint := COALESCE((p_payload->>'adults')::smallint, 1);
  v_children          smallint := COALESCE((p_payload->>'children')::smallint, 0);
  v_rooms_count       smallint := COALESCE((p_payload->>'rooms_count')::smallint, 1);
  v_rate_plan_id      uuid     := NULLIF(p_payload->>'rate_plan_id', '')::uuid;
  v_occupancy         smallint := COALESCE((p_payload->>'occupancy')::smallint, 0);
  v_status            text     := COALESCE(NULLIF(p_payload->>'status', ''), 'pending');
  v_payment_status    text     := COALESCE(NULLIF(p_payload->>'payment_status', ''), 'unpaid');
  v_source            text     := COALESCE(NULLIF(p_payload->>'source', ''), 'direct');
  v_prefix            text     := COALESCE(NULLIF(p_payload->>'reference_prefix', ''), 'BK');
  v_assign_room       boolean  := COALESCE((p_payload->>'assign_room')::boolean, false);
  v_room_id           uuid     := NULLIF(p_payload->>'room_id', '')::uuid;
  v_guest_id          uuid     := NULLIF(p_payload->>'guest_id', '')::uuid;
  v_guest_name        text     := btrim(COALESCE(p_payload->>'guest_name', ''));
  v_guest_email       text     := lower(btrim(COALESCE(p_payload->>'guest_email', '')));
  v_guest_phone       text     := btrim(COALESCE(p_payload->>'guest_phone', ''));
  v_nationality       text     := NULLIF(btrim(COALESCE(p_payload->>'nationality', '')), '');
  v_special_requests  text     := NULLIF(btrim(COALESCE(p_payload->>'special_requests', '')), '');
  v_internal_notes    text     := NULLIF(btrim(COALESCE(p_payload->>'internal_notes', '')), '');
  v_arrival_text      text     := NULLIF(btrim(COALESCE(p_payload->>'estimated_arrival', '')), '');
  v_created_by        uuid     := NULLIF(p_payload->>'created_by', '')::uuid;
  v_arrival           time;
  v_currency          text;
  v_settings          jsonb;
  v_tax_bps           integer  := 0;
  v_nights            integer;
  v_night_count       integer;
  v_available         integer;
  v_min_rate          bigint;
  v_unit_minor        bigint;
  v_subtotal_minor    bigint;
  v_tax_minor         bigint;
  v_total_minor       bigint;
  v_reference         text;
  v_booking_id        uuid;
  v_guest_created     boolean  := false;
  v_nights_json       jsonb;
BEGIN
  -- === Validation. Nothing below here writes until the guest block. ==========
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
    INTO v_settings, v_currency
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

  -- Tax mirrors the application check exactly: it applies only when
  -- settings.tax_enabled is boolean true AND settings.tax_percentage is a JSON
  -- number. A percentage stored as a string is treated as absent, which is what
  -- the TypeScript typeof check already did — matching the bug-for-bug
  -- behaviour here is the point, because the two must never disagree.
  IF (v_settings->>'tax_enabled')::boolean IS TRUE
     AND jsonb_typeof(v_settings->'tax_percentage') = 'number' THEN
    v_tax_bps := round((v_settings->>'tax_percentage')::numeric * 100)::integer;
  END IF;

  -- bookings.estimated_arrival is a time column and both call sites pass a free
  -- text field straight into it. Catching the cast here turns an unhandled
  -- 22007 from deep inside the insert into a named rejection.
  IF v_arrival_text IS NOT NULL THEN
    BEGIN
      v_arrival := v_arrival_text::time;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'estimated_arrival % is not a time', v_arrival_text
        USING ERRCODE = 'P0001', DETAIL = 'invalid_estimated_arrival';
    END;
  END IF;

  -- Advisory availability check. The authoritative gate is the
  -- bookings_room_type_inventory_guard trigger on the insert below, which takes
  -- an advisory lock and therefore cannot be raced; this one exists only so the
  -- common "sold out" case gets a message carrying the remaining count instead
  -- of a bare constraint violation.
  v_available := public.room_type_available_count(v_room_type_id, v_check_in, v_check_out);
  IF v_available < v_rooms_count THEN
    RAISE EXCEPTION 'only % room(s) of that type are available', v_available
      USING ERRCODE = 'P0001',
            DETAIL  = 'no_availability',
            HINT    = v_available::text;
  END IF;

  -- Room assignment. Only the staff path assigns a physical room; the public
  -- funnel leaves room_id null and lets the front desk allocate at check-in.
  IF v_room_id IS NOT NULL THEN
    PERFORM 1 FROM public.rooms r
     WHERE r.id = v_room_id
       AND r.hotel_id = v_hotel_id
       AND r.room_type_id = v_room_type_id
       AND r.status NOT IN ('maintenance', 'out_of_service');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'room % is not a bookable room of that type', v_room_id
        USING ERRCODE = 'P0001', DETAIL = 'room_not_bookable';
    END IF;

    -- Name the occupant in HINT so the caller can keep its specific copy.
    DECLARE
      v_conflict text;
    BEGIN
      SELECT COALESCE(g.full_name, b.reference)
        INTO v_conflict
        FROM public.bookings b
        LEFT JOIN public.guests g ON g.id = b.guest_id
       WHERE b.room_id = v_room_id
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
    SELECT r.id INTO v_room_id
      FROM public.rooms r
     WHERE r.hotel_id = v_hotel_id
       AND r.room_type_id = v_room_type_id
       AND r.status NOT IN ('maintenance', 'out_of_service')
       AND NOT EXISTS (
             SELECT 1 FROM public.bookings b
              WHERE b.room_id = r.id
                AND b.status IN ('pending', 'confirmed', 'checked_in')
                AND b.check_in < v_check_out
                AND b.check_out > v_check_in)
     ORDER BY r.room_number
     LIMIT 1;
    -- No free room is not fatal: the reservation is still valid against the
    -- room type's inventory and the desk can allocate later, exactly as the
    -- public funnel's bookings always do.
  END IF;

  -- === Pricing. Resolved once; the same rows feed the money and the nights. ===
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

  SELECT count(*)::integer,
         COALESCE(sum((n->>'rate_minor')::bigint), 0),
         min((n->>'rate_minor')::bigint),
         min(n->>'currency')
    INTO v_night_count, v_unit_minor, v_min_rate, v_currency
    FROM jsonb_array_elements(COALESCE(v_nights_json, '[]'::jsonb)) n;

  -- A stay that is not fully priced must not become a booking. resolve_nightly_
  -- rates generates one row per night from the date series, so a short count or
  -- a zero rate means a room type with no base price rather than a gap in the
  -- series — either way the reservation would carry a total nobody can defend.
  IF v_night_count <> v_nights OR COALESCE(v_min_rate, 0) <= 0 THEN
    RAISE EXCEPTION 'room type % has no usable rate for % night(s) from %',
      v_room_type_id, v_nights, v_check_in
      USING ERRCODE = 'P0001', DETAIL = 'unpriced_stay';
  END IF;

  v_subtotal_minor := v_unit_minor * v_rooms_count;
  v_tax_minor      := round(v_subtotal_minor::numeric * v_tax_bps / 10000);
  v_total_minor    := v_subtotal_minor + v_tax_minor;

  -- === First write. Everything above this line rejects without side effects. ==
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

  -- A returning guest who has since told us their nationality.
  IF NOT v_guest_created AND v_nationality IS NOT NULL THEN
    UPDATE public.guests
       SET nationality = v_nationality, updated_at = now()
     WHERE id = v_guest_id AND nationality IS DISTINCT FROM v_nationality;
  END IF;

  v_reference := public.generate_booking_reference(v_hotel_id, v_prefix);

  -- nights and outstanding_balance are GENERATED ALWAYS columns and must never
  -- appear in an insert list.
  INSERT INTO public.bookings (
    hotel_id, reference, guest_id, room_id, room_type_id,
    check_in, check_out, adults, children, rooms_count,
    room_rate, subtotal, tax_amount, total_amount, currency,
    status, payment_status, payment_preference, source,
    special_requests, internal_notes, estimated_arrival, created_by
  ) VALUES (
    v_hotel_id, v_reference, v_guest_id, v_room_id, v_room_type_id,
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

  -- The audit trail, from the identical rows the money was computed from.
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

COMMENT ON FUNCTION public.create_booking_atomic(jsonb) IS
  'Creates a reservation in one transaction: guest resolve/insert, reference, rate resolution, bookings insert (inventory guard fires here) and booking_nights insert. Rejections raise — P0001 with a machine code in DETAIL for policy, native SQLSTATE for integrity. Returns the booking, the money in both major and minor units, and the resolved nights.';

REVOKE ALL ON FUNCTION public.create_booking_atomic(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_atomic(jsonb) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Undoing a payment hold.
--
--    When Paystack initialisation fails after the hold was written, the caller
--    must remove the hold. Today it deletes the booking only, which leaves the
--    guest row it had just created behind — a slow leak of contactless guest
--    records that also inflates the guest directory the front desk searches.
--
--    This removes the booking, its nights (by cascade), and the guest if and
--    only if that guest has no other booking and no stay history. It is
--    idempotent: aborting an already-aborted booking is a no-op, so a retrying
--    caller cannot turn a cleanup into an error.
--
--    It refuses to touch a booking that has taken money. A paid booking is a
--    refund problem, not a delete problem.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.abort_unpaid_booking(
  p_booking_id uuid,
  p_reason     text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_before        jsonb;
  v_hotel_id      uuid;
  v_guest_id      uuid;
  v_amount_paid   numeric;
  v_nights        integer;
  v_guest_deleted boolean := false;
BEGIN
  SELECT to_jsonb(b), b.hotel_id, b.guest_id, COALESCE(b.amount_paid, 0)
    INTO v_before, v_hotel_id, v_guest_id, v_amount_paid
    FROM public.bookings b
   WHERE b.id = p_booking_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_amount_paid > 0 THEN
    RAISE EXCEPTION 'booking % has been paid and cannot be aborted', p_booking_id
      USING ERRCODE = 'P0001', DETAIL = 'booking_paid';
  END IF;

  SELECT count(*)::integer INTO v_nights
    FROM public.booking_nights bn WHERE bn.booking_id = p_booking_id;

  DELETE FROM public.bookings WHERE id = p_booking_id;

  IF v_guest_id IS NOT NULL THEN
    DELETE FROM public.guests g
     WHERE g.id = v_guest_id
       AND COALESCE(g.total_stays, 0) = 0
       AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.guest_id = g.id);
    v_guest_deleted := FOUND;
  END IF;

  INSERT INTO public.audit_logs (
    hotel_id, staff_id, staff_name, action, entity_type, entity_id,
    before_state, after_state
  ) VALUES (
    v_hotel_id, NULL, 'system', 'booking.aborted_unpaid', 'booking', p_booking_id,
    v_before,
    jsonb_build_object('reason', p_reason,
                       'nights_deleted', v_nights,
                       'guest_deleted', v_guest_deleted)
  );
END;
$fn$;

COMMENT ON FUNCTION public.abort_unpaid_booking(uuid, text) IS
  'Removes an unpaid payment hold in one transaction: the booking, its nights by cascade, and the guest if that guest has no other booking and no stay history. Writes a booking.aborted_unpaid audit row. Idempotent; refuses a booking with amount_paid > 0 (P0001 / booking_paid).';

REVOKE ALL ON FUNCTION public.abort_unpaid_booking(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abort_unpaid_booking(uuid, text) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Guard. A migration that silently half-applies is worse than one that
--    fails, so the shape this code depends on is asserted here rather than
--    discovered in production.
-- -----------------------------------------------------------------------------
DO $guard$
DECLARE
  v_sig  text;
  v_prov "char";
  v_sec  boolean;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.create_booking_atomic(jsonb)',
    'public.abort_unpaid_booking(uuid, text)'
  ] LOOP
    SELECT p.provolatile, p.prosecdef INTO v_prov, v_sec
      FROM pg_proc p WHERE p.oid = v_sig::regprocedure;

    IF v_prov <> 'v' THEN
      RAISE EXCEPTION '% must be VOLATILE, found %', v_sig, v_prov;
    END IF;
    IF NOT v_sec THEN
      RAISE EXCEPTION '% must be SECURITY DEFINER', v_sig;
    END IF;
    IF has_function_privilege('anon', v_sig::regprocedure, 'EXECUTE')
       OR has_function_privilege('authenticated', v_sig::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION '% must not be callable by anon or authenticated', v_sig;
    END IF;
    IF NOT has_function_privilege('service_role', v_sig::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION '% must be callable by service_role', v_sig;
    END IF;
  END LOOP;

  SELECT p.provolatile INTO v_prov
    FROM pg_proc p WHERE p.oid = 'public.from_minor(bigint, text)'::regprocedure;
  IF v_prov <> 'i' THEN
    RAISE EXCEPTION 'from_minor must be IMMUTABLE, found %', v_prov;
  END IF;

  -- from_minor is only trustworthy if it is the exact inverse of to_minor across
  -- the exponent range: 2-decimal, 0-decimal and 3-decimal currencies.
  IF public.from_minor(public.to_minor(1234.56, 'GHS'), 'GHS') <> 1234.56
     OR public.from_minor(public.to_minor(1234, 'JPY'), 'JPY') <> 1234
     OR public.from_minor(public.to_minor(1.234, 'KWD'), 'KWD') <> 1.234 THEN
    RAISE EXCEPTION 'from_minor is not the inverse of to_minor';
  END IF;

  -- The tax arithmetic must equal applyBps(minor, percentToBps(pct)) from
  -- lib/money.ts. 12.5% of 1000.00 GHS is 125.00, and the half-away-from-zero
  -- tie at 0.005 must round up, not to even.
  IF round(100000::numeric * round(12.5 * 100)::integer / 10000) <> 12500
     OR round(1::numeric * 5000 / 10000) <> 1 THEN
    RAISE EXCEPTION 'tax arithmetic does not match applyBps/percentToBps';
  END IF;
END;
$guard$;
