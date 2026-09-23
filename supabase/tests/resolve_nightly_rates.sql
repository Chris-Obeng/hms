-- =============================================================================
-- Regression probe: public.resolve_nightly_rates() is the one place nightly rate
-- precedence lives, and it keeps returning what the two TypeScript resolvers it
-- replaced returned.
--
-- Run against a database with the migrations applied:
--
--   pnpm db:test:rates
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/resolve_nightly_rates.sql
--
-- Everything happens inside one transaction that always rolls back, so it is
-- safe against a local stack and leaves no rows behind. It is deliberately SQL
-- rather than Vitest: what is under test is a SQL function, its GRANTs and its
-- volatility, and asserting that from application code would prove only that the
-- application still calls it.
--
-- Exit code 0 with eighteen "ok N" notices and the "--- rollback ---" marker
-- means the resolver holds. Any FAIL raises and aborts, so ON_ERROR_STOP turns a
-- regression into a non-zero exit.
--
-- What the groups cover:
--
--   1-2    every night of a three-room-type stay: the rates the TypeScript
--          resolver produced, one row per room type per night, check-out night
--          excluded
--   3-5    plan selection -- an explicitly requested plan wins and its currency
--          overrides the hotel's, a season priced for one plan does not leak
--          into another, and a plan belonging to a different room type falls
--          back to the requested room type's own default
--   6-7    occupancy -- an occupancy-specific daily override applies at that
--          occupancy and nowhere else
--   8-9    the weekend fallback, and a zero-decimal currency (JPY) resolving in
--          its own minor units
--   10-12  empty results rather than errors: another hotel's room type, a
--          same-day or inverted window, unknown ids, an empty array
--   13     the function's own shape -- SECURITY DEFINER, STABLE, a pinned
--          search_path, EXECUTE granted to exactly three roles
--   14-18  the three columns the staff rate matrix reads -- is_weekend, the
--          season that priced the night, and the season that won the night.
--          Those last two differ whenever a winning season does not price the
--          room type, or a daily override outranks it, and the matrix greys a
--          cell based on the difference.
--
-- This probe checks the resolver against hand-written expectations. Its
-- companion, tests/pricing-resolver-parity.test.ts, checks it against a
-- re-derivation of the pre-migration rules over 2640 nights.
--
-- Fixture: two hotels (GHS and JPY), four room types, their trigger-created
-- default rate plans plus one USD Flex plan, two nested seasons at different
-- priorities, and daily overrides scoped to a plan and to an occupancy.
-- =============================================================================

\pset pager off
BEGIN;

\set ON_ERROR_STOP on

-- ── Fixture: hotels, room types, rate plans ─────────────────────────────────

CREATE TEMP TABLE _t (k text PRIMARY KEY, v uuid);

WITH h AS (
  INSERT INTO public.hotels (slug, name, clerk_org_id, currency)
  VALUES ('p6-ghs', 'P6 GHS Hotel', 'org_p6_ghs', 'GHS') RETURNING id
) INSERT INTO _t SELECT 'hotel_ghs', id FROM h;

WITH h AS (
  INSERT INTO public.hotels (slug, name, clerk_org_id, currency)
  VALUES ('p6-jpy', 'P6 JPY Hotel', 'org_p6_jpy', 'JPY') RETURNING id
) INSERT INTO _t SELECT 'hotel_jpy', id FROM h;

WITH r AS (
  INSERT INTO public.room_types (hotel_id, name, slug, base_price, weekend_price)
  SELECT _t.v, 'Alpha', 'alpha', 100.00, 150.00 FROM _t WHERE _t.k = 'hotel_ghs'
  RETURNING id
) INSERT INTO _t SELECT 'rt_a', id FROM r;

WITH r AS (
  INSERT INTO public.room_types (hotel_id, name, slug, base_price, weekend_price)
  SELECT _t.v, 'Bravo', 'bravo', 200.00, NULL FROM _t WHERE _t.k = 'hotel_ghs'
  RETURNING id
) INSERT INTO _t SELECT 'rt_b', id FROM r;

