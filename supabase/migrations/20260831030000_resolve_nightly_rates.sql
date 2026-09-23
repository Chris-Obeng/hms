-- Phase 6 — resolve_nightly_rates: one authoritative nightly rate resolver.
--
-- Until now the precedence rules (daily override > winning season > room base)
-- lived in TypeScript in lib/pricing/resolve-public-price.ts, which meant the
-- guest funnel, the staff rate matrix and anything else that needed a price had
-- to re-implement or re-import the same loop. Channel-manager distribution and
-- booking_nights both need those rates server-side, inside a transaction, so the
-- rules move into the database and the TypeScript resolver becomes a thin
-- wrapper over this function.
--
-- Semantics are reproduced exactly, including one subtlety that is easy to lose:
-- the winning season is chosen per night from the hotel's seasons alone. If that
-- season carries no override row for this (room type, rate plan, occupancy), the
-- night falls through to the room type's own price -- NOT to the next season
-- down. A season priced for some room types leaves the rest at base. Changing
-- that reprices live inventory.
--
-- Weekend nights are Friday and Saturday, matching the UTC-based check the
-- TypeScript resolver used (getUTCDay() 5 and 6 == isodow 5 and 6). This is now
-- the only weekend definition in the system: is_weekend is returned so callers
-- render the same flag instead of recomputing it from a JS Date, where a
-- server's local timezone can shift the day.
--
-- active_seasonal_rate_id / active_season_name report the winning season for the
-- night whether or not it priced it. The staff rate matrix needs that to show
-- "season active, no rate configured" on a base-priced cell; seasonal_rate_id /
-- season_name stay narrower and are set only when the season actually priced the
-- night, which is what the guest-facing funnel reads.

-- A return-type change cannot go through CREATE OR REPLACE, so a database that
-- already carries an earlier shape of this function must drop it first.
DROP FUNCTION IF EXISTS public.resolve_nightly_rates(uuid, uuid[], date, date, uuid, smallint);

