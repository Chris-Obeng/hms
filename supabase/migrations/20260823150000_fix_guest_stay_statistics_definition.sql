-- ============================================================================
-- Fix guest stay statistics definition
--
-- Problem: total_stays / total_spend / last_stay_date were derived ONLY from
-- bookings with status = 'checked_out'. A guest who booked and is currently
-- in-house (status = 'checked_in') showed 0 stays and 0 spend on the
-- Customers page — reported as "booked and checked out but shows 0 stays".
--
-- New definition (industry standard):
--   * A stay = booking with status IN ('checked_in', 'checked_out')
--     i.e. real occupancy, ongoing or completed.
--   * pending / confirmed (not yet arrived), cancelled, no_show never count.
--   * total_spend = SUM(amount_paid) across those same stays (in-house
--     deposits/payments now count).
--   * last_stay_date = MAX(COALESCE(check_out, check_in)) so an in-house
--     guest shows their arrival date instead of NULL.
--
-- Performance:
--   * Recalculation is a single grouped scan per affected guest (previously
--     three correlated subqueries).
--   * Row-level IS DISTINCT FROM guard skips no-op updates (no dead tuples).
--   * Partial index on active-stay rows keeps the aggregate on a tiny hot set.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_guest_stays_statistics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public, extensions'
AS $$
DECLARE
  v_guest_ids uuid[];
BEGIN
  -- Short-circuit: only recalc when a statistics-relevant column changed
  IF (TG_OP = 'UPDATE') THEN
    IF (OLD.guest_id IS NOT DISTINCT FROM NEW.guest_id AND
        OLD.status IS NOT DISTINCT FROM NEW.status AND
        OLD.amount_paid IS NOT DISTINCT FROM NEW.amount_paid AND
        OLD.check_in IS NOT DISTINCT FROM NEW.check_in AND
        OLD.check_out IS NOT DISTINCT FROM NEW.check_out) THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Collect every guest whose stats are affected by this row change
  IF (TG_OP = 'DELETE') THEN
    v_guest_ids := ARRAY[OLD.guest_id];
  ELSIF (TG_OP = 'UPDATE' AND OLD.guest_id IS DISTINCT FROM NEW.guest_id) THEN
    v_guest_ids := ARRAY_REMOVE(ARRAY[OLD.guest_id, NEW.guest_id], NULL);
  ELSE
    v_guest_ids := ARRAY[NEW.guest_id];
  END IF;

  IF v_guest_ids IS NULL OR COALESCE(cardinality(v_guest_ids), 0) = 0 THEN
    RETURN NULL;
  END IF;

  -- Single pass: recompute stats for all affected guests, resetting guests
  -- that no longer have any stays (e.g. after delete / cancel-all)
  UPDATE public.guests g
     SET total_stays    = COALESCE(s.stays, 0),
         total_spend    = COALESCE(s.spend, 0),
         last_stay_date = s.last_stay
    FROM unnest(v_guest_ids) AS u(gid)
    LEFT JOIN (
           SELECT b.guest_id,
                  COUNT(*)                               AS stays,
                  SUM(b.amount_paid)                     AS spend,
                  MAX(COALESCE(b.check_out, b.check_in)) AS last_stay
             FROM public.bookings b
            WHERE b.guest_id = ANY (v_guest_ids)
              AND b.status IN ('checked_in', 'checked_out')
            GROUP BY b.guest_id
         ) s ON s.guest_id = u.gid
   WHERE g.id = u.gid
     AND (g.total_stays, g.total_spend, g.last_stay_date)
         IS DISTINCT FROM (COALESCE(s.stays, 0), COALESCE(s.spend, 0), s.last_stay);

  RETURN NULL;
END;
$$;

-- check_in joined the stats inputs, so it must be in the UPDATE OF list
DROP TRIGGER IF EXISTS update_guest_stays_statistics_trigger ON public.bookings;

CREATE TRIGGER update_guest_stays_statistics_trigger
AFTER INSERT OR DELETE OR UPDATE OF guest_id, status, amount_paid, check_in, check_out
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.update_guest_stays_statistics();

-- Hot-path index: aggregates only ever read active/completed stays
CREATE INDEX IF NOT EXISTS idx_bookings_guest_active_stays
  ON public.bookings (guest_id)
  WHERE status IN ('checked_in', 'checked_out');

-- Backfill every guest under the corrected definition
UPDATE public.guests g
   SET total_stays    = COALESCE(s.stays, 0),
       total_spend    = COALESCE(s.spend, 0),
       last_stay_date = s.last_stay
  FROM (
        SELECT b.guest_id,
               COUNT(*)                               AS stays,
               SUM(b.amount_paid)                     AS spend,
               MAX(COALESCE(b.check_out, b.check_in)) AS last_stay
          FROM public.bookings b
         WHERE b.status IN ('checked_in', 'checked_out')
         GROUP BY b.guest_id
       ) s
 WHERE g.id = s.guest_id;

UPDATE public.guests g
   SET total_stays    = 0,
       total_spend    = 0,
       last_stay_date = NULL
 WHERE (g.total_stays <> 0 OR g.total_spend <> 0 OR g.last_stay_date IS NOT NULL)
   AND NOT EXISTS (
         SELECT 1
           FROM public.bookings b
          WHERE b.guest_id = g.id
            AND b.status IN ('checked_in', 'checked_out')
       );