WITH r AS (
  INSERT INTO public.room_types (hotel_id, name, slug, base_price, weekend_price)
  SELECT _t.v, 'Charlie', 'charlie', 300.00, 330.00 FROM _t WHERE _t.k = 'hotel_ghs'
  RETURNING id
) INSERT INTO _t SELECT 'rt_c', id FROM r;

WITH r AS (
  INSERT INTO public.room_types (hotel_id, name, slug, base_price, weekend_price)
  SELECT _t.v, 'Tatami', 'tatami', 12345.00, NULL FROM _t WHERE _t.k = 'hotel_jpy'
  RETURNING id
) INSERT INTO _t SELECT 'rt_j', id FROM r;

-- default plans created by ensure_default_rate_plan()
INSERT INTO _t
SELECT 'plan_a', rp.id FROM public.rate_plans rp
JOIN _t ON _t.k = 'rt_a' AND rp.room_type_id = _t.v WHERE rp.is_default;
INSERT INTO _t
SELECT 'plan_b', rp.id FROM public.rate_plans rp
JOIN _t ON _t.k = 'rt_b' AND rp.room_type_id = _t.v WHERE rp.is_default;
INSERT INTO _t
SELECT 'plan_c', rp.id FROM public.rate_plans rp
JOIN _t ON _t.k = 'rt_c' AND rp.room_type_id = _t.v WHERE rp.is_default;
INSERT INTO _t
SELECT 'plan_j', rp.id FROM public.rate_plans rp
JOIN _t ON _t.k = 'rt_j' AND rp.room_type_id = _t.v WHERE rp.is_default;

WITH p AS (
  INSERT INTO public.rate_plans (hotel_id, room_type_id, title, code, currency)
  SELECT h.v, a.v, 'Flex', 'FLEX', 'USD'
  FROM _t h, _t a WHERE h.k = 'hotel_ghs' AND a.k = 'rt_a'
  RETURNING id
) INSERT INTO _t SELECT 'plan_a_flex', id FROM p;

-- ── Fixture: seasons, seasonal overrides, daily overrides ───────────────────
-- Wide season: 2026-12-01 .. 2026-12-31, priority 100
WITH s AS (
  INSERT INTO public.seasonal_rates (hotel_id, name, start_date, end_date, priority)
  SELECT _t.v, 'Wide', '2026-12-01', '2026-12-31', 100 FROM _t WHERE _t.k = 'hotel_ghs'
  RETURNING id
) INSERT INTO _t SELECT 's_wide', id FROM s;

-- Narrow season nested inside it: 2026-12-26 .. 2026-12-27, priority 200
WITH s AS (
  INSERT INTO public.seasonal_rates (hotel_id, name, start_date, end_date, priority)
  SELECT _t.v, 'Narrow', '2026-12-26', '2026-12-27', 200 FROM _t WHERE _t.k = 'hotel_ghs'
  RETURNING id
) INSERT INTO _t SELECT 's_narrow', id FROM s;

-- Wide prices Alpha and Bravo, but deliberately NOT Charlie
INSERT INTO public.seasonal_rate_overrides
  (hotel_id, seasonal_rate_id, room_type_id, base_price, weekend_price)
SELECT h.v, s.v, a.v, 120.00, 180.00
FROM _t h, _t s, _t a
WHERE h.k = 'hotel_ghs' AND s.k = 's_wide' AND a.k = 'rt_a';

INSERT INTO public.seasonal_rate_overrides
  (hotel_id, seasonal_rate_id, room_type_id, base_price, weekend_price)
SELECT h.v, s.v, b.v, 210.00, NULL
FROM _t h, _t s, _t b
WHERE h.k = 'hotel_ghs' AND s.k = 's_wide' AND b.k = 'rt_b';

-- Narrow prices Alpha only: Bravo must fall through to BASE on 12-26/27,
-- not down to Wide.
INSERT INTO public.seasonal_rate_overrides
  (hotel_id, seasonal_rate_id, room_type_id, base_price, weekend_price)
