-- Retention for the rate and distribution tables.
--
-- Three tables grow without bound as a hotel operates and none of them is a
-- financial record, so a nightly job trims them. Two neighbours are deliberately
-- absent: booking_nights explains money that was actually charged and is never
-- pruned, and seasonal_rates are reused year to year by the people who wrote
-- them.
--
-- The windows, and why they are what they are:
--
--   * daily_rate_overrides and rate_restrictions: 400 days of history. 400 is the
--     forward horizon enqueue_ari_dirty clamps to, so keeping the same span
--     behind us leaves year-over-year rate comparison possible while the tables
--     stay bounded at roughly (rate plans x 800 days).
--   * ari_sync_outbox: a sent job is a receipt for state that has already been
--     pushed and is worthless after 30 days. A dead_letter is evidence of an
--     incident and must outlive it, so it keeps 90.
--
-- Two decisions make this safe to run against a live database.
--
-- First, history pruning is OFF by default and the scheduled job leaves it off.
-- Deleting a year-old override is irreversible, and there is no shortage of disk
-- today, so the first sweep must follow somebody reading the preview rather than
-- arrive as a cron surprise. After that review, one statement turns it on:
--
--   SELECT cron.alter_job(
--     (SELECT jobid FROM cron.job WHERE jobname = 'prune-rate-and-ari-data'),
--     command => $$SELECT * FROM public.prune_rate_and_ari_data(true);$$);
--
-- Second, every delete is batched and takes the oldest rows first. A backlog
-- cleared on the first enabled run is spread over as many nights as it needs
-- instead of taken in one transaction that bloats WAL and holds locks on tables
-- the availability grid reads. A run that fills its batch says so, in the
-- returned `capped` column, and the next run continues where it stopped.

-- The prune scans by date alone. daily_rate_overrides already has that index for
-- this reason; rate_restrictions only had (hotel_id, date), which a global cutoff
-- cannot use.
CREATE INDEX IF NOT EXISTS idx_rate_restrictions_date
  ON public.rate_restrictions (date);

-- ── Preview ──────────────────────────────────────────────────────────────────
--
-- Read-only. Answers "what would the nightly job delete if history pruning were
-- on", which is the review that has to happen before it is. `oldest` is text
-- because the four relations are keyed by a date and by a timestamp, and a
-- reviewer wants to read them side by side, not reconcile two types.

CREATE OR REPLACE FUNCTION public.rate_and_ari_retention_preview()
RETURNS TABLE (relation text, rows_eligible bigint, oldest text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT 'daily_rate_overrides (history)', count(*), min(o.date)::text
  FROM public.daily_rate_overrides o
  WHERE o.date < current_date - 400
  UNION ALL
  SELECT 'rate_restrictions (history)', count(*), min(x.date)::text
  FROM public.rate_restrictions x
  WHERE x.date < current_date - 400
  UNION ALL
  SELECT 'ari_sync_outbox (sent)', count(*), min(COALESCE(j.sent_at, j.updated_at))::text
  FROM public.ari_sync_outbox j
  WHERE j.status = 'sent'
    AND COALESCE(j.sent_at, j.updated_at) < now() - interval '30 days'
  UNION ALL
  SELECT 'ari_sync_outbox (dead_letter)', count(*), min(j.updated_at)::text
  FROM public.ari_sync_outbox j
  WHERE j.status = 'dead_letter'
    AND j.updated_at < now() - interval '90 days';
$$;

COMMENT ON FUNCTION public.rate_and_ari_retention_preview() IS
  'Counts the rows prune_rate_and_ari_data(true) would delete, without deleting any. Read this before enabling history pruning.';

REVOKE ALL ON FUNCTION public.rate_and_ari_retention_preview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_and_ari_retention_preview() TO service_role;

-- ── The nightly job ──────────────────────────────────────────────────────────
--
-- Deleting an override fires the distribution trigger, which calls
-- enqueue_ari_dirty with dates 400 days behind us; the clamp there drops them, so
-- pruning history can never queue a push. That is worth knowing before reading
-- past the first DELETE.

CREATE OR REPLACE FUNCTION public.prune_rate_and_ari_data(
  p_prune_history boolean DEFAULT false,
  p_batch_limit   integer DEFAULT 50000
)
RETURNS TABLE (relation text, rows_deleted bigint, capped boolean)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_batch_limit, 50000), 1), 500000);
  v_n     bigint;
BEGIN
  IF p_prune_history THEN
    DELETE FROM public.daily_rate_overrides o
    WHERE o.id IN (
      SELECT s.id FROM public.daily_rate_overrides s
      WHERE s.date < current_date - 400
      ORDER BY s.date
      LIMIT v_limit
    );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN QUERY SELECT 'daily_rate_overrides (history)'::text, v_n, v_n >= v_limit;

    DELETE FROM public.rate_restrictions x
    WHERE x.id IN (
      SELECT s.id FROM public.rate_restrictions s
      WHERE s.date < current_date - 400
      ORDER BY s.date
      LIMIT v_limit
    );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN QUERY SELECT 'rate_restrictions (history)'::text, v_n, v_n >= v_limit;
  END IF;

  -- The outbox is Phase 10's own table and starts empty everywhere, so there is
  -- no backlog to review and these two run unconditionally. COALESCE on sent_at
  -- so a worker that finished a job without stamping it still lets the row go.
  DELETE FROM public.ari_sync_outbox j
  WHERE j.id IN (
    SELECT s.id FROM public.ari_sync_outbox s
    WHERE s.status = 'sent'
      AND COALESCE(s.sent_at, s.updated_at) < now() - interval '30 days'
    ORDER BY COALESCE(s.sent_at, s.updated_at)
    LIMIT v_limit
  );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN QUERY SELECT 'ari_sync_outbox (sent)'::text, v_n, v_n >= v_limit;

  DELETE FROM public.ari_sync_outbox j
  WHERE j.id IN (
    SELECT s.id FROM public.ari_sync_outbox s
    WHERE s.status = 'dead_letter'
      AND s.updated_at < now() - interval '90 days'
    ORDER BY s.updated_at
    LIMIT v_limit
  );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN QUERY SELECT 'ari_sync_outbox (dead_letter)'::text, v_n, v_n >= v_limit;
END; $$;

COMMENT ON FUNCTION public.prune_rate_and_ari_data(boolean, integer) IS
  'Nightly retention: trims sent and dead-lettered ARI jobs always, and rate history older than 400 days only when p_prune_history is true. Deletes oldest-first in batches of p_batch_limit and reports whether a batch filled.';

REVOKE ALL ON FUNCTION public.prune_rate_and_ari_data(boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_rate_and_ari_data(boolean, integer) TO service_role;

-- Idempotent reschedule, matching prune-push-delivery-data at 17 3. Offset by six
-- minutes so the two nightly jobs never contend for the same autovacuum window.
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM cron.job WHERE jobname = 'prune-rate-and-ari-data';
  IF v_count > 0 THEN
    PERFORM cron.unschedule('prune-rate-and-ari-data');
  END IF;
END $$;

-- History pruning stays off here on purpose; see the header for the one statement
-- that turns it on after the preview has been read.
SELECT cron.schedule(
  'prune-rate-and-ari-data',
  '23 3 * * *',
  $$SELECT * FROM public.prune_rate_and_ari_data();$$
);
