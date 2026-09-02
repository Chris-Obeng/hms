-- Assertion harness for rate and distribution retention
-- (20260902160000_rate_and_ari_retention.sql).
--
-- Retention code is the one kind that is only ever wrong in one direction. A
-- prune that deletes too little wastes disk; a prune that deletes too much
-- destroys a hotel's rate history overnight, on a schedule, with nobody
-- watching. So the properties pinned here are mostly about what must NOT
-- disappear: the migration ships with history pruning off, and this suite fails
-- if a later edit quietly turns it on, moves a boundary by a day, or lets an
-- unfinished distribution job be swept because it happens to be old.
--
-- One transaction, always rolled back, with its own fixture. The prune and the
-- preview are deliberately global -- the nightly job is not per-hotel -- so the
-- exact counts below hold only in a database with no other tenant rows, which is
-- what the local stack is. The first block refuses to run otherwise instead of
-- failing later with a confusing number.
BEGIN;
\set ON_ERROR_STOP on

INSERT INTO public.hotels (id, slug, name, clerk_org_id, currency) VALUES
  ('a0a0a0a0-0000-4000-8000-00000000000a', 'retention-probe', 'Retention Probe',
   'org_retention_probe', 'GHS');

INSERT INTO public.room_types
  (id, hotel_id, name, slug, base_price, weekend_price, max_adults, max_children) VALUES
  ('a1a1a1a1-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-00000000000a',
   'Retention Double', 'retention-double', 180.00, 180.00, 2, 2);

INSERT INTO public.rooms (id, hotel_id, room_type_id, room_number) VALUES
  ('a2a2a2a2-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-00000000000a',
   'a1a1a1a1-0000-4000-8000-000000000001', 'R-101'),
  ('a2a2a2a2-0000-4000-8000-000000000002', 'a0a0a0a0-0000-4000-8000-00000000000a',
   'a1a1a1a1-0000-4000-8000-000000000001', 'R-102');

-- Distribution is switched ON for this hotel on purpose. Every fixture write and
-- every delete below therefore takes the real trigger path, which is the only way
-- to prove that retention never queues a phantom push.
INSERT INTO public.channel_properties
  (hotel_id, provider, external_property_id, is_enabled) VALUES
  ('a0a0a0a0-0000-4000-8000-00000000000a', 'channex', 'cp-retention-1', true);

DO $$
DECLARE
  v_stray int;
BEGIN
  SELECT (SELECT count(*) FROM public.daily_rate_overrides)
       + (SELECT count(*) FROM public.rate_restrictions)
       + (SELECT count(*) FROM public.ari_sync_outbox)
    INTO v_stray;
  IF v_stray <> 0 THEN
    RAISE EXCEPTION 'FIXTURE: % pre-existing row(s) in the pruned tables; this suite asserts global counts and needs an empty local database', v_stray;
  END IF;
END $$;

-- The rate history. -900 is a deep backlog row, -401 is one day past the cutoff,
-- -400 is the cutoff itself and must survive, -399 is inside the window. The two
-- middle dates are the whole point: an off-by-one in the prune shows up here and
-- nowhere else.
INSERT INTO public.daily_rate_overrides
  (hotel_id, room_type_id, rate_plan_id, date, occupancy, price, price_minor)
SELECT 'a0a0a0a0-0000-4000-8000-00000000000a',
       'a1a1a1a1-0000-4000-8000-000000000001',
       (SELECT id FROM public.rate_plans
         WHERE room_type_id = 'a1a1a1a1-0000-4000-8000-000000000001' AND is_default),
       current_date - d, 0, 150.00, 15000
FROM unnest(ARRAY[900, 401, 400, 399]) d;

INSERT INTO public.rate_restrictions
  (hotel_id, rate_plan_id, date, stop_sell)
SELECT 'a0a0a0a0-0000-4000-8000-00000000000a',
       (SELECT id FROM public.rate_plans
         WHERE room_type_id = 'a1a1a1a1-0000-4000-8000-000000000001' AND is_default),
       current_date - d, true
FROM unnest(ARRAY[401, 400]) d;