SELECT h.v, s.v, a.v, 500.00, NULL
FROM _t h, _t s, _t a
WHERE h.k = 'hotel_ghs' AND s.k = 's_narrow' AND a.k = 'rt_a';

-- Daily overrides
INSERT INTO public.daily_rate_overrides (hotel_id, room_type_id, date, price)
SELECT h.v, a.v, '2026-12-25', 999.00
FROM _t h, _t a WHERE h.k = 'hotel_ghs' AND a.k = 'rt_a';

INSERT INTO public.daily_rate_overrides (hotel_id, room_type_id, rate_plan_id, date, price)
SELECT h.v, a.v, f.v, '2026-12-23', 111.00
FROM _t h, _t a, _t f WHERE h.k = 'hotel_ghs' AND a.k = 'rt_a' AND f.k = 'plan_a_flex';

INSERT INTO public.daily_rate_overrides (hotel_id, room_type_id, date, occupancy, price)
SELECT h.v, a.v, '2026-12-24', 2, 77.00
FROM _t h, _t a WHERE h.k = 'hotel_ghs' AND a.k = 'rt_a';

-- ── 1-2: the resolved rates themselves, and the row shape ───────────────────
DO $do$
DECLARE
  v_h uuid; v_a uuid; v_b uuid; v_c uuid;
  v_pa uuid; v_pb uuid; v_pc uuid;
  v_wide uuid; v_narrow uuid;
  v_diff text;
BEGIN
  SELECT _t.v INTO v_h      FROM _t WHERE _t.k = 'hotel_ghs';
  SELECT _t.v INTO v_a      FROM _t WHERE _t.k = 'rt_a';
  SELECT _t.v INTO v_b      FROM _t WHERE _t.k = 'rt_b';
  SELECT _t.v INTO v_c      FROM _t WHERE _t.k = 'rt_c';
  SELECT _t.v INTO v_pa     FROM _t WHERE _t.k = 'plan_a';
  SELECT _t.v INTO v_pb     FROM _t WHERE _t.k = 'plan_b';
  SELECT _t.v INTO v_pc     FROM _t WHERE _t.k = 'plan_c';
  SELECT _t.v INTO v_wide   FROM _t WHERE _t.k = 's_wide';
  SELECT _t.v INTO v_narrow FROM _t WHERE _t.k = 's_narrow';

  CREATE TEMP TABLE _exp (room uuid, plan uuid, d date, rate bigint, src text, season uuid);
  INSERT INTO _exp VALUES
    (v_a, v_pa, '2026-12-23',  12000, 'seasonal', v_wide),
    (v_a, v_pa, '2026-12-24',  12000, 'seasonal', v_wide),
    (v_a, v_pa, '2026-12-25',  99900, 'daily',    NULL),
    (v_a, v_pa, '2026-12-26',  50000, 'seasonal', v_narrow),
    (v_a, v_pa, '2026-12-27',  50000, 'seasonal', v_narrow),
    (v_b, v_pb, '2026-12-23',  21000, 'seasonal', v_wide),
    (v_b, v_pb, '2026-12-24',  21000, 'seasonal', v_wide),
    (v_b, v_pb, '2026-12-25',  21000, 'seasonal', v_wide),
    (v_b, v_pb, '2026-12-26',  20000, 'base',     NULL),
    (v_b, v_pb, '2026-12-27',  20000, 'base',     NULL),
    (v_c, v_pc, '2026-12-23',  30000, 'base',     NULL),
    (v_c, v_pc, '2026-12-24',  30000, 'base',     NULL),
    (v_c, v_pc, '2026-12-25',  33000, 'base',     NULL),
    (v_c, v_pc, '2026-12-26',  33000, 'base',     NULL),
    (v_c, v_pc, '2026-12-27',  30000, 'base',     NULL);

  CREATE TEMP TABLE _got AS
  SELECT r.room_type_id, r.rate_plan_id, r.stay_date, r.occupancy,
         r.rate_minor, r.currency, r.source, r.seasonal_rate_id
  FROM public.resolve_nightly_rates(v_h, ARRAY[v_a, v_b, v_c],
                                    '2026-12-23'::date, '2026-12-28'::date) r;

  SELECT string_agg(format('%s %s exp(%s,%s) got(%s,%s)',
                           coalesce(e.d, g.stay_date), coalesce(e.src, g.source),
                           e.rate, e.season, g.rate_minor, g.seasonal_rate_id), '; ')
    INTO v_diff
  FROM _exp e
  FULL OUTER JOIN _got g
    ON g.room_type_id = e.room AND g.stay_date = e.d
  WHERE e.room IS NULL OR g.room_type_id IS NULL
     OR g.rate_minor IS DISTINCT FROM e.rate
     OR g.source     IS DISTINCT FROM e.src
     OR g.seasonal_rate_id IS DISTINCT FROM e.season
     OR g.rate_plan_id     IS DISTINCT FROM e.plan
     OR g.currency  <> 'GHS'
     OR g.occupancy <> 0;

  IF v_diff IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 1 nightly resolution mismatch: %', v_diff;
  END IF;
  RAISE NOTICE 'ok 1 15 nights across 3 room types resolve exactly as the TS resolver does';

  IF (SELECT count(*) FROM _got) <> 15 THEN
    RAISE EXCEPTION 'FAIL 2 expected 15 rows, got %', (SELECT count(*) FROM _got);
  END IF;
  RAISE NOTICE 'ok 2 one row per room type per night, check-out night excluded';
