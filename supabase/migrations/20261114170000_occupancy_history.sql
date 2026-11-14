-- Occupancy for past nights.
--
-- The dashboard could only show occupancy for today and later: rooms.status
-- and availability_blocks hold the current state, and a past night needs the
-- state as it was. Physical capacity per date is already recorded
-- (reports_inventory_history) and sold rooms come from the bookings
-- themselves. What was missing is when a room was out of service and which
-- blocks existed, so this records both as system-versioned history: one row
-- per period, closed when the state changes, written by triggers. That makes
-- the state at any past instant exact from now on, with no scheduled job to
-- miss a day.
--
-- Only an active room has a status period, because capacity
-- (reports_inventory_history) counts active rooms only. Deactivating or
-- deleting a room closes its period; reactivating opens a new one.
--
-- Earlier periods are rebuilt once from audit_logs:
--   * Room status: every audited status change (room.status_changed, and
--     room.updated when it carried a status). Before a room's first change it
--     held that change's "before" status; after the last change it held the
--     "after" status. Check-in and check-out move rooms between available and
--     occupied without an audit row, so a room's last audited status may not
--     be its current one. That unaudited change happened no later than
--     rooms.updated_at (any later write moves it again), so the last audited
--     period closes there and today's status starts there. A room that is
--     inactive today has no open period; its last period also closes at
--     updated_at.
--   * Blocks: current rows from their created_at, earlier ranges from
--     room.block_updated, and deleted blocks from room.block_deleted. A
--     deleted block's start comes from the room.block_created row with its
--     first known range (the first update's "before" range, else its final
--     range).
--   * A block_range that cannot be read as two dates is skipped, never fatal.
-- Rows from the rebuild are marked by `source` so they can be told apart.
BEGIN;

-- Give up rather than queue behind a long transaction.
SET LOCAL lock_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS reports_private;
REVOKE ALL ON SCHEMA reports_private FROM PUBLIC, anon, authenticated, service_role;

-- ── Room status periods ──────────────────────────────────────────────────
CREATE TABLE public.room_status_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  -- No FK: a room's history outlives the room, as its counted capacity does.
  room_id uuid NOT NULL,
  status text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  source text NOT NULL CHECK (source IN ('recorded', 'audit_log', 'baseline')),
  CONSTRAINT room_status_history_period CHECK (valid_to IS NULL OR valid_to > valid_from)
);
COMMENT ON TABLE public.room_status_history IS
  'Room status by period [valid_from, valid_to). One open period per active room; inactive and deleted rooms have none. Written by trigger; rows before 20261114170000 rebuilt from audit_logs (source audit_log/baseline).';
CREATE UNIQUE INDEX room_status_history_open_key ON public.room_status_history (room_id) WHERE valid_to IS NULL;
CREATE INDEX room_status_history_hotel_period_idx ON public.room_status_history (hotel_id, valid_from, valid_to);

-- ── Availability block versions ──────────────────────────────────────────
CREATE TABLE public.availability_block_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  -- No FK: deleted blocks keep their history.
  block_id uuid NOT NULL,
  room_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  source text NOT NULL CHECK (source IN ('recorded', 'current_row', 'audit_log')),
  CONSTRAINT availability_block_history_dates CHECK (end_date > start_date),
  CONSTRAINT availability_block_history_period CHECK (valid_to IS NULL OR valid_to > valid_from)
);
COMMENT ON TABLE public.availability_block_history IS
  'Each version of an availability block, live over [valid_from, valid_to). Deleted blocks keep their closed versions. Written by trigger; rows before 20261114170000 rebuilt from current rows and audit_logs.';
CREATE UNIQUE INDEX availability_block_history_open_key ON public.availability_block_history (block_id) WHERE valid_to IS NULL;
CREATE INDEX availability_block_history_hotel_dates_idx ON public.availability_block_history (hotel_id, start_date, end_date);

-- Staff read their own hotel's history; nobody writes it through the API.
ALTER TABLE public.room_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_block_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY room_status_history_staff_read ON public.room_status_history
  FOR SELECT TO authenticated USING (public.user_role_at_least(hotel_id, 'read_only'));
CREATE POLICY availability_block_history_staff_read ON public.availability_block_history
  FOR SELECT TO authenticated USING (public.user_role_at_least(hotel_id, 'read_only'));