-- Two neighbours the job must never touch: a season somebody wrote by hand, and
-- a night that explains money already charged.
INSERT INTO public.seasonal_rates (hotel_id, name, start_date, end_date) VALUES
  ('a0a0a0a0-0000-4000-8000-00000000000a', 'Ancient Season',
   current_date - 900, current_date - 890);

INSERT INTO public.bookings
  (id, hotel_id, room_type_id, reference, check_in, check_out,
   room_rate, subtotal, total_amount, source, status) VALUES
  ('a3a3a3a3-0000-4000-8000-000000000001', 'a0a0a0a0-0000-4000-8000-00000000000a',
   'a1a1a1a1-0000-4000-8000-000000000001', 'RET-PROBE-1',
   current_date + 300, current_date + 302, 180.00, 360.00, 360.00,
   'manual', 'confirmed');

INSERT INTO public.booking_nights
  (hotel_id, booking_id, stay_date, rate_minor, currency, source) VALUES
  ('a0a0a0a0-0000-4000-8000-00000000000a', 'a3a3a3a3-0000-4000-8000-000000000001',
   current_date - 900, 18000, 'GHS', 'manual');

-- The fixture writes above already queued real jobs through the triggers, which
-- is proof the path is live but is not the shape this suite needs. Clear them and
-- hand-build one row per retention decision. updated_at is set on the INSERT
-- because handle_ari_sync_outbox_updated_at fires BEFORE UPDATE only, so these
-- ages survive exactly as written.
DELETE FROM public.ari_sync_outbox;

INSERT INTO public.ari_sync_outbox
  (hotel_id, date_from, date_to, status, sent_at, updated_at) VALUES
  -- sent, past the 30-day receipt window: goes.
  ('a0a0a0a0-0000-4000-8000-00000000000a', current_date + 1, current_date + 2,
   'sent', now() - interval '31 days', now() - interval '31 days'),
  -- sent by a worker that never stamped sent_at: the COALESCE onto updated_at is
  -- what stops this row living forever.
  ('a0a0a0a0-0000-4000-8000-00000000000a', current_date + 3, current_date + 4,
   'sent', NULL, now() - interval '45 days'),
  -- sent one day inside the window: stays.
  ('a0a0a0a0-0000-4000-8000-00000000000a', current_date + 5, current_date + 6,
   'sent', now() - interval '29 days', now() - interval '29 days'),
  -- dead_letter past 90 days: the incident is closed, the evidence goes.
  ('a0a0a0a0-0000-4000-8000-00000000000a', current_date + 7, current_date + 8,
   'dead_letter', NULL, now() - interval '91 days'),
  -- dead_letter one day inside the window: stays.
  ('a0a0a0a0-0000-4000-8000-00000000000a', current_date + 9, current_date + 10,
   'dead_letter', NULL, now() - interval '89 days'),
  -- Three unfinished jobs, deliberately ancient. Age must never prune work that
  -- has not been pushed yet: deleting one of these silently drops an OTA update
  -- and oversells the room. Their windows are distinct so a merge cannot hide a
  -- disappearance behind a widened neighbour.
  ('a0a0a0a0-0000-4000-8000-00000000000a', current_date + 300, current_date + 301,
   'pending', NULL, now() - interval '400 days'),
  ('a0a0a0a0-0000-4000-8000-00000000000a', current_date + 310, current_date + 311,
   'retry', NULL, now() - interval '400 days'),
  ('a0a0a0a0-0000-4000-8000-00000000000a', current_date + 320, current_date + 321,
   'processing', NULL, now() - interval '400 days');

-- ── 1: the preview tells the truth ───────────────────────────────────────────
--
-- The preview is the review a human is asked to read before enabling history
-- pruning, so it is only useful if its numbers are the numbers. It must also name
-- all four relations even when a count is zero, or a reviewer reads a short list
-- and assumes the missing one is safe.
DO $$
DECLARE
  v_rows   int;
  v_ovr    bigint;
  v_oldest text;
  v_res    bigint;
  v_sent   bigint;
  v_dead   bigint;
