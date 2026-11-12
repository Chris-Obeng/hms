-- =============================================================================
-- Relocate extensions out of `public`, enforce bidirectional physical room vs
-- availability_blocks conflict symmetry (including direct bookings.room_id
-- updates and overlapping blocks), revoke client EXECUTE on trigger functions,
-- and resolve all `supabase db lint` (`plpgsql_check`) errors and warnings.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- ── 1. Relocate pg_trgm and btree_gist from `public` to `extensions` ──────────
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO PUBLIC, anon, authenticated, service_role;

DO $ext$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_trgm' AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'btree_gist' AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION btree_gist SET SCHEMA extensions;
  END IF;
END
$ext$;

SET LOCAL search_path = pg_catalog, public, extensions;

-- ── 2. Tighten bookings date (> 0 nights) and ISO currency constraints ────────
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_dates_valid,
  DROP CONSTRAINT IF EXISTS bookings_currency_format;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_dates_valid
    CHECK (check_out > check_in) NOT VALID,
  ADD CONSTRAINT bookings_currency_format
    CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$') NOT VALID;

ALTER TABLE public.bookings VALIDATE CONSTRAINT bookings_dates_valid;
ALTER TABLE public.bookings VALIDATE CONSTRAINT bookings_currency_format;

-- ── 3. Prevent overlapping availability_blocks on the same physical room ──────
DO $block_excl$
BEGIN
  ALTER TABLE public.availability_blocks
    ADD CONSTRAINT availability_blocks_no_overlap
      EXCLUDE USING gist (
        room_id WITH =,
        daterange(start_date, end_date, '[)') WITH &&
      );
EXCEPTION WHEN duplicate_object OR duplicate_table THEN
  NULL;
END
$block_excl$;

-- ── 4. Guard availability_blocks against active assigned bookings & races ─────
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
     AND NOT (
           b.status = 'pending'
       AND b.payment_status = 'unpaid'
       AND b.payment_preference = 'pay_now'
       AND b.source = 'direct'
       AND b.created_at < now() - interval '30 minutes'
     )
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
  'BEFORE INSERT/UPDATE guard on availability_blocks: serializes on (hotel_id, room_type_id) with assert_room_type_inventory() and refuses blocks overlapping an active assigned reservation.';

DROP TRIGGER IF EXISTS trg_availability_blocks_booking_conflict ON public.availability_blocks;
CREATE TRIGGER trg_availability_blocks_booking_conflict
  BEFORE INSERT OR UPDATE OF hotel_id, room_id, start_date, end_date
  ON public.availability_blocks
  FOR EACH ROW EXECUTE FUNCTION public.assert_availability_block_no_booking_conflict();

-- ── 5. Guard direct bookings.room_id assignments against wrong type & blocks ──
CREATE OR REPLACE FUNCTION public.assert_booking_physical_room_valid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_actual_type_id uuid;
  v_is_active      boolean;
  v_room_status    text;
  v_check_window   boolean := false;
