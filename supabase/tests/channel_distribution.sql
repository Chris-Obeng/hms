-- Assertion harness for the channel-distribution scaffold
-- (20260902140000_channel_distribution_scaffold.sql).
--
-- What this proves is the part no TypeScript test can: that a write anywhere in
-- the six tables that decide what an OTA would be shown leaves a job behind, that
-- the job says the right window, that a burst of writes collapses instead of
-- multiplying, and that none of it happens at all for a hotel that has not turned
-- distribution on. A distribution feed that silently misses a change oversells
-- rooms, and the only place that can be guaranteed is here.
--
-- One transaction, always rolled back, with its own fixture: the local database
-- holds no tenant rows, so every suite builds what it needs. The window sits well
-- past any seeded seasonality.
BEGIN;
\set ON_ERROR_STOP on

INSERT INTO public.hotels (id, slug, name, clerk_org_id, currency) VALUES
  ('f0f0f0f0-0000-4000-8000-00000000000a', 'channel-probe', 'Channel Probe',
   'org_channel_probe', 'GHS');

INSERT INTO public.room_types
  (id, hotel_id, name, slug, base_price, weekend_price, max_adults, max_children) VALUES
  ('f1f1f1f1-0000-4000-8000-000000000001', 'f0f0f0f0-0000-4000-8000-00000000000a',
   'Probe Double', 'probe-double', 200.00, 200.00, 2, 2);

-- Two physical rooms, so an availability count of 2 is a fact rather than a
-- coincidence of there being one row.
INSERT INTO public.rooms (id, hotel_id, room_type_id, room_number) VALUES
  ('f2f2f2f2-0000-4000-8000-000000000001', 'f0f0f0f0-0000-4000-8000-00000000000a',
   'f1f1f1f1-0000-4000-8000-000000000001', 'P-101'),
  ('f2f2f2f2-0000-4000-8000-000000000002', 'f0f0f0f0-0000-4000-8000-00000000000a',
   'f1f1f1f1-0000-4000-8000-000000000001', 'P-102');

-- ── 1: nothing is queued for a hotel that has not enabled distribution ───────
--
-- This is the whole safety property of shipping the scaffold before the client:
-- the triggers are live on every hotel's writes from the moment the migration
-- lands, and must cost one index probe per changed target and produce nothing.
DO $$
DECLARE
  v_hotel uuid := 'f0f0f0f0-0000-4000-8000-00000000000a';
  v_rt    uuid := 'f1f1f1f1-0000-4000-8000-000000000001';
  v_plan  uuid;
  v_jobs  int;
BEGIN
  SELECT id INTO v_plan FROM public.rate_plans
   WHERE hotel_id = v_hotel AND room_type_id = v_rt AND is_default;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'FIXTURE: ensure_default_rate_plan did not give the room type a plan';
  END IF;

  IF public.ari_distribution_active(v_hotel) THEN
    RAISE EXCEPTION 'FAIL 1: distribution reads as active with no channel_properties row';
  END IF;

  INSERT INTO public.daily_rate_overrides
    (hotel_id, room_type_id, rate_plan_id, date, occupancy, price, price_minor)
  SELECT v_hotel, v_rt, v_plan, current_date + n, 0, 250.00, 25000
  FROM generate_series(10, 12) n;

  SELECT count(*) INTO v_jobs FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  IF v_jobs <> 0 THEN
    RAISE EXCEPTION 'FAIL 1: % job(s) queued for a hotel with distribution off', v_jobs;
  END IF;

  RAISE NOTICE 'PASS 1: writes are tracked but nothing is queued while distribution is off';
END $$;

-- ── 2: enabling the switch makes the same write queue exactly one job ────────
INSERT INTO public.channel_properties
  (hotel_id, provider, external_property_id, is_enabled) VALUES
  ('f0f0f0f0-0000-4000-8000-00000000000a', 'channex', 'cp-probe-1', true);

