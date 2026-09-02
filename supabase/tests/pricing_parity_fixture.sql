-- =============================================================================
-- Fixture generator for the pricing parity gate.
--
--   pnpm db:parity-fixture      (writes tests/fixtures/pricing-parity.json)
--
-- Phase 6 moved nightly rate precedence out of TypeScript and into
-- public.resolve_nightly_rates(). tests/pricing-resolver-parity.test.ts proves
-- the move changed no price: it re-runs the original layering rules in
-- TypeScript over the inputs recorded here and compares them night by night
-- against the resolver output recorded here.
--
-- That comparison is only worth as much as this fixture, so the fixture is
-- deliberately adversarial rather than representative: 120 consecutive nights
-- spanning two month boundaries and a year boundary, four room types (weekend
-- price set, null, equal to base, and below base), six seasons that overlap and
-- nest at four different priorities, one season that prices nothing, seasons
-- that price some rate plans and occupancies but not others, an inactive rate
-- plan, a plan in a currency other than the hotel's, and daily overrides on the
-- first night, the last night, the year boundary, a plan that is not the
-- default, and an occupancy that is not 0.
--
-- Every id is a literal so a regenerated fixture diffs cleanly, and everything
-- runs inside a transaction that always rolls back, so it is safe against a
-- local stack and leaves no rows behind.
--
-- The window is 2026-11-15 .. 2027-03-15 exclusive: 120 stay nights. Season
-- coverage starts on 11-20, leaving the first five nights covered by no season
-- at all.
-- =============================================================================

BEGIN;

\set ON_ERROR_STOP on
\pset pager off

\set h    'aaaaaaaa-0000-4000-8000-000000000001'
\set rtA  'bbbbbbbb-0000-4000-8000-00000000000a'
\set rtB  'bbbbbbbb-0000-4000-8000-00000000000b'
\set rtC  'bbbbbbbb-0000-4000-8000-00000000000c'
\set rtD  'bbbbbbbb-0000-4000-8000-00000000000d'
\set pA   'cccccccc-0000-4000-8000-00000000000a'
\set pB   'cccccccc-0000-4000-8000-00000000000b'
\set pC   'cccccccc-0000-4000-8000-00000000000c'
\set pD   'cccccccc-0000-4000-8000-00000000000d'
\set pAf  'dddddddd-0000-4000-8000-000000000001'
\set pBl  'dddddddd-0000-4000-8000-000000000002'
\set pCc  'dddddddd-0000-4000-8000-000000000003'
\set sWide     'eeeeeeee-0000-4000-8000-000000000001'
\set sPeak     'eeeeeeee-0000-4000-8000-000000000002'
\set sNested   'eeeeeeee-0000-4000-8000-000000000003'
\set sShoulder 'eeeeeeee-0000-4000-8000-000000000004'
\set sTieA     'eeeeeeee-0000-4000-8000-000000000005'
\set sTieB     'eeeeeeee-0000-4000-8000-000000000006'
\set from_date '2026-11-15'
\set to_date   '2027-03-15'

INSERT INTO public.hotels (id, slug, name, clerk_org_id, currency)
VALUES (:'h', 'parity-fixture', 'Parity Fixture Hotel', 'org_parity_fixture', 'GHS');

-- Room types. weekend_price is set, null, equal to base, and below base in turn,
-- so every branch of the weekend fallback is exercised by some room type.
INSERT INTO public.room_types (id, hotel_id, name, slug, base_price, weekend_price)
VALUES
  (:'rtA', :'h', 'Alpha',   'alpha',   100.00, 150.00),
  (:'rtB', :'h', 'Bravo',   'bravo',   200.00, NULL),
  (:'rtC', :'h', 'Charlie', 'charlie', 300.00, 300.00),
  (:'rtD', :'h', 'Delta',   'delta',    80.50,  80.00);

-- ensure_default_rate_plan() created one default plan per room type with a
-- random id and now() for created_at. Pin both: the resolver's plan tie-break
-- reads created_at, and a random id would churn the fixture on every rebuild.
UPDATE public.rate_plans SET id = :'pA', created_at = '2026-01-01T00:00:00Z'
  WHERE room_type_id = :'rtA' AND is_default;
UPDATE public.rate_plans SET id = :'pB', created_at = '2026-01-01T00:00:01Z'
  WHERE room_type_id = :'rtB' AND is_default;
UPDATE public.rate_plans SET id = :'pC', created_at = '2026-01-01T00:00:02Z'
  WHERE room_type_id = :'rtC' AND is_default;
UPDATE public.rate_plans SET id = :'pD', created_at = '2026-01-01T00:00:03Z'
  WHERE room_type_id = :'rtD' AND is_default;