BEGIN
  SELECT count(*) INTO v_rows FROM public.rate_and_ari_retention_preview();
  IF v_rows <> 4 THEN
    RAISE EXCEPTION 'FAIL 1a: preview named % relation(s), expected 4', v_rows;
  END IF;

  SELECT p.rows_eligible, p.oldest INTO v_ovr, v_oldest
  FROM public.rate_and_ari_retention_preview() p
  WHERE p.relation = 'daily_rate_overrides (history)';
  IF v_ovr <> 2 OR v_oldest <> (current_date - 900)::text THEN
    RAISE EXCEPTION 'FAIL 1b: overrides eligible=% oldest=%, expected 2 and %',
      v_ovr, v_oldest, (current_date - 900)::text;
  END IF;

  SELECT p.rows_eligible INTO v_res FROM public.rate_and_ari_retention_preview() p
  WHERE p.relation = 'rate_restrictions (history)';
  SELECT p.rows_eligible INTO v_sent FROM public.rate_and_ari_retention_preview() p
  WHERE p.relation = 'ari_sync_outbox (sent)';
  SELECT p.rows_eligible INTO v_dead FROM public.rate_and_ari_retention_preview() p
  WHERE p.relation = 'ari_sync_outbox (dead_letter)';
  IF v_res <> 1 OR v_sent <> 2 OR v_dead <> 1 THEN
    RAISE EXCEPTION 'FAIL 1c: eligible restrictions=%, sent=%, dead_letter=%, expected 1/2/1',
      v_res, v_sent, v_dead;
  END IF;

  RAISE NOTICE 'PASS 1: preview reports 2 override, 1 restriction, 2 sent and 1 dead-lettered row(s) eligible';
END $$;

-- ── 2: the scheduled run trims the outbox and does not touch rate history ────
--
-- This is the property that makes the cron entry safe to ship. The migration
-- schedules prune_rate_and_ari_data() with no arguments, so what runs unattended
-- every night is exactly this call. If a later edit flips the default, or adds a
-- history DELETE outside the IF, the assertions below fail before it reaches a
-- hotel with a decade of rates in it.
CREATE TEMP TABLE run_default AS SELECT * FROM public.prune_rate_and_ari_data();

DO $$
DECLARE
  v_rows    int;
  v_history int;
  v_n       bigint;
  v_capped  boolean;
  v_ovr     int;
  v_res     int;
  v_open    int;
BEGIN
  SELECT count(*) INTO v_rows FROM run_default;
  SELECT count(*) INTO v_history FROM run_default WHERE relation LIKE '%history%';
  IF v_rows <> 2 OR v_history <> 0 THEN
    RAISE EXCEPTION 'FAIL 2a: default run reported % row(s), % of them history; expected 2 and 0',
      v_rows, v_history;
  END IF;

  SELECT r.rows_deleted, r.capped INTO v_n, v_capped
  FROM run_default r WHERE r.relation = 'ari_sync_outbox (sent)';
  IF v_n <> 2 OR v_capped THEN
    RAISE EXCEPTION 'FAIL 2b: sent deleted=% capped=%, expected 2 and false', v_n, v_capped;
  END IF;

  SELECT r.rows_deleted, r.capped INTO v_n, v_capped
  FROM run_default r WHERE r.relation = 'ari_sync_outbox (dead_letter)';
  IF v_n <> 1 OR v_capped THEN
    RAISE EXCEPTION 'FAIL 2c: dead_letter deleted=% capped=%, expected 1 and false', v_n, v_capped;
  END IF;

  SELECT count(*) INTO v_ovr FROM public.daily_rate_overrides;
  SELECT count(*) INTO v_res FROM public.rate_restrictions;
  IF v_ovr <> 4 OR v_res <> 2 THEN
    RAISE EXCEPTION 'FAIL 2d: the unattended run deleted rate history -- % override(s) and % restriction(s) left of 4 and 2',
      v_ovr, v_res;
  END IF;

  -- The three unfinished jobs are 400 days old and must all still be queued.
  SELECT count(*) INTO v_open FROM public.ari_sync_outbox
  WHERE status IN ('pending', 'retry', 'processing');
  IF v_open <> 3 THEN
    RAISE EXCEPTION 'FAIL 2e: % unfinished job(s) survived of 3 -- retention dropped work that was never pushed',
      v_open;
  END IF;

  IF (SELECT count(*) FROM public.ari_sync_outbox WHERE status = 'sent') <> 1
     OR (SELECT count(*) FROM public.ari_sync_outbox WHERE status = 'dead_letter') <> 1 THEN
    RAISE EXCEPTION 'FAIL 2f: the inside-window sent and dead_letter rows did not both survive';
  END IF;

  RAISE NOTICE 'PASS 2: unattended run trimmed 3 finished job(s), left 3 unfinished and all rate history intact';