DO $$
DECLARE
  v_hotel uuid := 'f0f0f0f0-0000-4000-8000-00000000000a';
  v_rt    uuid := 'f1f1f1f1-0000-4000-8000-000000000001';
  v_plan  uuid;
  v_jobs  int;
  v_row   public.ari_sync_outbox;
BEGIN
  SELECT id INTO v_plan FROM public.rate_plans
   WHERE hotel_id = v_hotel AND room_type_id = v_rt AND is_default;

  IF NOT public.ari_distribution_active(v_hotel) THEN
    RAISE EXCEPTION 'FAIL 2: an enabled channel_properties row did not activate distribution';
  END IF;

  DELETE FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;

  -- 20 nights rewritten in one statement: a row-level trigger would leave 20 jobs.
  INSERT INTO public.daily_rate_overrides
    (hotel_id, room_type_id, rate_plan_id, date, occupancy, price, price_minor)
  SELECT v_hotel, v_rt, v_plan, current_date + n, 0, 275.00, 27500
  FROM generate_series(20, 39) n;

  SELECT count(*) INTO v_jobs FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  IF v_jobs <> 1 THEN
    RAISE EXCEPTION 'FAIL 2: one statement over 20 nights queued % job(s)', v_jobs;
  END IF;

  SELECT * INTO v_row FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  IF v_row.room_type_id <> v_rt OR v_row.rate_plan_id <> v_plan THEN
    RAISE EXCEPTION 'FAIL 2: job targets room type %, plan %', v_row.room_type_id, v_row.rate_plan_id;
  END IF;
  IF v_row.date_from <> current_date + 20 OR v_row.date_to <> current_date + 39 THEN
    RAISE EXCEPTION 'FAIL 2: job window is % .. %, not the 20 nights written',
      v_row.date_from, v_row.date_to;
  END IF;
  IF v_row.status <> 'pending' OR v_row.attempt_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 2: a fresh job is % with % attempt(s)', v_row.status, v_row.attempt_count;
  END IF;

  RAISE NOTICE 'PASS 2: 20 nights in one statement queue one pending job for the exact window';
END $$;

-- ── 3: overlapping and adjacent work merges; distant work does not ───────────
--
-- The queue holds ranges, not payloads, so two jobs that touch the same nights are
-- the same job. Merging on adjacency as well as overlap is what keeps a day of
-- desk edits from becoming a day of pushes.
DO $$
DECLARE
  v_hotel uuid := 'f0f0f0f0-0000-4000-8000-00000000000a';
  v_rt    uuid := 'f1f1f1f1-0000-4000-8000-000000000001';
  v_plan  uuid;
  v_jobs  int;
  v_to    date;
BEGIN
  SELECT id INTO v_plan FROM public.rate_plans
   WHERE hotel_id = v_hotel AND room_type_id = v_rt AND is_default;

  -- Adjacent: the night after the queued window's last night.
  INSERT INTO public.daily_rate_overrides
    (hotel_id, room_type_id, rate_plan_id, date, occupancy, price, price_minor)
  VALUES (v_hotel, v_rt, v_plan, current_date + 40, 0, 300.00, 30000);

  SELECT count(*) INTO v_jobs FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  SELECT max(date_to) INTO v_to FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  IF v_jobs <> 1 OR v_to <> current_date + 40 THEN
    RAISE EXCEPTION 'FAIL 3: adjacent night left % job(s) ending %', v_jobs, v_to;
  END IF;

  -- Far away: a separate job, because pushing 60 untouched nights to reach it
  -- would be worse than pushing twice.
  INSERT INTO public.daily_rate_overrides
    (hotel_id, room_type_id, rate_plan_id, date, occupancy, price, price_minor)
  VALUES (v_hotel, v_rt, v_plan, current_date + 100, 0, 300.00, 30000);

  SELECT count(*) INTO v_jobs FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  IF v_jobs <> 2 THEN
    RAISE EXCEPTION 'FAIL 3: a night 60 days clear of the window left % job(s)', v_jobs;
  END IF;

  -- An UPDATE fires both halves of the trigger, and a DELETE fires the old half:
  -- neither may invent a job for nights already queued.
  UPDATE public.daily_rate_overrides SET price = 285.00, price_minor = 28500
   WHERE hotel_id = v_hotel AND rate_plan_id = v_plan AND date = current_date + 25;
  DELETE FROM public.daily_rate_overrides
   WHERE hotel_id = v_hotel AND rate_plan_id = v_plan AND date = current_date + 40;

  SELECT count(*) INTO v_jobs FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  IF v_jobs <> 2 THEN
    RAISE EXCEPTION 'FAIL 3: update and delete inside the window left % job(s)', v_jobs;
  END IF;

  RAISE NOTICE 'PASS 3: overlapping and adjacent writes merge, distant writes queue separately';