BEGIN
  IF NEW.room_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT r.room_type_id, r.is_active, r.status
    INTO v_actual_type_id, v_is_active, v_room_status
    FROM public.rooms r
   WHERE r.id = NEW.room_id
     AND r.hotel_id = NEW.hotel_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room % does not belong to hotel %', NEW.room_id, NEW.hotel_id
      USING ERRCODE = '23503';
  END IF;

  IF NEW.room_type_id IS NOT NULL AND v_actual_type_id IS DISTINCT FROM NEW.room_type_id THEN
    RAISE EXCEPTION 'Room % belongs to room type %, not %',
      NEW.room_id, v_actual_type_id, NEW.room_type_id
      USING ERRCODE = '23514',
            CONSTRAINT = 'bookings_physical_room_type_match',
            DETAIL = 'room_type_mismatch';
  END IF;

  IF COALESCE(NEW.status, 'pending') NOT IN ('pending', 'confirmed', 'checked_in') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_check_window := true;
  ELSE
    v_check_window := NEW.room_id IS DISTINCT FROM OLD.room_id
      OR NEW.check_in IS DISTINCT FROM OLD.check_in
      OR NEW.check_out IS DISTINCT FROM OLD.check_out
      OR COALESCE(OLD.status, 'pending') NOT IN ('pending', 'confirmed', 'checked_in');
  END IF;

  IF v_check_window THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(NEW.hotel_id::text || ':' || v_actual_type_id::text, 0)
    );

    IF v_is_active IS NOT TRUE OR v_room_status IN ('maintenance', 'out_of_service') THEN
      RAISE EXCEPTION 'Room % is inactive or out of service', NEW.room_id
        USING ERRCODE = '23P01',
              CONSTRAINT = 'bookings_physical_room_bookable',
              DETAIL = 'room_not_bookable';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.availability_blocks ab
       WHERE ab.hotel_id = NEW.hotel_id
         AND ab.room_id = NEW.room_id
         AND ab.start_date < NEW.check_out
         AND ab.end_date > NEW.check_in
    ) THEN
      RAISE EXCEPTION 'Room % has an overlapping availability block for [% to %)',
        NEW.room_id, NEW.check_in, NEW.check_out
        USING ERRCODE = '23P01',
              CONSTRAINT = 'bookings_no_availability_block_overlap',
              DETAIL = 'room_not_bookable';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.assert_booking_physical_room_valid() IS
  'BEFORE INSERT/UPDATE guard on bookings: enforces physical room_type_id match and blocks assigning/moving an active stay onto an inactive, maintenance/OOS, or availability-blocked room.';

DROP TRIGGER IF EXISTS trg_bookings_physical_room_guard ON public.bookings;
CREATE TRIGGER trg_bookings_physical_room_guard
  BEFORE INSERT OR UPDATE OF hotel_id, room_id, room_type_id, check_in, check_out, status
  ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.assert_booking_physical_room_valid();

-- ── 6. Update create_booking_atomic: block symmetry + zero-error plpgsql_check
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
         AND NOT (
               b.status = 'pending'
           AND b.payment_status = 'unpaid'
           AND b.payment_preference = 'pay_now'
           AND b.source = 'direct'
           AND b.created_at < now() - interval '30 minutes'
         )
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
       AND r.is_active = true
       AND r.status NOT IN ('maintenance', 'out_of_service')
       AND NOT EXISTS (
             SELECT 1 FROM public.availability_blocks ab
              WHERE ab.hotel_id = v_hotel_id
                AND ab.room_id = r.id
                AND ab.start_date < v_check_out
                AND ab.end_date > v_check_in)
       AND NOT EXISTS (
             SELECT 1 FROM public.bookings b
              WHERE b.room_id = r.id
                AND b.hotel_id = v_hotel_id
                AND b.status IN ('pending', 'confirmed', 'checked_in')
                AND NOT (
                      b.status = 'pending'
                  AND b.payment_status = 'unpaid'
                  AND b.payment_preference = 'pay_now'
                  AND b.source = 'direct'
                  AND b.created_at < now() - interval '30 minutes'
                )
                AND b.check_in < v_check_out
                AND b.check_out > v_check_in)
     ORDER BY r.room_number
     LIMIT 1;
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