-- Extra plans: one active plan in a currency the hotel does not use, one
-- inactive plan (usable only when a caller names it explicitly), and one more
-- active plan whose room type no season prices.
INSERT INTO public.rate_plans
  (id, hotel_id, room_type_id, title, code, currency, is_default, is_active, created_at)
VALUES
  (:'pAf', :'h', :'rtA', 'Flex',   'FLEX',   'USD', false, true,  '2026-02-01T00:00:00Z'),
  (:'pBl', :'h', :'rtB', 'Legacy', 'LEGACY', NULL,  false, false, '2026-02-01T00:00:01Z'),
  (:'pCc', :'h', :'rtC', 'Corp',   'CORP',   NULL,  false, true,  '2026-02-01T00:00:02Z');

-- Seasons. Wide covers all but the first five nights; Peak nests inside it at a
-- higher priority; Nested nests inside Peak higher again; Shoulder sits later in
-- the window; TieA and TieB share a priority but do not overlap each other,
-- which is the only same-priority shape
-- seasonal_rates_no_same_priority_overlap permits.
INSERT INTO public.seasonal_rates (id, hotel_id, name, start_date, end_date, priority)
VALUES
  (:'sWide',     :'h', 'Wide',     '2026-11-20', '2027-03-14',  10),
  (:'sPeak',     :'h', 'Peak',     '2026-12-20', '2027-01-05', 100),
  (:'sNested',   :'h', 'Nested',   '2026-12-24', '2026-12-26', 200),
  (:'sShoulder', :'h', 'Shoulder', '2027-02-01', '2027-02-28',  50),
  (:'sTieA',     :'h', 'Tie A',    '2027-01-10', '2027-01-20',  50),
  (:'sTieB',     :'h', 'Tie B',    '2027-01-21', '2027-01-31',  50);

-- Season pricing, deliberately patchy. Peak prices Alpha but not Charlie, and
-- Nested prices Alpha but not Bravo: on 12-24..12-26 Bravo must fall through to
-- its own base price rather than down to Peak or Wide, which is the single
-- easiest rule to get wrong when reimplementing this.
--
-- Plan-scoped rows sit on different seasons rather than stacking on one,
-- because unique_seasonal_rate_room_type (seasonal_rate_id, room_type_id) is
-- still in force this release: 20260831020000_rate_plans.sql keeps the legacy
-- uniques until the application has been writing rate_plan_id in production
-- for a full release. Tie A therefore prices Alpha on the Flex plan only, so
-- on 2027-01-10..20 -- nights Tie A wins for every plan -- Flex is priced 130
-- while the default plan falls through to Alpha's own base price instead of
-- down to Wide. The same fall-through rule, one dimension over.
INSERT INTO public.seasonal_rate_overrides
  (hotel_id, seasonal_rate_id, room_type_id, rate_plan_id, occupancy, base_price, weekend_price)
VALUES
  (:'h', :'sWide',     :'rtA', :'pA',  0, 120.00, 180.00),
  (:'h', :'sWide',     :'rtB', :'pB',  0, 210.00, NULL),
  (:'h', :'sWide',     :'rtD', :'pD',  2,  90.00,  95.00),
  (:'h', :'sPeak',     :'rtA', :'pA',  0, 400.00, 450.00),
  (:'h', :'sNested',   :'rtA', :'pA',  0, 500.00, NULL),
  (:'h', :'sShoulder', :'rtC', :'pC',  0, 260.00, NULL),
  (:'h', :'sTieA',     :'rtA', :'pAf', 0, 130.00, NULL),
  (:'h', :'sTieA',     :'rtB', :'pB',  0, 205.00, NULL);

-- Daily overrides: first night of the window, last night, the year boundary, a
-- night a nested season also prices, a night no season covers, a non-default
-- plan, and a non-zero occupancy.
INSERT INTO public.daily_rate_overrides
  (hotel_id, room_type_id, rate_plan_id, occupancy, date, price)
VALUES
  (:'h', :'rtA', :'pA',  0, '2026-11-15',   95.00),
  (:'h', :'rtA', :'pA',  0, '2026-12-01',  999.00),
  (:'h', :'rtA', :'pAf', 0, '2026-12-02',  111.00),
  (:'h', :'rtA', :'pA',  2, '2026-12-03',   77.00),
  (:'h', :'rtA', :'pA',  0, '2026-12-25', 1500.00),
  (:'h', :'rtA', :'pA',  0, '2027-01-01',  888.00),
  (:'h', :'rtB', :'pB',  0, '2027-02-14',  350.00),
  (:'h', :'rtC', :'pC',  0, '2027-03-14',  275.00),
  (:'h', :'rtD', :'pD',  0, '2026-11-16',   60.00);