END $$;

-- ── 4: the queue is clamped to what a channel can still be told ──────────────
--
-- Nothing before today can be sold, and no OTA accepts inventory past its
-- horizon, so a job outside [today, today + 400] is not shortened — it is not
-- created. A statement that straddles the edge keeps the half that is sellable.
DO $$
DECLARE
  v_hotel uuid := 'f0f0f0f0-0000-4000-8000-00000000000a';
  v_rt    uuid := 'f1f1f1f1-0000-4000-8000-000000000001';
  v_plan  uuid;
  v_jobs  int;
  v_from  date;
  v_to    date;
BEGIN
  SELECT id INTO v_plan FROM public.rate_plans
   WHERE hotel_id = v_hotel AND room_type_id = v_rt AND is_default;

  DELETE FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  INSERT INTO public.daily_rate_overrides
    (hotel_id, room_type_id, rate_plan_id, date, occupancy, price, price_minor)
  SELECT v_hotel, v_rt, v_plan, current_date - n, 0, 200.00, 20000
  FROM generate_series(6, 10) n;

  SELECT count(*) INTO v_jobs FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  IF v_jobs <> 0 THEN
    RAISE EXCEPTION 'FAIL 4: correcting last week''s rates queued % job(s)', v_jobs;
  END IF;

  DELETE FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  INSERT INTO public.daily_rate_overrides
    (hotel_id, room_type_id, rate_plan_id, date, occupancy, price, price_minor)
  SELECT v_hotel, v_rt, v_plan, current_date + n, 0, 210.00, 21000
  FROM generate_series(-3, 2) n;

  SELECT date_from, date_to INTO v_from, v_to
  FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  IF v_from <> current_date OR v_to <> current_date + 2 THEN
    RAISE EXCEPTION 'FAIL 4: a window straddling today queued % .. %', v_from, v_to;
  END IF;

  DELETE FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  INSERT INTO public.daily_rate_overrides
    (hotel_id, room_type_id, rate_plan_id, date, occupancy, price, price_minor)
  SELECT v_hotel, v_rt, v_plan, current_date + n, 0, 220.00, 22000
  FROM generate_series(390, 500) n;

  SELECT date_from, date_to INTO v_from, v_to
  FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  IF v_from <> current_date + 390 OR v_to <> current_date + 400 THEN
    RAISE EXCEPTION 'FAIL 4: a window past the horizon queued % .. %', v_from, v_to;
  END IF;

  RAISE NOTICE 'PASS 4: past nights queue nothing, and a straddling window keeps only the sellable half';
END $$;

-- ── 5: a maintenance block queues blocked nights, not the stored range ───────
--
-- availability_blocks.end_date is exclusive, so the last night a channel must
-- stop selling is end_date - 1; pushing the extra night closes a room that is in
-- fact free that evening. The table also carries no room_type_id — the target is
-- recovered by joining rooms — so two blocks on two rooms of one type are one job.
DO $$
DECLARE
  v_hotel uuid := 'f0f0f0f0-0000-4000-8000-00000000000a';
  v_rt    uuid := 'f1f1f1f1-0000-4000-8000-000000000001';
  v_jobs  int;
  v_row   public.ari_sync_outbox;