END $$;

-- ── 3: a second run has nothing to do ────────────────────────────────────────
--
-- The job runs 365 times a year against a table it has already trimmed, so the
-- steady state is zero deletes and capped false. A `capped` that stays true on an
-- empty backlog would tell an operator the job is behind forever.
CREATE TEMP TABLE run_again AS SELECT * FROM public.prune_rate_and_ari_data();

DO $$
DECLARE
  v_bad int;
BEGIN
  SELECT count(*) INTO v_bad FROM run_again WHERE rows_deleted <> 0 OR capped;
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'FAIL 3: a repeat run reported % relation(s) with work left to do', v_bad;
  END IF;
  RAISE NOTICE 'PASS 3: repeat run deletes nothing and reports no backlog';
END $$;

-- ── 4: the batch limit is honoured, oldest first ─────────────────────────────
--
-- The first enabled run on a live hotel meets a backlog. It has to be allowed to
-- take a bite and stop: one transaction deleting years of overrides bloats WAL and
-- holds locks on the tables the availability grid reads. Taking the oldest rows
-- first is what makes the next night resume rather than start over.
CREATE TEMP TABLE run_batch AS SELECT * FROM public.prune_rate_and_ari_data(true, 1);

DO $$
DECLARE
  v_n      bigint;
  v_capped boolean;
BEGIN
  SELECT r.rows_deleted, r.capped INTO v_n, v_capped
  FROM run_batch r WHERE r.relation = 'daily_rate_overrides (history)';
  IF v_n <> 1 OR NOT v_capped THEN
    RAISE EXCEPTION 'FAIL 4a: batch of 1 deleted % override(s), capped=%; expected 1 and true',
      v_n, v_capped;
  END IF;

  IF EXISTS (SELECT 1 FROM public.daily_rate_overrides WHERE date = current_date - 900) THEN
    RAISE EXCEPTION 'FAIL 4b: the batch skipped the oldest row';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.daily_rate_overrides WHERE date = current_date - 401) THEN
    RAISE EXCEPTION 'FAIL 4c: the batch of 1 took more than one row';
  END IF;

  SELECT r.rows_deleted, r.capped INTO v_n, v_capped
  FROM run_batch r WHERE r.relation = 'rate_restrictions (history)';
  IF v_n <> 1 OR NOT v_capped THEN
    RAISE EXCEPTION 'FAIL 4d: batch of 1 deleted % restriction(s), capped=%; expected 1 and true',
      v_n, v_capped;
  END IF;
  IF EXISTS (SELECT 1 FROM public.rate_restrictions WHERE date = current_date - 401) THEN
    RAISE EXCEPTION 'FAIL 4e: the restriction batch skipped the oldest row';
  END IF;

  RAISE NOTICE 'PASS 4: a batch of 1 takes exactly the oldest row per relation and reports capped';
END $$;

-- ── 5: the cutoff is a boundary, not a neighbourhood ─────────────────────────
--
-- 400 days back mirrors the 400-day forward horizon enqueue_ari_dirty clamps to.
-- The row dated exactly current_date - 400 is inside that span and must survive
-- every future run; the row one day older must not. A restriction batch that finds
-- nothing eligible has to report zero rather than reach for the boundary row.
CREATE TEMP TABLE run_history AS SELECT * FROM public.prune_rate_and_ari_data(true);

DO $$
DECLARE
  v_n      bigint;
  v_capped boolean;
  v_left   int;