CREATE OR REPLACE FUNCTION public.resolve_nightly_rates(
  p_hotel_id      uuid,
  p_room_type_ids uuid[],
  p_from          date,
  p_to            date,
  p_rate_plan_id  uuid     DEFAULT NULL,
  p_occupancy     smallint DEFAULT 0
)
RETURNS TABLE (
  room_type_id     uuid,
  rate_plan_id     uuid,
  stay_date        date,
  occupancy        smallint,
  rate_minor       bigint,
  currency         text,
  source           text,
  seasonal_rate_id uuid,
  season_name      text,
  is_weekend       boolean,
  active_seasonal_rate_id uuid,
  active_season_name      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
WITH nights AS (
  -- check-in .. check-out - 1: the check-out night is not a stay night
  SELECT g.d::date                              AS stay_date,
         extract(isodow FROM g.d) IN (5, 6)     AS is_weekend
  FROM generate_series(p_from, p_to - 1, interval '1 day') AS g(d)
),
hotel AS (
  SELECT coalesce(h.currency, 'GHS') AS currency
  FROM public.hotels h
  WHERE h.id = p_hotel_id
),
targets AS (
  SELECT rt.id AS room_type_id,
         rt.base_price_minor,
         rt.weekend_price_minor
  FROM public.room_types rt
  WHERE rt.hotel_id = p_hotel_id
    AND rt.id = ANY (p_room_type_ids)
),
plans AS (
  -- One plan per room type: the requested plan when it belongs to this room
  -- type, otherwise the room type's default plan. Rate plans are per room type,
  -- so a multi-room-type call cannot be served by a single explicit plan id.
  SELECT t.room_type_id,
         plan.id       AS rate_plan_id,
         plan.currency AS currency
  FROM targets t
  LEFT JOIN LATERAL (
    SELECT rp.id, rp.currency
    FROM public.rate_plans rp
    WHERE rp.hotel_id = p_hotel_id
      AND rp.room_type_id = t.room_type_id
      AND (rp.is_active OR rp.id = p_rate_plan_id)
    ORDER BY (rp.id IS NOT DISTINCT FROM p_rate_plan_id) DESC,
             rp.is_default DESC,
             rp.created_at,
             rp.id
    LIMIT 1
  ) plan ON true
),
winning_season AS (
  -- Highest priority covering the night wins; narrower range then later start
  -- break ties. seasonal_rates_no_same_priority_overlap already rules out the
  -- only ambiguous shape, so the tie-breaks exist to make the pick stable
  -- rather than to decide a price. Deliberately independent of whether an
  -- override row exists for the room type being priced.
  SELECT DISTINCT ON (n.stay_date)
         n.stay_date,
         sr.id   AS seasonal_rate_id,
         sr.name AS season_name
  FROM nights n
  JOIN public.seasonal_rates sr
    ON sr.hotel_id = p_hotel_id
   AND n.stay_date BETWEEN sr.start_date AND sr.end_date
  ORDER BY n.stay_date,
           sr.priority DESC,
           (sr.end_date - sr.start_date) ASC,
           sr.start_date DESC,
           sr.id
)
SELECT
  t.room_type_id,
  p.rate_plan_id,
  n.stay_date,
  coalesce(p_occupancy, 0::smallint) AS occupancy,
  CASE
    WHEN dro.price_minor IS NOT NULL THEN dro.price_minor
    WHEN sro.base_price_minor IS NOT NULL THEN
      CASE WHEN n.is_weekend AND sro.weekend_price_minor IS NOT NULL
           THEN sro.weekend_price_minor
           ELSE sro.base_price_minor
      END
    ELSE
      CASE WHEN n.is_weekend AND t.weekend_price_minor IS NOT NULL
           THEN t.weekend_price_minor
           ELSE t.base_price_minor
      END
  END AS rate_minor,
  coalesce(p.currency, hotel.currency, 'GHS') AS currency,
  CASE
    WHEN dro.price_minor IS NOT NULL       THEN 'daily'
    WHEN sro.base_price_minor IS NOT NULL  THEN 'seasonal'
    ELSE 'base'
  END AS source,
  CASE WHEN dro.price_minor IS NULL AND sro.base_price_minor IS NOT NULL
       THEN ws.seasonal_rate_id END AS seasonal_rate_id,
  CASE WHEN dro.price_minor IS NULL AND sro.base_price_minor IS NOT NULL
       THEN ws.season_name END      AS season_name,
  n.is_weekend,
  ws.seasonal_rate_id AS active_seasonal_rate_id,
  ws.season_name      AS active_season_name
FROM nights n
CROSS JOIN targets t
JOIN plans p ON p.room_type_id = t.room_type_id
LEFT JOIN hotel ON true
LEFT JOIN winning_season ws ON ws.stay_date = n.stay_date
LEFT JOIN public.daily_rate_overrides dro
       ON dro.rate_plan_id = p.rate_plan_id
      AND dro.date         = n.stay_date
      AND dro.occupancy    = coalesce(p_occupancy, 0::smallint)
LEFT JOIN public.seasonal_rate_overrides sro
       ON sro.seasonal_rate_id = ws.seasonal_rate_id
      AND sro.rate_plan_id     = p.rate_plan_id
      AND sro.occupancy        = coalesce(p_occupancy, 0::smallint)
ORDER BY t.room_type_id, n.stay_date;
$fn$;

COMMENT ON FUNCTION public.resolve_nightly_rates(uuid, uuid[], date, date, uuid, smallint) IS
  'Nightly rates for a stay, in minor units. Precedence per night: daily_rate_overrides for (rate_plan_id, date, occupancy), then the highest-priority season covering the night when it has an override row for that rate plan and occupancy, then room_types.base_price_minor/weekend_price_minor. A winning season without an override row falls through to base, not to the next season. Weekend = Friday/Saturday, reported as is_weekend so no caller recomputes it. active_seasonal_rate_id/active_season_name name the winning season even when it did not price the night, so a rate matrix can flag an unconfigured season. Rate plan defaults to the room type''s default plan when p_rate_plan_id is null or belongs to another room type. Nightly rates are public information, so anon may execute this.';

REVOKE ALL ON FUNCTION public.resolve_nightly_rates(uuid, uuid[], date, date, uuid, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_nightly_rates(uuid, uuid[], date, date, uuid, smallint)
  TO anon, authenticated, service_role;