-- Season names double as the fixture's season identity: they are shorter than a
-- uuid, they are what the resolver already returns alongside the ids, and the
-- guard below keeps them unique so the mapping stays lossless.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) - count(DISTINCT name) INTO n FROM public.seasonal_rates
  WHERE hotel_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  IF n <> 0 THEN RAISE EXCEPTION 'fixture season names must be unique'; END IF;
END $$;

-- ── Emit ────────────────────────────────────────────────────────────────────
-- JSON Lines: the first line records every input the resolver read, then one
-- line per (room type, requested rate plan, occupancy) case carrying its 120
-- nights. One document per line keeps the generated file reviewable in a diff
-- while staying trivial to parse.
\pset format unaligned
\pset tuples_only on

SELECT json_build_object(
  'kind', 'inputs',
  'from', :'from_date', 'to', :'to_date',
  'hotel_id', :'h', 'hotel_currency', (SELECT currency FROM public.hotels WHERE id = :'h'),
  'room_types', (SELECT json_agg(json_build_object(
       'id', rt.id, 'name', rt.name,
       'base_price_minor', rt.base_price_minor,
       'weekend_price_minor', rt.weekend_price_minor) ORDER BY rt.name)
     FROM public.room_types rt WHERE rt.hotel_id = :'h'),
  'rate_plans', (SELECT json_agg(json_build_object(
       'id', rp.id, 'room_type_id', rp.room_type_id, 'currency', rp.currency,
       'is_default', rp.is_default, 'is_active', rp.is_active,
       'created_at', rp.created_at) ORDER BY rp.created_at, rp.id)
     FROM public.rate_plans rp WHERE rp.hotel_id = :'h'),
  'seasons', (SELECT json_agg(json_build_object(
       'id', sr.id, 'name', sr.name, 'start_date', sr.start_date,
       'end_date', sr.end_date, 'priority', sr.priority) ORDER BY sr.name)
     FROM public.seasonal_rates sr WHERE sr.hotel_id = :'h'),
  'seasonal_overrides', (SELECT json_agg(json_build_object(
       'season_name', sr.name, 'rate_plan_id', sro.rate_plan_id,
       'occupancy', sro.occupancy,
       'base_price_minor', sro.base_price_minor,
       'weekend_price_minor', sro.weekend_price_minor)
       ORDER BY sr.name, sro.rate_plan_id, sro.occupancy)
     FROM public.seasonal_rate_overrides sro
     JOIN public.seasonal_rates sr ON sr.id = sro.seasonal_rate_id
     WHERE sro.hotel_id = :'h'),
  'daily_overrides', (SELECT json_agg(json_build_object(
       'rate_plan_id', dro.rate_plan_id, 'date', dro.date,
       'occupancy', dro.occupancy, 'price_minor', dro.price_minor)
       ORDER BY dro.date, dro.rate_plan_id, dro.occupancy)
     FROM public.daily_rate_overrides dro WHERE dro.hotel_id = :'h')
)::text;

-- Every room type crossed with every rate plan that could price it — its own
-- plans plus the null "let the resolver pick the default" case — at two
-- occupancies. 22 cases x 120 nights.
WITH combos AS (
  SELECT rt.id AS room_type_id, NULL::uuid AS plan_id
  FROM public.room_types rt WHERE rt.hotel_id = :'h'
  UNION ALL
  SELECT rp.room_type_id, rp.id
  FROM public.rate_plans rp WHERE rp.hotel_id = :'h'
),
cases AS (
  SELECT c.room_type_id, c.plan_id, o.occupancy
  FROM combos c CROSS JOIN (VALUES (0::smallint), (2::smallint)) o(occupancy)
)
SELECT json_build_object(
  'kind', 'case',
  'room_type_id', c.room_type_id,
  'requested_rate_plan_id', c.plan_id,
  'occupancy', c.occupancy,
  'resolved_rate_plan_ids', r.plan_ids,
  'currencies', r.currencies,
  'nights', r.nights
)::text
FROM cases c
CROSS JOIN LATERAL (
  SELECT
    to_json(array_agg(DISTINCT x.rate_plan_id))  AS plan_ids,
    to_json(array_agg(DISTINCT x.currency))      AS currencies,
    json_agg(json_build_array(
      x.stay_date, x.rate_minor, x.source,
      x.season_name, x.active_season_name, x.is_weekend
    ) ORDER BY x.stay_date)                      AS nights
  FROM public.resolve_nightly_rates(
         :'h', ARRAY[c.room_type_id], :'from_date', :'to_date', c.plan_id, c.occupancy) x
) r
ORDER BY c.room_type_id, c.plan_id NULLS FIRST, c.occupancy;

ROLLBACK;