END
$do$;

-- ── 3-7: rate plan selection and occupancy scoping ──────────────────────────
DO $do$
DECLARE
  v_h uuid; v_hj uuid; v_a uuid; v_b uuid; v_j uuid;
  v_pa uuid; v_pb uuid; v_pj uuid; v_flex uuid; v_wide uuid;
  r record;
  n int;
BEGIN
  SELECT _t.v INTO v_h    FROM _t WHERE _t.k = 'hotel_ghs';
  SELECT _t.v INTO v_hj   FROM _t WHERE _t.k = 'hotel_jpy';
  SELECT _t.v INTO v_a    FROM _t WHERE _t.k = 'rt_a';
  SELECT _t.v INTO v_b    FROM _t WHERE _t.k = 'rt_b';
  SELECT _t.v INTO v_j    FROM _t WHERE _t.k = 'rt_j';
  SELECT _t.v INTO v_pa   FROM _t WHERE _t.k = 'plan_a';
  SELECT _t.v INTO v_pb   FROM _t WHERE _t.k = 'plan_b';
  SELECT _t.v INTO v_pj   FROM _t WHERE _t.k = 'plan_j';
  SELECT _t.v INTO v_flex FROM _t WHERE _t.k = 'plan_a_flex';
  SELECT _t.v INTO v_wide FROM _t WHERE _t.k = 's_wide';

  -- 3/4: explicit rate plan is honoured for the room type that owns it, and its
  -- own currency is returned. The Wide season prices the default plan only, so
  -- 12-24 on Flex has no seasonal row and falls through to base.
  SELECT * INTO r FROM public.resolve_nightly_rates(
    v_h, ARRAY[v_a], '2026-12-23'::date, '2026-12-24'::date, v_flex) LIMIT 1;
  IF r.rate_plan_id <> v_flex OR r.rate_minor <> 11100
     OR r.source <> 'daily' OR r.currency <> 'USD' THEN
    RAISE EXCEPTION 'FAIL 3 flex plan 12-23: plan=% rate=% src=% cur=%',
      r.rate_plan_id, r.rate_minor, r.source, r.currency;
  END IF;
  RAISE NOTICE 'ok 3 explicit rate plan wins, plan currency overrides hotel currency';

  SELECT * INTO r FROM public.resolve_nightly_rates(
    v_h, ARRAY[v_a], '2026-12-24'::date, '2026-12-25'::date, v_flex) LIMIT 1;
  IF r.rate_minor <> 10000 OR r.source <> 'base' OR r.seasonal_rate_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 4 flex plan 12-24: rate=% src=%', r.rate_minor, r.source;
  END IF;
  RAISE NOTICE 'ok 4 season priced for another plan does not leak into this plan';

  -- 5: a plan id belonging to a different room type falls back to that room
  -- type's default plan rather than pricing nothing.
  SELECT * INTO r FROM public.resolve_nightly_rates(
    v_h, ARRAY[v_b], '2026-12-23'::date, '2026-12-24'::date, v_flex) LIMIT 1;
  IF r.rate_plan_id <> v_pb OR r.rate_minor <> 21000 OR r.currency <> 'GHS' THEN
    RAISE EXCEPTION 'FAIL 5 foreign plan id: plan=% rate=% cur=%',
      r.rate_plan_id, r.rate_minor, r.currency;
  END IF;
  RAISE NOTICE 'ok 5 rate plan of another room type falls back to that room type default';

  -- 6: occupancy is part of the daily override key
  SELECT * INTO r FROM public.resolve_nightly_rates(
    v_h, ARRAY[v_a], '2026-12-24'::date, '2026-12-25'::date, NULL, 2::smallint) LIMIT 1;
  IF r.rate_minor <> 7700 OR r.source <> 'daily' OR r.occupancy <> 2 THEN
    RAISE EXCEPTION 'FAIL 6 occupancy 2: rate=% src=% occ=%',
      r.rate_minor, r.source, r.occupancy;
  END IF;
  RAISE NOTICE 'ok 6 occupancy-specific daily override applies only at that occupancy';

  SELECT * INTO r FROM public.resolve_nightly_rates(
    v_h, ARRAY[v_a], '2026-12-24'::date, '2026-12-25'::date) LIMIT 1;
  IF r.rate_minor <> 12000 OR r.source <> 'seasonal' THEN
    RAISE EXCEPTION 'FAIL 7 occupancy 0 on same night: rate=% src=%',
      r.rate_minor, r.source;
  END IF;
  RAISE NOTICE 'ok 7 default occupancy ignores the occupancy-2 override';
