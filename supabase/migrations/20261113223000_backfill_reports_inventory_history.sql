-- Backfill reporting inventory for the dates before each hotel's first
-- snapshot, so occupancy and RevPAR can be reported for earlier periods.
--
-- 20261021223243 recorded inventory from its own run date onward and left
-- earlier capacity unknown. The room records can rebuild that history: a room
-- counts from the property-local date it was created. This holds only while
-- the rooms still match the first snapshot, so a hotel is backfilled only when:
--   * every room created on or before the first snapshot date is still active
--     (deactivation dates are not recorded, so an inactive room makes its
--     earlier history unknowable);
--   * the still-active rooms reproduce the first snapshot's per-type counts
--     exactly (a mismatch means a room changed type or was removed later);
--   * no audited edit before that date moved a room to another type.
-- Hotels that fail a check keep their unknown history and are reported with
-- a NOTICE. Rooms the app never deletes; room-type deletion cascades are
-- covered by the count check.
--
-- Rows are written for each date the room count changed (snapshots carry
-- forward), plus an empty inventory on the hotel's creation date when that
-- came before its first room. Existing rows are never changed. The migration
-- is idempotent: a second run finds nothing earlier to add.
BEGIN;

-- Hold room and hotel writers for the few statements below, as the baseline
-- migration did, so the rooms read here match the history written.
LOCK TABLE public.rooms IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.hotels IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  v_hotel record;
  v_first_date date;
  v_first_capacity jsonb;
  v_zone text;
  v_rebuilt jsonb;
  v_rows integer;
BEGIN
  FOR v_hotel IN SELECT h.id, h.created_at FROM public.hotels h ORDER BY h.id LOOP
    SELECT i.effective_date, i.capacity_by_type, i.time_zone
      INTO v_first_date, v_first_capacity, v_zone
      FROM public.reports_inventory_history i
     WHERE i.hotel_id = v_hotel.id
     ORDER BY i.effective_date
     LIMIT 1;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.rooms r
       WHERE r.hotel_id = v_hotel.id
         AND r.is_active IS NOT TRUE
         AND (r.created_at IS NULL OR (r.created_at AT TIME ZONE v_zone)::date <= v_first_date)
    ) THEN
      RAISE NOTICE 'reports inventory backfill skipped for hotel %: a room that existed by % is inactive now', v_hotel.id, v_first_date;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.audit_logs a
       WHERE a.hotel_id = v_hotel.id
         AND a.action = 'room.updated'
         AND (a.created_at AT TIME ZONE v_zone)::date <= v_first_date
         AND a.after_state ? 'roomTypeId'
         AND a.before_state ->> 'roomTypeId' IS DISTINCT FROM a.after_state ->> 'roomTypeId'
    ) THEN
      RAISE NOTICE 'reports inventory backfill skipped for hotel %: a room changed type by %', v_hotel.id, v_first_date;
      CONTINUE;
    END IF;

    SELECT coalesce(jsonb_object_agg(c.room_type_id::text, c.capacity), '{}'::jsonb)
      INTO v_rebuilt
      FROM (
        SELECT r.room_type_id, count(*)::integer AS capacity
          FROM public.rooms r
         WHERE r.hotel_id = v_hotel.id
           AND r.is_active IS TRUE
           AND (r.created_at AT TIME ZONE v_zone)::date <= v_first_date
         GROUP BY r.room_type_id
      ) c;
    IF v_rebuilt IS DISTINCT FROM v_first_capacity THEN
      RAISE NOTICE 'reports inventory backfill skipped for hotel %: rooms do not reproduce the % snapshot', v_hotel.id, v_first_date;
      CONTINUE;
    END IF;

    INSERT INTO public.reports_inventory_history (hotel_id, effective_date, capacity_by_type, time_zone)
    SELECT v_hotel.id,
           change.day,
           (SELECT coalesce(jsonb_object_agg(c.room_type_id::text, c.capacity), '{}'::jsonb)
              FROM (
                SELECT r.room_type_id, count(*)::integer AS capacity
                  FROM public.rooms r
                 WHERE r.hotel_id = v_hotel.id
                   AND r.is_active IS TRUE
                   AND (r.created_at AT TIME ZONE v_zone)::date <= change.day
                 GROUP BY r.room_type_id
              ) c),
           v_zone
      FROM (
        SELECT (r.created_at AT TIME ZONE v_zone)::date AS day
          FROM public.rooms r
         WHERE r.hotel_id = v_hotel.id AND r.is_active IS TRUE
        UNION
        SELECT (v_hotel.created_at AT TIME ZONE v_zone)::date
      ) change
     WHERE change.day IS NOT NULL
       AND change.day < v_first_date
    ON CONFLICT (hotel_id, effective_date) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      RAISE NOTICE 'reports inventory backfill: % dated rows before % for hotel %', v_rows, v_first_date, v_hotel.id;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON TABLE public.reports_inventory_history IS
  'Dated closing active-physical-room inventory by room-type UUID, carried forward until the next snapshot. Rows before a hotel''s first live capture were rebuilt once from room creation dates (20261113223000) where the rooms still matched that capture; captured_at shows when each row was written. Dates before the earliest row are unknown. Current-day row can change until the local day ends; maintenance/OOS/blocks remain in physical capacity.';

COMMIT;
