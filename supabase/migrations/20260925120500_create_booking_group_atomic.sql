-- =============================================================================
-- Multi-room reservation writer: one guest, N room lines, one transaction.
--
-- create_booking_group_atomic() composes the unchanged single-room writer
-- create_booking_atomic() once per line inside a single transaction, then links
-- the resulting rows with a shared group_id (column added in 20260925120000).
-- It does NOT reimplement pricing, validation, guest resolution or the
-- inventory guard: every line is an ordinary single-room booking, so the GIST
-- overlap EXCLUDEs, the assert_room_type_inventory trigger, booking_nights and
-- reprice_booking_stay all keep working per line, byte-for-byte. The only new
-- write is the group_id back-fill.
--
-- All-or-nothing: create_booking_atomic raises on any rejection (P0001 machine
-- codes in DETAIL for policy, native 23P01 for inventory). A raise from any
-- line aborts the whole function, so a partially-built group can never commit.
-- Same-type oversell across lines is caught because each inner insert's
-- inventory trigger sees the earlier lines' holds within this transaction.
--
-- Guest resolved once: the first line resolves-or-creates the guest and the
-- returned guest_id is pinned onto every later line, so no line duplicates the
-- guest. The anchor (first) line's own reference is the guest-facing group
-- reference; each line keeps its own staff-facing reference.
--
-- The legacy single-room path (create_booking_atomic called directly with one
-- room_type_id) is untouched and leaves group_id NULL.
-- =============================================================================

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
  v_booking_ids       uuid[]   := '{}';
  v_line_count        integer;
BEGIN
  IF v_lines IS NULL
     OR jsonb_typeof(v_lines) <> 'array'
     OR jsonb_array_length(v_lines) < 1 THEN
    RAISE EXCEPTION 'lines[] must be a non-empty array'
      USING ERRCODE = 'P0001', DETAIL = 'invalid_payload';
  END IF;

  v_line_count := jsonb_array_length(v_lines);
  -- Defensive ceiling; the product cap (2-4 lines) is enforced at the route.
  IF v_line_count > 10 THEN
    RAISE EXCEPTION 'a reservation may hold at most 10 room lines, got %', v_line_count
      USING ERRCODE = 'P0001', DETAIL = 'invalid_line_count';
  END IF;

  -- Shared reservation-level fields apply to every line; per-line keys override.
  v_shared := (p_payload - 'lines') - 'group_id';

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
    v_line_payload := ((v_shared || v_line) - 'lines') - 'group_id';

    -- Pin the resolved guest so no line after the first re-creates it.
    IF v_guest_id IS NOT NULL THEN
      v_line_payload := v_line_payload
        || jsonb_build_object('guest_id', v_guest_id::text);
    END IF;

    -- Reuse the single-room writer verbatim: pricing, inventory guard, nights.
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

  -- Link the group. The anchor row's group_id equals its own id; siblings share it.
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

COMMENT ON FUNCTION public.create_booking_group_atomic(jsonb) IS
  'Creates a multi-room reservation in one transaction by composing create_booking_atomic() once per element of p_payload.lines[], then linking the rows with a shared group_id. Guest resolved once; the anchor line reference is the group reference. All-or-nothing: any line rejection rolls back the whole group. The legacy single-room path is unchanged.';

REVOKE ALL ON FUNCTION public.create_booking_group_atomic(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_group_atomic(jsonb) TO service_role;

-- Guard: assert the composed writer landed with the same posture as its peers.
DO $guard$
DECLARE
  v_sig text := 'public.create_booking_group_atomic(jsonb)';
  v_prov "char";
  v_sec  boolean;
BEGIN
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
END;
$guard$;