BEGIN
  SELECT r.rows_deleted, r.capped INTO v_n, v_capped
  FROM run_history r WHERE r.relation = 'daily_rate_overrides (history)';
  IF v_n <> 1 OR v_capped THEN
    RAISE EXCEPTION 'FAIL 5a: full run deleted % override(s), capped=%; expected 1 and false',
      v_n, v_capped;
  END IF;

  SELECT r.rows_deleted, r.capped INTO v_n, v_capped
  FROM run_history r WHERE r.relation = 'rate_restrictions (history)';
  IF v_n <> 0 OR v_capped THEN
    RAISE EXCEPTION 'FAIL 5b: full run deleted % restriction(s), capped=%; expected 0 and false',
      v_n, v_capped;
  END IF;

  SELECT count(*) INTO v_left FROM public.daily_rate_overrides;
  IF v_left <> 2
     OR NOT EXISTS (SELECT 1 FROM public.daily_rate_overrides WHERE date = current_date - 400)
     OR NOT EXISTS (SELECT 1 FROM public.daily_rate_overrides WHERE date = current_date - 399) THEN
    RAISE EXCEPTION 'FAIL 5c: % override(s) left; expected exactly the -400 and -399 rows', v_left;
  END IF;

  SELECT count(*) INTO v_left FROM public.rate_restrictions;
  IF v_left <> 1
     OR NOT EXISTS (SELECT 1 FROM public.rate_restrictions WHERE date = current_date - 400) THEN
    RAISE EXCEPTION 'FAIL 5d: % restriction(s) left; expected only the -400 row', v_left;
  END IF;

  RAISE NOTICE 'PASS 5: history older than 400 days is gone and the cutoff date itself survives';
END $$;

-- ── 6: the neighbours the job must never touch ───────────────────────────────
--
-- booking_nights explains money a guest was actually charged, and a seasonal_rate
-- is a rule somebody wrote and reuses next year. Both here are ancient enough that
-- a prune written against "old rows" instead of named tables would have taken them
-- during the three runs above.
DO $$
DECLARE
  v_nights  int;
  v_seasons int;
BEGIN
  SELECT count(*) INTO v_nights FROM public.booking_nights
  WHERE stay_date = current_date - 900;
  SELECT count(*) INTO v_seasons FROM public.seasonal_rates
  WHERE end_date < current_date - 400;
  IF v_nights <> 1 OR v_seasons <> 1 THEN
    RAISE EXCEPTION 'FAIL 6: % ancient booking night(s) and % ancient season(s) survived, expected 1 and 1',
      v_nights, v_seasons;
  END IF;
  RAISE NOTICE 'PASS 6: a 900-day-old booking night and season are untouched by three prune runs';
END $$;

-- ── 7: pruning history queues no distribution work ───────────────────────────
--
-- Deleting an override fires the ARI trigger, which calls enqueue_ari_dirty with
-- dates a year or more behind us. The clamp there drops them, so retention can
-- never leave a job telling Channex to re-read a window that closed last year.
-- Distribution is enabled for this hotel, so a missing clamp shows up as a new
-- row rather than as nothing happening.
DO $$
DECLARE
  v_total   int;
  v_pending int;
  v_from    date;
  v_to      date;
BEGIN
  IF NOT public.ari_distribution_active('a0a0a0a0-0000-4000-8000-00000000000a') THEN
    RAISE EXCEPTION 'FIXTURE 7: distribution is off, so this case would pass for the wrong reason';
  END IF;

  SELECT count(*) INTO v_total FROM public.ari_sync_outbox;
  IF v_total <> 5 THEN
    RAISE EXCEPTION 'FAIL 7a: outbox holds % row(s) after three prune runs, expected the same 5',
      v_total;
  END IF;

  -- Read the pending row's window too: a phantom enqueue would merge into an
  -- adjacent pending job and widen it rather than add a row.
  SELECT count(*) INTO v_pending FROM public.ari_sync_outbox WHERE status = 'pending';
  SELECT j.date_from, j.date_to INTO v_from, v_to
  FROM public.ari_sync_outbox j WHERE j.status = 'pending';
  IF v_pending <> 1 OR v_from <> current_date + 300 OR v_to <> current_date + 301 THEN
    RAISE EXCEPTION 'FAIL 7b: % pending job(s), window % to %; expected 1 unchanged job',
      v_pending, v_from, v_to;
  END IF;

  RAISE NOTICE 'PASS 7: retention queued no distribution work and widened no pending job';
END $$;

ROLLBACK;