-- ── 7. Update reprice_booking_stay: block symmetry + zero-error plpgsql_check
CREATE OR REPLACE FUNCTION public.reprice_booking_stay(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_booking_id          uuid := NULLIF(p_payload->>'booking_id', '')::uuid;
  v_hotel_id            uuid := NULLIF(p_payload->>'hotel_id', '')::uuid;

  v_has_check_in        boolean := jsonb_exists(p_payload, 'check_in');
  v_has_check_out       boolean := jsonb_exists(p_payload, 'check_out');
  v_has_room_type       boolean := jsonb_exists(p_payload, 'room_type_id');
  v_has_room            boolean := jsonb_exists(p_payload, 'room_id');
  v_has_rooms_count     boolean := jsonb_exists(p_payload, 'rooms_count');
  v_has_rate_plan       boolean := jsonb_exists(p_payload, 'rate_plan_id');
  v_has_occupancy       boolean := jsonb_exists(p_payload, 'occupancy');

  v_check_in            date;
  v_check_out           date;
  v_room_type_id        uuid;
  v_room_id             uuid;
  v_rooms_count         smallint;
  v_rate_plan_id        uuid;
  v_occupancy           smallint;

  v_status              text;
  v_payment_status      text;
  v_amount_paid         numeric;
  v_old_type_id         uuid;
  v_old_plan_id         uuid;
  v_before              jsonb;
  v_type_changed        boolean;
  v_plan_changed        boolean;
  v_keep_rates          boolean := false;
  v_new_payment_status  text;

  v_settings            jsonb;
  v_hotel_currency      text;
  v_currency            text;
  v_tax_bps             integer := 0;
  v_nights              integer;
  v_night_count         integer;
  v_distinct_date_count integer;
  v_out_of_range_count  integer;
  v_invalid_rate_count  integer;
  v_null_plan_count     integer;
  v_null_currency_count integer;
  v_currency_count      integer;
  v_unit_minor          bigint;
  v_subtotal_minor      bigint;
  v_tax_minor           bigint;
  v_total_minor         bigint;
  v_room_rate           numeric;
  v_nights_json         jsonb;
  v_resolved_json       jsonb;
  v_kept                integer := 0;
  v_plan_count          integer;
  v_resolved_plan_id    uuid;
  v_constraint          text;
  v_occupied_by         text;
  v_resolver_guc        text := current_setting('roomline.rate_resolver', true);
BEGIN
  IF v_booking_id IS NULL OR v_hotel_id IS NULL THEN
    RAISE EXCEPTION 'booking_id and hotel_id are required'
      USING ERRCODE = 'P0001', DETAIL = 'invalid_payload';
  END IF;

  IF p_payload ? 'keep_rates' THEN
    IF jsonb_typeof(p_payload->'keep_rates') <> 'boolean' THEN
      RAISE EXCEPTION 'keep_rates must be a boolean'
        USING ERRCODE = 'P0001', DETAIL = 'invalid_payload: keep_rates';
    END IF;
    v_keep_rates := (p_payload->>'keep_rates')::boolean;
  END IF;

  SELECT b.status, b.payment_status, COALESCE(b.amount_paid, 0),
         b.check_in, b.check_out, b.room_type_id, b.room_id,
         GREATEST(COALESCE(b.rooms_count, 1), 1)::smallint,
         b.rate_plan_id, b.rate_plan_id, b.room_type_id,
         jsonb_build_object(
           'check_in',       b.check_in,
           'check_out',      b.check_out,
           'room_id',        b.room_id,
           'room_type_id',   b.room_type_id,
           'rate_plan_id',   b.rate_plan_id,
           'rooms_count',    b.rooms_count,
           'nights',         b.nights,
           'currency',       b.currency,
           'room_rate',      b.room_rate,
           'subtotal',       b.subtotal,
           'tax_amount',     b.tax_amount,
           'total_amount',   b.total_amount,
           'amount_paid',    b.amount_paid,
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

  IF v_status NOT IN ('pending', 'confirmed', 'checked_in') THEN
    RAISE EXCEPTION 'booking % is % and cannot be repriced', v_booking_id, v_status
      USING ERRCODE = 'P0001', DETAIL = 'booking_not_open', HINT = v_status;
  END IF;

  SELECT (array_agg(DISTINCT bn.occupancy))[1]
    INTO v_occupancy
    FROM public.booking_nights bn
   WHERE bn.booking_id = v_booking_id
  HAVING count(DISTINCT bn.occupancy) <= 1;

  v_occupancy := COALESCE(v_occupancy, 0);

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

  PERFORM 1
     FROM public.room_types rt
    WHERE rt.id = v_room_type_id
      AND rt.hotel_id = v_hotel_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room type % does not belong to hotel %', v_room_type_id, v_hotel_id
      USING ERRCODE = 'P0001', DETAIL = 'room_type_not_found';
  END IF;

  IF NOT v_has_rate_plan THEN
    v_rate_plan_id := public.effective_rate_plan_id(
      v_hotel_id, v_room_type_id, v_rate_plan_id);
    v_plan_changed := v_rate_plan_id IS DISTINCT FROM v_old_plan_id;
  END IF;

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
        AND r.is_active = true
        AND r.status NOT IN ('maintenance', 'out_of_service');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'room % is not bookable for room type %', v_room_id, v_room_type_id
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

    DECLARE
      v_conflict text;
    BEGIN
      SELECT COALESCE(g.full_name, b.reference)
        INTO v_conflict
        FROM public.bookings b
        LEFT JOIN public.guests g ON g.id = b.guest_id
       WHERE b.room_id = v_room_id
         AND b.hotel_id = v_hotel_id
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

  IF session_user = current_user
     AND v_resolver_guc = 'pg_temp.malformed_nightly_rates' THEN
    EXECUTE format(
      'SELECT jsonb_agg(to_jsonb(r) ORDER BY r.stay_date)
       FROM %I.%I($1, $2, $3, $4, $5, $6) r',
      split_part(v_resolver_guc, '.', 1),
      split_part(v_resolver_guc, '.', 2)
    )
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
    SELECT bn.stay_date, bn.rate_minor, bn.currency,
           v_rate_plan_id AS rate_plan_id,
           bn.occupancy, 'manual'::text AS source,
           NULL::uuid AS seasonal_rate_id, NULL::text AS season_name
      FROM public.booking_nights bn
     WHERE bn.booking_id = v_booking_id
       AND (v_keep_rates
            OR (NOT v_type_changed AND NOT v_plan_changed AND bn.source = 'manual'))
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

  v_new_payment_status := v_payment_status;

  IF v_amount_paid > 0 AND v_payment_status IN ('partial', 'paid') THEN
    v_new_payment_status := CASE
                              WHEN public.to_minor(v_amount_paid, v_currency) >= v_total_minor
                                THEN 'paid'
                              ELSE 'partial'
                            END;
  END IF;

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
    WHEN exclusion_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;

      IF v_constraint = 'bookings_room_type_inventory_guard' THEN
        RAISE;
      END IF;

      IF v_constraint IN ('bookings_no_availability_block_overlap', 'bookings_physical_room_bookable') THEN
        RAISE EXCEPTION 'room % is not bookable for those dates', v_room_id
          USING ERRCODE = 'P0001', DETAIL = 'room_not_bookable';
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
                        'check_in',       v_check_in,
                        'check_out',      v_check_out,
                        'room_id',        v_room_id,
                        'room_type_id',   v_room_type_id,
                        'rate_plan_id',   v_rate_plan_id,
                        'rooms_count',    v_rooms_count,
                        'nights',         v_nights,
                        'currency',       v_currency,
                        'room_rate',      v_room_rate,
                        'subtotal',       public.from_minor(v_subtotal_minor, v_currency),
                        'tax_amount',     public.from_minor(v_tax_minor, v_currency),
                        'total_amount',   public.from_minor(v_total_minor, v_currency),
                        'amount_paid',    v_amount_paid,
                        'payment_status', v_new_payment_status));