BEGIN
  DELETE FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;

  INSERT INTO public.availability_blocks
    (hotel_id, room_id, start_date, end_date, reason) VALUES
    (v_hotel, 'f2f2f2f2-0000-4000-8000-000000000001',
     current_date + 50, current_date + 53, 'maintenance'),
    (v_hotel, 'f2f2f2f2-0000-4000-8000-000000000002',
     current_date + 51, current_date + 52, 'maintenance');

  SELECT count(*) INTO v_jobs FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  IF v_jobs <> 1 THEN
    RAISE EXCEPTION 'FAIL 5: two blocks on one room type queued % job(s)', v_jobs;
  END IF;

  SELECT * INTO v_row FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  IF v_row.room_type_id <> v_rt THEN
    RAISE EXCEPTION 'FAIL 5: the job targets room type %, not the one behind the rooms',
      v_row.room_type_id;
  END IF;
  IF v_row.date_from <> current_date + 50 OR v_row.date_to <> current_date + 52 THEN
    RAISE EXCEPTION 'FAIL 5: blocked nights queued as % .. %, not the three nights held',
      v_row.date_from, v_row.date_to;
  END IF;
  IF v_row.rate_plan_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 5: an availability change named a rate plan';
  END IF;

  RAISE NOTICE 'PASS 5: a block queues only its blocked nights, keyed to the room type behind the room';
END $$;

-- ── 6: a restriction queues the room type its plan belongs to ────────────────
--
-- rate_restrictions hangs off a rate plan and carries no room_type_id, so the
-- trigger looks the type up. A job with the wrong target would push somebody
-- else's inventory a minimum stay it never set.
DO $$
DECLARE
  v_hotel uuid := 'f0f0f0f0-0000-4000-8000-00000000000a';
  v_rt    uuid := 'f1f1f1f1-0000-4000-8000-000000000001';
  v_plan  uuid;
  v_jobs  int;
  v_row   public.ari_sync_outbox;
BEGIN
  SELECT id INTO v_plan FROM public.rate_plans
   WHERE hotel_id = v_hotel AND room_type_id = v_rt AND is_default;

  DELETE FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;

  INSERT INTO public.rate_restrictions
    (hotel_id, rate_plan_id, date, min_stay)
  SELECT v_hotel, v_plan, current_date + n, 2
  FROM generate_series(60, 64) n;

  SELECT count(*) INTO v_jobs FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  IF v_jobs <> 1 THEN
    RAISE EXCEPTION 'FAIL 6: five restricted nights queued % job(s)', v_jobs;
  END IF;

  SELECT * INTO v_row FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  IF v_row.room_type_id <> v_rt OR v_row.rate_plan_id <> v_plan THEN
    RAISE EXCEPTION 'FAIL 6: job targets room type %, plan %',
      v_row.room_type_id, v_row.rate_plan_id;
  END IF;
  IF v_row.date_from <> current_date + 60 OR v_row.date_to <> current_date + 64 THEN
    RAISE EXCEPTION 'FAIL 6: restricted window queued as % .. %',
      v_row.date_from, v_row.date_to;
  END IF;

  RAISE NOTICE 'PASS 6: restricted nights queue one job carrying both the plan and its room type';
END $$;

-- ── 7: a season dirties every room type, and its end date is inclusive ───────
--
-- A season carries no room type, so the job carries none either: the whole hotel
-- is re-projected. And seasonal_rates.end_date is the last night of the season,
-- unlike availability_blocks and bookings — so it is queued unchanged. Shifting
-- it by a day here would leave the season's final night priced at base rate on
-- every OTA.
DO $$
DECLARE
  v_hotel uuid := 'f0f0f0f0-0000-4000-8000-00000000000a';
  v_jobs  int;
  v_row   public.ari_sync_outbox;
