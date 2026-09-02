-- =============================================================================
-- Deterministic season layering: explicit priority instead of implicit ordering.
--
-- WHY
-- ---
-- Until now two seasons for one hotel could never overlap: the original
-- `no_overlapping_seasons` EXCLUDE forbade it outright (dropped in
-- `20260830163000_reconcile_rate_table_drift.sql`, where it was also confirmed
-- never to have reached production). That rule blocks the most common real
-- pricing pattern in the industry — a short, expensive window sitting inside a
-- long, cheaper one: a conference week inside "Summer", Christmas inside
-- "High Season". Hotels work around it by chopping the long season into
-- fragments around every short one, which is manual, error-prone, and has to be
-- redone whenever a date moves.
--
-- With `priority`, overlap becomes a deliberate, ordered statement: the highest
-- priority season covering a night wins. Overlap is only ambiguous at the SAME
-- priority, and that is exactly what the new EXCLUDE forbids — so the resolver's
-- ordering is total, and the same night can never resolve two ways depending on
-- row order.
--
-- Safe to run against production and against a freshly reset local database.
-- =============================================================================

-- House convention: every migration that adds a gist EXCLUDE asserts the
-- extension, because `hotel_id WITH =` and `priority WITH =` are btree operators
-- inside a gist index and need btree_gist to be indexable.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- -----------------------------------------------------------------------------
-- 1. The priority column.
--
-- integer, not smallint: a hotel importing a rate calendar from another system
-- may carry priorities in the thousands, and widening a NOT NULL column later
-- rewrites the table.
-- -----------------------------------------------------------------------------
ALTER TABLE public.seasonal_rates
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.seasonal_rates.priority IS
  'Higher wins when several seasons cover the same night. Two seasons of the '
  'same hotel may overlap only if their priorities differ '
  '(seasonal_rates_no_same_priority_overlap).';

-- -----------------------------------------------------------------------------
-- 2. Backfill by range width, so existing data keeps resolving the way it does
--    today.
--
-- The resolver's current tie-break is "latest start_date wins", which in
-- practice is a proxy for "narrower wins" — a short window carved out of a long
-- one almost always starts later. Encoding width directly preserves that intent
-- without preserving the proxy.
--
--   <= 7 days  -> 200   a specific week (conference, holiday)
--   <= 31 days -> 100   a month-ish window
--   otherwise  ->   0   a broad season, the base layer
--
-- Only rows still at the default are touched, so re-running this migration
-- cannot silently flatten priorities an operator has since set by hand.
-- -----------------------------------------------------------------------------
UPDATE public.seasonal_rates
SET priority = CASE
      WHEN (end_date - start_date) <= 7  THEN 200
      WHEN (end_date - start_date) <= 31 THEN 100
      ELSE 0
    END
WHERE priority = 0
  AND (end_date - start_date) <= 31;

-- -----------------------------------------------------------------------------
-- 3. Same-priority overlap is the only illegal overlap.
--
-- `daterange(start_date, end_date, '[]')` — both endpoints inclusive, matching
-- how the resolver reads a season (`start_date <= night AND end_date >= night`).
-- Two seasons that merely touch (one ends the day the next begins) DO overlap
-- under '[]' and are rejected at equal priority; that is intended, because such
-- a pair genuinely leaves one night claimed twice.
--
-- Wrapped rather than `IF NOT EXISTS`, which ALTER TABLE ... ADD CONSTRAINT does
-- not support.
--
-- If a hotel already has same-priority overlaps after the backfill above, this
-- statement fails loudly with 23505 naming the offending rows. That is the
-- correct outcome: the data is ambiguous and a human has to choose which season
-- wins before pricing can be made deterministic.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE public.seasonal_rates
    ADD CONSTRAINT seasonal_rates_no_same_priority_overlap
      EXCLUDE USING gist (
        hotel_id WITH =,
        priority WITH =,
        daterange(start_date, end_date, '[]') WITH &&
      );
EXCEPTION
  WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 4. The index the resolver actually orders by.
--
-- Equality column first (hotel_id), then the ORDER BY key. Every season lookup
-- is "this hotel's seasons overlapping this range, highest priority first", so
-- this index serves the filter and the sort from one scan.
--
-- The EXCLUDE above creates its own gist index, which answers overlap
-- containment but not `ORDER BY priority DESC` — hence a separate btree.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_seasonal_rates_hotel_priority_dates
  ON public.seasonal_rates (hotel_id, priority DESC, start_date, end_date);