REVOKE ALL ON public.room_status_history, public.availability_block_history FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.room_status_history, public.availability_block_history TO authenticated, service_role;

-- ── Recording triggers ───────────────────────────────────────────────────
-- clock_timestamp() so two changes in one transaction get ordered periods.
-- A period that would have zero length (same instant) is replaced instead.
CREATE FUNCTION reports_private.record_room_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_room uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.hotel_id IS NOT DISTINCT FROM NEW.hotel_id
     AND (OLD.is_active IS TRUE) = (NEW.is_active IS TRUE) THEN
    RETURN NULL;
  END IF;
  UPDATE public.room_status_history SET valid_to = v_now
   WHERE room_id = v_room AND valid_to IS NULL AND valid_from < v_now;
  DELETE FROM public.room_status_history WHERE room_id = v_room AND valid_to IS NULL;
  -- Deleted and inactive rooms are outside capacity, so they hold no period.
  IF TG_OP <> 'DELETE' AND NEW.is_active IS TRUE THEN
    INSERT INTO public.room_status_history (hotel_id, room_id, status, valid_from, source)
    VALUES (NEW.hotel_id, NEW.id, NEW.status, v_now, 'recorded');
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION reports_private.record_availability_block()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_block uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.room_id IS NOT DISTINCT FROM NEW.room_id
     AND OLD.start_date IS NOT DISTINCT FROM NEW.start_date
     AND OLD.end_date IS NOT DISTINCT FROM NEW.end_date
     AND OLD.hotel_id IS NOT DISTINCT FROM NEW.hotel_id THEN
    RETURN NULL;
  END IF;
  UPDATE public.availability_block_history SET valid_to = v_now
   WHERE block_id = v_block AND valid_to IS NULL AND valid_from < v_now;
  DELETE FROM public.availability_block_history WHERE block_id = v_block AND valid_to IS NULL;
  IF TG_OP <> 'DELETE' THEN
    INSERT INTO public.availability_block_history
      (hotel_id, block_id, room_id, start_date, end_date, valid_from, source)
    VALUES (NEW.hotel_id, NEW.id, NEW.room_id, NEW.start_date, NEW.end_date, v_now, 'recorded');
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION reports_private.record_room_status() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION reports_private.record_availability_block() FROM PUBLIC, anon, authenticated, service_role;

-- Hold writers while the triggers go in and the history is rebuilt, so no
-- change lands between the rebuild and the first recorded period.
LOCK TABLE public.rooms IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.availability_blocks IN SHARE ROW EXCLUSIVE MODE;

CREATE TRIGGER room_status_history_record
  AFTER INSERT OR DELETE OR UPDATE OF status, hotel_id, is_active ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION reports_private.record_room_status();
CREATE TRIGGER availability_block_history_record
  AFTER INSERT OR DELETE OR UPDATE OF room_id, start_date, end_date, hotel_id ON public.availability_blocks
  FOR EACH ROW EXECUTE FUNCTION reports_private.record_availability_block();

-- ── Rebuild: room status ─────────────────────────────────────────────────
CREATE TEMP TABLE _rebuild_now ON COMMIT DROP AS SELECT clock_timestamp() AS at;