BEGIN
  DELETE FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;

  INSERT INTO public.seasonal_rates (id, hotel_id, name, start_date, end_date) VALUES
    ('f3f3f3f3-0000-4000-8000-000000000001', v_hotel, 'Probe Season',
     current_date + 70, current_date + 75);

  SELECT count(*) INTO v_jobs FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  IF v_jobs <> 1 THEN
    RAISE EXCEPTION 'FAIL 7: creating a season queued % job(s)', v_jobs;
  END IF;

  SELECT * INTO v_row FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  IF v_row.room_type_id IS NOT NULL OR v_row.rate_plan_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 7: a hotel-wide season queued a job scoped to type %, plan %',
      v_row.room_type_id, v_row.rate_plan_id;
  END IF;
  IF v_row.date_from <> current_date + 70 OR v_row.date_to <> current_date + 75 THEN
    RAISE EXCEPTION 'FAIL 7: season queued as % .. %, not its own inclusive dates',
      v_row.date_from, v_row.date_to;
  END IF;

  RAISE NOTICE 'PASS 7: a season queues one unscoped job over its own inclusive dates';
END $$;

-- ── 8: a seasonal price takes its dates from the season it belongs to ────────
--
-- The override row itself holds no dates at all. The trigger reads them off
-- seasonal_rates, which is the only reason a price change confined to one room
-- type can be queued for the right nights instead of the whole horizon.
DO $$
DECLARE
  v_hotel uuid := 'f0f0f0f0-0000-4000-8000-00000000000a';
  v_rt    uuid := 'f1f1f1f1-0000-4000-8000-000000000001';
  v_plan  uuid;
  v_jobs  int;
  v_row   public.ari_sync_outbox;
BEGIN
  SELECT id INTO v_plan FROM public.rate_plans
   WHERE hotel_id = v_hotel AND room_type_id = v_rt AND is_default;

  DELETE FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;

  INSERT INTO public.seasonal_rate_overrides
    (hotel_id, seasonal_rate_id, room_type_id, rate_plan_id, occupancy,
     base_price, base_price_minor, weekend_price, weekend_price_minor) VALUES
    (v_hotel, 'f3f3f3f3-0000-4000-8000-000000000001', v_rt, v_plan, 0,
     260.00, 26000, 290.00, 29000);

  SELECT count(*) INTO v_jobs FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  IF v_jobs <> 1 THEN
    RAISE EXCEPTION 'FAIL 8: a seasonal price queued % job(s)', v_jobs;
  END IF;

  SELECT * INTO v_row FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  IF v_row.room_type_id <> v_rt OR v_row.rate_plan_id <> v_plan THEN
    RAISE EXCEPTION 'FAIL 8: job targets room type %, plan %',
      v_row.room_type_id, v_row.rate_plan_id;
  END IF;
  IF v_row.date_from <> current_date + 70 OR v_row.date_to <> current_date + 75 THEN
    RAISE EXCEPTION 'FAIL 8: the override queued % .. % instead of its season''s dates',
      v_row.date_from, v_row.date_to;
  END IF;

  RAISE NOTICE 'PASS 8: a seasonal price queues its season''s dates, scoped to one room type';
END $$;

-- ── 9: a stay dirties the nights it occupies, and giving it back dirties them ─
--
-- bookings.check_out is exclusive: the guest is gone that morning and the night
-- is sellable, so the job stops at check_out - 1. Queueing the departure night
-- would close a room that is free. The UPDATE trigger matters just as much as the
-- INSERT one — a cancellation hands inventory back, and an OTA that is not told
-- keeps a room off sale for nothing.
DO $$
DECLARE
  v_hotel uuid := 'f0f0f0f0-0000-4000-8000-00000000000a';
  v_rt    uuid := 'f1f1f1f1-0000-4000-8000-000000000001';
  v_jobs  int;
  v_row   public.ari_sync_outbox;