END
$do$;

-- ── 8-13: weekend fallback, zero-decimal currency, empty results, GRANTs ────
DO $do$
DECLARE
  v_h uuid; v_hj uuid; v_a uuid; v_j uuid; v_pj uuid;
  r record;
  n int;
BEGIN
  SELECT _t.v INTO v_h  FROM _t WHERE _t.k = 'hotel_ghs';
  SELECT _t.v INTO v_hj FROM _t WHERE _t.k = 'hotel_jpy';
  SELECT _t.v INTO v_a  FROM _t WHERE _t.k = 'rt_a';
  SELECT _t.v INTO v_j  FROM _t WHERE _t.k = 'rt_j';
  SELECT _t.v INTO v_pj FROM _t WHERE _t.k = 'plan_j';

  -- 8: night with no season at all, on a Friday, uses the weekend base price
  SELECT * INTO r FROM public.resolve_nightly_rates(
    v_h, ARRAY[v_a], '2027-01-01'::date, '2027-01-02'::date) LIMIT 1;
  IF r.rate_minor <> 15000 OR r.source <> 'base' THEN
    RAISE EXCEPTION 'FAIL 8 uncovered Friday: rate=% src=%', r.rate_minor, r.source;
  END IF;
  RAISE NOTICE 'ok 8 uncovered Friday night uses weekend_price_minor';

  -- 9: zero-decimal currency passes through untouched
  SELECT * INTO r FROM public.resolve_nightly_rates(
    v_hj, ARRAY[v_j], '2026-12-23'::date, '2026-12-24'::date) LIMIT 1;
  IF r.rate_minor <> 12345 OR r.currency <> 'JPY' OR r.rate_plan_id <> v_pj THEN
    RAISE EXCEPTION 'FAIL 9 JPY: rate=% cur=% plan=%',
      r.rate_minor, r.currency, r.rate_plan_id;
  END IF;
  RAISE NOTICE 'ok 9 zero-decimal currency resolves in its own minor units';

  -- 10: a room type belonging to another hotel is not priced
  SELECT count(*) INTO n FROM public.resolve_nightly_rates(
    v_h, ARRAY[v_j], '2026-12-23'::date, '2026-12-24'::date);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 10 cross-hotel room type returned % rows', n; END IF;
  RAISE NOTICE 'ok 10 room type from another hotel returns no rows';

  -- 11: empty and inverted windows produce no nights
  SELECT count(*) INTO n FROM public.resolve_nightly_rates(
    v_h, ARRAY[v_a], '2026-12-23'::date, '2026-12-23'::date);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 11 same-day window returned % rows', n; END IF;
  SELECT count(*) INTO n FROM public.resolve_nightly_rates(
    v_h, ARRAY[v_a], '2026-12-25'::date, '2026-12-23'::date);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 11 inverted window returned % rows', n; END IF;
  RAISE NOTICE 'ok 11 same-day and inverted windows return no rows';

  -- 12: unknown room type and unknown hotel are silent, not errors
  SELECT count(*) INTO n FROM public.resolve_nightly_rates(
    v_h, ARRAY[gen_random_uuid()], '2026-12-23'::date, '2026-12-24'::date);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 12 unknown room type returned % rows', n; END IF;
  SELECT count(*) INTO n FROM public.resolve_nightly_rates(
    gen_random_uuid(), ARRAY[v_a], '2026-12-23'::date, '2026-12-24'::date);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 12 unknown hotel returned % rows', n; END IF;
  SELECT count(*) INTO n FROM public.resolve_nightly_rates(
    v_h, ARRAY[]::uuid[], '2026-12-23'::date, '2026-12-24'::date);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL 12 empty id array returned % rows', n; END IF;
  RAISE NOTICE 'ok 12 unknown hotel, unknown room type and empty array return no rows';

  -- 13: function hardening
  SELECT count(*) INTO n FROM pg_proc p
  WHERE p.proname = 'resolve_nightly_rates'
    AND p.prosecdef
    AND p.provolatile = 's'
    AND 'search_path=pg_catalog, public' = ANY (p.proconfig)
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND has_function_privilege('service_role', p.oid, 'EXECUTE');
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL 13 hardening/grants not as expected (n=%)', n; END IF;
  RAISE NOTICE 'ok 13 SECURITY DEFINER, STABLE, pinned search_path, granted to 3 roles';