WITH ev AS (
  SELECT r.id AS room_id, r.hotel_id, a.created_at AS at, a.id AS audit_id,
         a.before_state->>'status' AS before_status,
         a.after_state->>'status' AS after_status
    FROM public.audit_logs a
    JOIN public.rooms r ON r.id = a.entity_id AND r.hotel_id = a.hotel_id
   WHERE a.action IN ('room.status_changed', 'room.updated')
     AND a.created_at IS NOT NULL
     AND a.after_state ? 'status'
     AND a.after_state->>'status' IS NOT NULL
     AND (a.before_state->>'status') IS DISTINCT FROM (a.after_state->>'status')
     AND a.created_at > coalesce(r.created_at, '-infinity'::timestamptz)
), ordered AS (
  SELECT ev.*,
         lead(ev.at) OVER w AS next_at,
         row_number() OVER w AS n,
         count(*) OVER (PARTITION BY ev.room_id) AS total
    FROM ev
  WINDOW w AS (PARTITION BY ev.room_id ORDER BY ev.at, ev.audit_id)
), last_seen AS (
  -- Where a room's last known period ends when it does not run on: the
  -- unaudited change (or deactivation) happened after that period began and
  -- no later than rooms.updated_at. Fall back to now when updated_at gives
  -- no usable bound.
  SELECT r.id AS room_id, r.hotel_id, r.status, (r.is_active IS TRUE) AS active,
         coalesce(r.created_at, h.created_at, '-infinity'::timestamptz) AS born,
         (SELECT o.at FROM ordered o WHERE o.room_id = r.id AND o.n = o.total) AS last_at,
         (SELECT o.after_status FROM ordered o WHERE o.room_id = r.id AND o.n = o.total) AS last_status,
         r.updated_at,
         n.at AS now_at
    FROM public.rooms r
    JOIN public.hotels h ON h.id = r.hotel_id
   CROSS JOIN _rebuild_now n
), bounds AS (
  SELECT s.*,
         CASE
           WHEN s.updated_at > coalesce(s.last_at, s.born) AND s.updated_at < s.now_at THEN s.updated_at
           ELSE s.now_at
         END AS stop_at
    FROM last_seen s
), periods AS (
  -- Before the first audited change: that change's "before" status.
  SELECT o.hotel_id, o.room_id, o.before_status AS status,
         b.born AS valid_from, o.at AS valid_to, 'audit_log' AS source
    FROM ordered o
    JOIN bounds b ON b.room_id = o.room_id
   WHERE o.n = 1 AND o.before_status IS NOT NULL
  UNION ALL
  -- Each audited change until the next one. The last runs on only while it
  -- is the status of an active room today.
  SELECT o.hotel_id, o.room_id, o.after_status,
         o.at,
         CASE
           WHEN o.next_at IS NOT NULL THEN o.next_at
           WHEN o.after_status = b.status AND b.active THEN NULL
           ELSE b.stop_at
         END,
         'audit_log'
    FROM ordered o
    JOIN bounds b ON b.room_id = o.room_id
  UNION ALL
  -- An active room whose last audited status differs from today's: today's
  -- starts where the last audited one stops.
  SELECT b.hotel_id, b.room_id, b.status, b.stop_at, NULL, 'baseline'
    FROM bounds b
   WHERE b.active AND b.last_at IS NOT NULL AND b.last_status IS DISTINCT FROM b.status
  UNION ALL
  -- Never audited: today's status since the room was created (until its
  -- last write, when it is inactive today).
  SELECT b.hotel_id, b.room_id, b.status, b.born,
         CASE WHEN b.active THEN NULL ELSE b.stop_at END, 'baseline'
    FROM bounds b
   WHERE b.last_at IS NULL
)
INSERT INTO public.room_status_history (hotel_id, room_id, status, valid_from, valid_to, source)
SELECT hotel_id, room_id, status, valid_from, valid_to, source
  FROM periods
 WHERE valid_to IS NULL OR valid_to > valid_from;

-- ── Rebuild: availability blocks ─────────────────────────────────────────
-- One side of an audited "2026-08-27 → 2026-08-31" range, or NULL when the
-- text is not two real dates (an impossible date must not abort the rebuild).
-- Session-local: dropped when the migration's connection closes.
CREATE FUNCTION pg_temp.block_range_date(p_range text, p_part integer)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
BEGIN
  IF p_range IS NULL OR p_range !~ '^\d{4}-\d{2}-\d{2} → \d{4}-\d{2}-\d{2}$' THEN
    RETURN NULL;
  END IF;
  RETURN split_part(p_range, ' → ', p_part)::date;
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
  RETURN NULL;
END;
$$;