END;
$fn$;

REVOKE ALL ON FUNCTION public.reprice_booking_stay(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reprice_booking_stay(jsonb) TO service_role;

-- ── 8. Clean up remaining plpgsql_check warnings & revoke trigger EXECUTE ────
CREATE OR REPLACE FUNCTION public.create_booking_group_atomic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_lines             jsonb    := p_payload->'lines';
  v_shared            jsonb;
  v_line              jsonb;
  v_line_payload      jsonb;
  v_result            jsonb;
  v_results           jsonb    := '[]'::jsonb;
  v_guest_id          uuid     := NULLIF(p_payload->>'guest_id', '')::uuid;
  v_anchor_id         uuid;
  v_group_reference   text;
  v_currency          text;
  v_group_total_minor bigint   := 0;
  v_booking_ids       uuid[]   := '{}'::uuid[];
  v_line_count        integer;
  v_lock_key          bigint;
BEGIN
  IF v_lines IS NULL
     OR jsonb_typeof(v_lines) <> 'array'
     OR jsonb_array_length(v_lines) < 1 THEN
    RAISE EXCEPTION 'lines[] must be a non-empty array'
      USING ERRCODE = 'P0001', DETAIL = 'invalid_payload';
  END IF;

  v_line_count := jsonb_array_length(v_lines);
  IF v_line_count > 10 THEN
    RAISE EXCEPTION 'a reservation may hold at most 10 room lines, got %', v_line_count
      USING ERRCODE = 'P0001', DETAIL = 'invalid_line_count';
  END IF;

  v_shared := (p_payload - 'lines') - 'group_id';

  FOR v_lock_key IN
    SELECT DISTINCT hashtextextended(
             ((v_shared || elem)->>'hotel_id')::uuid::text || ':' ||
             ((v_shared || elem)->>'room_type_id')::uuid::text, 0) AS k
      FROM jsonb_array_elements(v_lines) elem
     WHERE ((v_shared || elem)->>'hotel_id') IS NOT NULL
       AND ((v_shared || elem)->>'room_type_id') IS NOT NULL
     ORDER BY k
  LOOP
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END LOOP;

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
    v_line_payload := ((v_shared || v_line) - 'lines') - 'group_id';

    IF v_guest_id IS NOT NULL THEN
      v_line_payload := v_line_payload
        || jsonb_build_object('guest_id', v_guest_id::text);
    END IF;

    v_result  := public.create_booking_atomic(v_line_payload);
    v_results := v_results || jsonb_build_array(v_result);

    IF v_guest_id IS NULL THEN
      v_guest_id := (v_result->>'guest_id')::uuid;
    END IF;
    IF v_anchor_id IS NULL THEN
      v_anchor_id       := (v_result->>'booking_id')::uuid;
      v_group_reference := v_result->>'reference';
      v_currency        := v_result->>'currency';
    END IF;

    v_booking_ids       := v_booking_ids || (v_result->>'booking_id')::uuid;
    v_group_total_minor := v_group_total_minor + (v_result->>'total_minor')::bigint;
  END LOOP;

  UPDATE public.bookings
     SET group_id = v_anchor_id
   WHERE id = ANY(v_booking_ids);

  RETURN jsonb_build_object(
    'group_id',          v_anchor_id,
    'group_reference',   v_group_reference,
    'guest_id',          v_guest_id,
    'currency',          v_currency,
    'group_total_minor', v_group_total_minor,
    'line_count',        v_line_count,
    'lines',             v_results
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_booking_group_atomic(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_group_atomic(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.generate_booking_reference(
  p_hotel_id uuid,
  p_prefix   text DEFAULT 'BK'
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ref text;
BEGIN
  PERFORM p_hotel_id, p_prefix;

  LOOP
    v_ref := ((pg_catalog.floor(pg_catalog.random() * 9000000000000)::bigint) + 1000000000000)::text;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.bookings b WHERE b.reference = v_ref
    );
  END LOOP;

  RETURN v_ref;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_booking_reference(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_booking_reference(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ari_dirty_from_availability_blocks()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ari_dirty_from_bookings()                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ari_dirty_from_daily_rate_overrides()           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ari_dirty_from_rate_restrictions()              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ari_dirty_from_seasonal_rate_overrides()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ari_dirty_from_seasonal_rates()                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_stay_restrictions()                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_room_type_inventory()                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_availability_block_no_booking_conflict() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_booking_physical_room_valid()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.demote_derived_rate_plan_children()             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_default_rate_plan()                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_last_super_admin()                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_notification_push()                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_daily_rate_override_minor()                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_room_type_price_minor()                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_seasonal_rate_override_minor()             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_updated_at()                             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_modification()                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_guest_stays_statistics()                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_platform_admin()                     FROM PUBLIC, anon, authenticated;

COMMIT;