END
$do$;

-- ── 14-18: is_weekend, and priced season vs active season ───────────────────
-- Assertions for the three columns the staff rate matrix needs.
DO $do$
DECLARE
  v_h uuid; v_a uuid; v_b uuid; v_c uuid;
  v_wide uuid; v_narrow uuid;
  r record;
  v_days text;
BEGIN
  SELECT _t.v INTO v_h      FROM _t WHERE _t.k = 'hotel_ghs';
  SELECT _t.v INTO v_a      FROM _t WHERE _t.k = 'rt_a';
  SELECT _t.v INTO v_b      FROM _t WHERE _t.k = 'rt_b';
  SELECT _t.v INTO v_c      FROM _t WHERE _t.k = 'rt_c';
  SELECT _t.v INTO v_wide   FROM _t WHERE _t.k = 's_wide';
  SELECT _t.v INTO v_narrow FROM _t WHERE _t.k = 's_narrow';

  -- 14: is_weekend marks Friday and Saturday and nothing else
  SELECT string_agg(x.stay_date::text, ',' ORDER BY x.stay_date) INTO v_days
  FROM public.resolve_nightly_rates(
         v_h, ARRAY[v_c], '2026-12-23'::date, '2026-12-28'::date) x
  WHERE x.is_weekend;
  IF v_days IS DISTINCT FROM '2026-12-25,2026-12-26' THEN
    RAISE EXCEPTION 'FAIL 14 weekend nights were %', coalesce(v_days, '(none)');
  END IF;
  RAISE NOTICE 'ok 14 is_weekend is true on Friday and Saturday only';

  -- 15: a season that did not price this room type is still reported as active,
  -- and the active season is the winning one (Narrow), not the one that happens
  -- to carry an override row for this room type (Wide).
  SELECT * INTO r FROM public.resolve_nightly_rates(
    v_h, ARRAY[v_c], '2026-12-23'::date, '2026-12-24'::date) LIMIT 1;
  IF r.source <> 'base' OR r.seasonal_rate_id IS NOT NULL OR r.season_name IS NOT NULL
     OR r.active_seasonal_rate_id IS DISTINCT FROM v_wide
     OR r.active_season_name <> 'Wide' THEN
    RAISE EXCEPTION 'FAIL 15 unpriced season: src=% priced=% active=% name=%',
      r.source, r.seasonal_rate_id, r.active_seasonal_rate_id, r.active_season_name;
  END IF;

  SELECT * INTO r FROM public.resolve_nightly_rates(
    v_h, ARRAY[v_b], '2026-12-26'::date, '2026-12-27'::date) LIMIT 1;
  IF r.source <> 'base' OR r.seasonal_rate_id IS NOT NULL
     OR r.active_seasonal_rate_id IS DISTINCT FROM v_narrow
     OR r.active_season_name <> 'Narrow' THEN
    RAISE EXCEPTION 'FAIL 15 fall-through night: src=% priced=% active=% name=%',
      r.source, r.seasonal_rate_id, r.active_seasonal_rate_id, r.active_season_name;
  END IF;
  RAISE NOTICE 'ok 15 base-priced night still names the winning season as active';

  -- 16: a daily override hides the season from seasonal_rate_id but not from
  -- active_seasonal_rate_id
  SELECT * INTO r FROM public.resolve_nightly_rates(
    v_h, ARRAY[v_a], '2026-12-25'::date, '2026-12-26'::date) LIMIT 1;
  IF r.source <> 'daily' OR r.seasonal_rate_id IS NOT NULL
     OR r.active_seasonal_rate_id IS DISTINCT FROM v_wide THEN
    RAISE EXCEPTION 'FAIL 16 daily night: src=% priced=% active=%',
      r.source, r.seasonal_rate_id, r.active_seasonal_rate_id;
  END IF;
  RAISE NOTICE 'ok 16 daily override keeps the active season visible';

  -- 17: a night no season covers reports no active season
  SELECT * INTO r FROM public.resolve_nightly_rates(
    v_h, ARRAY[v_a], '2027-01-01'::date, '2027-01-02'::date) LIMIT 1;
  IF r.active_seasonal_rate_id IS NOT NULL OR r.active_season_name IS NOT NULL
     OR NOT r.is_weekend THEN
    RAISE EXCEPTION 'FAIL 17 uncovered night: active=% name=% weekend=%',
      r.active_seasonal_rate_id, r.active_season_name, r.is_weekend;
  END IF;
  RAISE NOTICE 'ok 17 uncovered night has no active season';

  -- 18: when the season does price the night, both pairs agree
  SELECT * INTO r FROM public.resolve_nightly_rates(
    v_h, ARRAY[v_a], '2026-12-26'::date, '2026-12-27'::date) LIMIT 1;
  IF r.source <> 'seasonal' OR r.seasonal_rate_id IS DISTINCT FROM v_narrow
     OR r.active_seasonal_rate_id IS DISTINCT FROM v_narrow
     OR r.season_name <> 'Narrow' OR r.active_season_name <> 'Narrow' THEN
    RAISE EXCEPTION 'FAIL 18 seasonal night: priced=% active=%',
      r.seasonal_rate_id, r.active_seasonal_rate_id;
  END IF;
  RAISE NOTICE 'ok 18 a season that priced the night is both priced and active';
END
$do$;

SELECT '--- rollback ---' AS stage;
ROLLBACK;