WITH ranges AS (
  -- Audited ranges look like "2026-08-27 → 2026-08-31".
  SELECT a.id AS audit_id, a.action, a.hotel_id, a.entity_id AS room_id, a.created_at AS at,
         nullif(a.after_state->>'block_id', '') AS block_id_text,
         a.before_state->>'block_range' AS before_range,
         a.after_state->>'block_range' AS after_range
    FROM public.audit_logs a
   WHERE a.action IN ('room.block_created', 'room.block_updated', 'room.block_deleted')
     AND a.created_at IS NOT NULL AND a.entity_id IS NOT NULL
), parsed AS (
  SELECT r.*,
         CASE WHEN r.block_id_text ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              THEN r.block_id_text::uuid END AS block_id,
         pg_temp.block_range_date(r.before_range, 1) AS before_start,
         pg_temp.block_range_date(r.before_range, 2) AS before_end,
         pg_temp.block_range_date(r.after_range, 1) AS after_start,
         pg_temp.block_range_date(r.after_range, 2) AS after_end
    FROM ranges r
), lineage AS (
  -- Every block we know of: current rows, plus deleted ones from the audit.
  SELECT b.id AS block_id, b.hotel_id, b.room_id, b.start_date AS final_start, b.end_date AS final_end,
         b.created_at AS born, NULL::timestamptz AS died, 'current_row' AS final_source
    FROM public.availability_blocks b
  UNION ALL
  -- block_created carries no block id, so match it by room and range: the
  -- range the block was created with is its first update's "before" range,
  -- or its final range when it was never updated.
  SELECT d.block_id, d.hotel_id, d.room_id, d.after_start, d.after_end,
         (SELECT max(c.at) FROM parsed c
           WHERE c.action = 'room.block_created' AND c.room_id = d.room_id
             AND c.hotel_id = d.hotel_id
             AND c.at < coalesce(f.at, d.at)
             AND c.after_start = coalesce(f.before_start, d.after_start)
             AND c.after_end = coalesce(f.before_end, d.after_end)),
         d.at, 'audit_log'
    FROM parsed d
    LEFT JOIN LATERAL (
      SELECT u.at, u.before_start, u.before_end
        FROM parsed u
       WHERE u.action = 'room.block_updated' AND u.block_id = d.block_id
         AND u.at < d.at AND u.before_start IS NOT NULL
       ORDER BY u.at, u.audit_id
       LIMIT 1
    ) f ON true
   WHERE d.action = 'room.block_deleted' AND d.block_id IS NOT NULL
     AND d.after_start IS NOT NULL AND d.after_end > d.after_start
     AND NOT EXISTS (SELECT 1 FROM public.availability_blocks b WHERE b.id = d.block_id)
), updates AS (
  SELECT u.block_id, u.at, u.audit_id, u.before_start, u.before_end, u.after_start, u.after_end,
         row_number() OVER w AS n, lead(u.at) OVER w AS next_at
    FROM parsed u
    JOIN lineage l ON l.block_id = u.block_id
   WHERE u.action = 'room.block_updated' AND u.block_id IS NOT NULL
     AND u.at > coalesce(l.born, '-infinity'::timestamptz)
     AND (l.died IS NULL OR u.at < l.died)
  WINDOW w AS (PARTITION BY u.block_id ORDER BY u.at, u.audit_id)
), versions AS (
  -- Before the first update: its "before" range.
  SELECT l.hotel_id, l.block_id, l.room_id, u.before_start AS start_date, u.before_end AS end_date,
         coalesce(l.born, '-infinity'::timestamptz) AS valid_from, u.at AS valid_to, 'audit_log' AS source
    FROM lineage l JOIN updates u ON u.block_id = l.block_id AND u.n = 1
   WHERE u.before_start IS NOT NULL
  UNION ALL
  -- Between updates: each update's "after" range.
  SELECT l.hotel_id, l.block_id, l.room_id, u.after_start, u.after_end, u.at, u.next_at, 'audit_log'
    FROM lineage l JOIN updates u ON u.block_id = l.block_id
   WHERE u.next_at IS NOT NULL AND u.after_start IS NOT NULL
  UNION ALL
  -- The final range, from the last update (or birth) until deletion or now.
  SELECT l.hotel_id, l.block_id, l.room_id, l.final_start, l.final_end,
         coalesce((SELECT max(u.at) FROM updates u WHERE u.block_id = l.block_id), l.born, '-infinity'::timestamptz),
         l.died, l.final_source
    FROM lineage l
)
INSERT INTO public.availability_block_history
  (hotel_id, block_id, room_id, start_date, end_date, valid_from, valid_to, source)
SELECT hotel_id, block_id, room_id, start_date, end_date, valid_from, valid_to, source
  FROM versions
 WHERE end_date > start_date AND (valid_to IS NULL OR valid_to > valid_from);

NOTIFY pgrst, 'reload schema';

COMMIT;