BEGIN
  DELETE FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;

  -- source 'manual', not 'direct': the desk is allowed to sell what the public
  -- funnel is refused, and this case is about the queue, not that guard.
  INSERT INTO public.bookings
    (id, hotel_id, room_type_id, reference, check_in, check_out,
     room_rate, subtotal, total_amount, status, source) VALUES
    ('f4f4f4f4-0000-4000-8000-000000000001', v_hotel, v_rt, 'PROBE-CD-0001',
     current_date + 80, current_date + 83, 200.00, 600.00, 600.00,
     'confirmed', 'manual');

  SELECT * INTO v_row FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  IF v_row.room_type_id <> v_rt THEN
    RAISE EXCEPTION 'FAIL 9: the stay queued room type %', v_row.room_type_id;
  END IF;
  IF v_row.date_from <> current_date + 80 OR v_row.date_to <> current_date + 82 THEN
    RAISE EXCEPTION 'FAIL 9: three nights sold queued as % .. %',
      v_row.date_from, v_row.date_to;
  END IF;

  DELETE FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  UPDATE public.bookings SET status = 'cancelled'
   WHERE id = 'f4f4f4f4-0000-4000-8000-000000000001';

  SELECT count(*) INTO v_jobs FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  IF v_jobs <> 1 THEN
    RAISE EXCEPTION 'FAIL 9: cancelling a stay queued % job(s)', v_jobs;
  END IF;
  SELECT * INTO v_row FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;
  IF v_row.date_from <> current_date + 80 OR v_row.date_to <> current_date + 82 THEN
    RAISE EXCEPTION 'FAIL 9: the cancelled nights queued as % .. %',
      v_row.date_from, v_row.date_to;
  END IF;

  RAISE NOTICE 'PASS 9: a stay and its cancellation both queue the nights actually occupied';
END $$;

-- ── 10: the projection a worker would actually send ──────────────────────────
--
-- ari_snapshot is the read a pusher runs against an outbox row, so it is handed
-- date_from/date_to unchanged and p_to is inclusive: dropping the last night
-- would leave the far edge of every window stale at the OTA. It must also agree
-- with the two functions it wraps — an availability of 2 because two rooms exist
-- — and return our 0-means-cleared maximum as NULL rather than as a zero-night
-- ceiling no channel would accept.
DO $$
DECLARE
  v_hotel uuid := 'f0f0f0f0-0000-4000-8000-00000000000a';
  v_plan  uuid;
  v_rows  int;
  v_avail int;
  v_min   int;
  v_stop  int;
  v_last  date;
  v_max61 smallint;
  v_max62 smallint;
  v_out   int;
BEGIN
  SELECT id INTO v_plan FROM public.rate_plans
   WHERE hotel_id = v_hotel AND is_default;

  -- Case 6 left a minimum on five nights; give one night a cleared maximum and
  -- another a real one, so the two are told apart rather than both read as unset.
  UPDATE public.rate_restrictions SET max_stay = 0
   WHERE hotel_id = v_hotel AND rate_plan_id = v_plan AND date = current_date + 61;
  UPDATE public.rate_restrictions SET max_stay = 7, stop_sell = true
   WHERE hotel_id = v_hotel AND rate_plan_id = v_plan AND date = current_date + 62;

  SELECT count(*), max(s.stay_date),
         count(*) FILTER (WHERE s.availability = 2),
         count(*) FILTER (WHERE s.min_stay = 2),
         count(*) FILTER (WHERE s.stop_sell)
    INTO v_rows, v_last, v_avail, v_min, v_stop
  FROM public.ari_snapshot(v_hotel, current_date + 60, current_date + 64) s;

  IF v_rows <> 5 OR v_last <> current_date + 64 THEN
    RAISE EXCEPTION 'FAIL 10: an inclusive five-night window projected % row(s) ending %',
      v_rows, v_last;
  END IF;
  IF v_avail <> 5 THEN
    RAISE EXCEPTION 'FAIL 10: only % of 5 nights count the two rooms that exist', v_avail;
  END IF;
  IF v_min <> 5 OR v_stop <> 1 THEN
    RAISE EXCEPTION 'FAIL 10: % night(s) carry the minimum and % are stopped', v_min, v_stop;
  END IF;

  SELECT max(s.max_stay) FILTER (WHERE s.stay_date = current_date + 61),
         max(s.max_stay) FILTER (WHERE s.stay_date = current_date + 62)
    INTO v_max61, v_max62
  FROM public.ari_snapshot(v_hotel, current_date + 60, current_date + 64) s;
  IF v_max61 IS NOT NULL OR v_max62 <> 7 THEN
    RAISE EXCEPTION 'FAIL 10: a cleared maximum came back as % and a real one as %',
      v_max61, v_max62;
  END IF;

  -- The restriction join is a LEFT one: an unrestricted night must come back
  -- undecorated, not inherit the neighbour that happens to have controls.
  SELECT count(*) INTO v_out
  FROM public.ari_snapshot(v_hotel, current_date + 65, current_date + 66) s
  WHERE s.min_stay IS NOT NULL OR s.stop_sell OR s.closed_to_arrival;
  IF v_out <> 0 THEN
    RAISE EXCEPTION 'FAIL 10: % unrestricted night(s) came back decorated', v_out;
  END IF;

  RAISE NOTICE 'PASS 10: the projection covers both edges, counts both rooms, and reads 0 as no maximum';
