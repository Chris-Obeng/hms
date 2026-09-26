-- =============================================================================
-- Deterministic advisory-lock order for multi-room group creation.
--
-- create_booking_group_atomic() composes create_booking_atomic() once per line
-- in the client's array order. Each inner insert fires the
-- bookings_room_type_inventory_guard trigger, which takes
--   pg_advisory_xact_lock(hashtextextended(hotel_id::text||':'||room_type_id::text, 0))
-- for that (hotel, room_type). Two concurrent groups that list the same room
-- types in OPPOSITE order therefore acquire those locks in opposite order and
-- can deadlock (SQLSTATE 40P01): group A holds Deluxe and waits for Standard
-- while group B holds Standard and waits for Deluxe. classify() mapped that
-- 40P01 to "unknown" -> a 500 mid-checkout instead of a retryable conflict.
--
-- Fix: before the per-line loop, pre-acquire the group's DISTINCT (hotel,
-- room_type) inventory locks in one globally-consistent order (sorted by the
-- lock key). Every group create now queues on these locks in the same order,
-- so the AB-BA cycle cannot form. The key is byte-identical to the trigger's
-- (uuid text normalised through ::uuid::text to match NEW.<col>::text), so the
-- trigger's per-line re-take is a reentrant, xact-scoped no-op that neither
-- blocks nor joins a lock graph.
--
-- Everything else is unchanged: the loop still runs in client order, the anchor
-- is still the first line, and the guest-facing group reference is unchanged.
-- The single-room path (create_booking_atomic called directly) is untouched.
-- This migration only redefines create_booking_group_atomic; its signature and
-- grants are identical to 20260925120500. Idempotent (CREATE OR REPLACE).
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
  v_lock_key          bigint;
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

  -- Deadlock guard: take every distinct (hotel, room_type) inventory lock this
  -- group needs, in one sorted order shared by all group creates, before the
  -- first insert. Key matches the inventory-guard trigger exactly, so its
  -- per-line re-take is a reentrant no-op. A line missing an id is skipped here
  -- and rejected by create_booking_atomic inside the loop below.
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
  'Creates a multi-room reservation in one transaction by composing create_booking_atomic() once per element of p_payload.lines[], then linking the rows with a shared group_id. Pre-acquires the group''s distinct (hotel, room_type) inventory locks in sorted order so concurrent groups with opposite room-type order cannot deadlock. Guest resolved once; the anchor line reference is the group reference. All-or-nothing: any line rejection rolls back the whole group. The legacy single-room path is unchanged.';

REVOKE ALL ON FUNCTION public.create_booking_group_atomic(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_group_atomic(jsonb) TO service_role;

-- Guard: assert the redefined writer kept the same posture as its peers.
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