END $$;

-- ── 11: a worker claims due work once, and only work that is due ─────────────
--
-- Two workers on one queue must never both push the same window: whichever lost
-- the race would send a snapshot it read before the other's write. claim_ari_jobs
-- flips the rows it hands out to 'processing' in the same statement that selects
-- them, so a second caller finds nothing. It also leaves alone what is not due —
-- a backed-off retry, and anything already sent or dead-lettered.
DO $$
DECLARE
  v_hotel uuid := 'f0f0f0f0-0000-4000-8000-00000000000a';
  v_rt    uuid := 'f1f1f1f1-0000-4000-8000-000000000001';
  v_first int;
  v_again int;
  v_state int;
  v_one   int;
BEGIN
  DELETE FROM public.ari_sync_outbox WHERE hotel_id = v_hotel;

  INSERT INTO public.ari_sync_outbox
    (hotel_id, room_type_id, date_from, date_to, status, next_attempt_at) VALUES
    (v_hotel, v_rt, current_date + 1, current_date + 2, 'pending', now()),
    (v_hotel, v_rt, current_date + 3, current_date + 4, 'retry',
     now() - interval '1 minute'),
    (v_hotel, v_rt, current_date + 5, current_date + 6, 'pending',
     now() + interval '1 hour'),
    (v_hotel, v_rt, current_date + 7, current_date + 8, 'sent', now()),
    (v_hotel, v_rt, current_date + 9, current_date + 10, 'dead_letter', now());

  SELECT count(*) INTO v_first
  FROM public.claim_ari_jobs(50) j WHERE j.hotel_id = v_hotel;
  IF v_first <> 2 THEN
    RAISE EXCEPTION 'FAIL 11: of five rows with two due, % were claimed', v_first;
  END IF;

  SELECT count(*) INTO v_state FROM public.ari_sync_outbox
   WHERE hotel_id = v_hotel AND status = 'processing' AND locked_at IS NOT NULL;
  IF v_state <> 2 THEN
    RAISE EXCEPTION 'FAIL 11: % claimed row(s) read as processing and locked', v_state;
  END IF;

  SELECT count(*) INTO v_again
  FROM public.claim_ari_jobs(50) j WHERE j.hotel_id = v_hotel;
  IF v_again <> 0 THEN
    RAISE EXCEPTION 'FAIL 11: a second worker claimed % of the same job(s)', v_again;
  END IF;

  -- A limit of zero is clamped up to one, not down to nothing: a worker that
  -- computed its batch size and got zero would otherwise poll forever, doing no
  -- work while the queue grew behind it.
  UPDATE public.ari_sync_outbox SET status = 'pending', locked_at = NULL
   WHERE hotel_id = v_hotel AND status = 'processing';
  SELECT count(*) INTO v_one
  FROM public.claim_ari_jobs(0) j WHERE j.hotel_id = v_hotel;
  IF v_one <> 1 THEN
    RAISE EXCEPTION 'FAIL 11: a limit of zero claimed % job(s)', v_one;
  END IF;

  RAISE NOTICE 'PASS 11: due work is claimed once; backed-off and finished work is left alone';
END $$;

ROLLBACK;
