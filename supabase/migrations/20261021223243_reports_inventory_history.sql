-- Reporting inventory is closing ACTIVE PHYSICAL inventory, not sellable rooms.
-- Maintenance/OOS/blocks do not change this denominator. Only room creation,
-- deletion, activation and room-type reassignment do. No historical backfill:
-- the first observed property date is the explicit baseline. Within that date
-- later changes replace the closing snapshot; previous dates remain untouched.
BEGIN;

CREATE SCHEMA IF NOT EXISTS reports_private;
REVOKE ALL ON SCHEMA reports_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.reports_inventory_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  effective_date date NOT NULL,
  capacity_by_type jsonb NOT NULL CHECK (jsonb_typeof(capacity_by_type) = 'object'),
  time_zone text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT reports_inventory_history_hotel_date_key UNIQUE (hotel_id, effective_date)
);
COMMENT ON TABLE public.reports_inventory_history IS
  'Dated closing active-physical-room inventory by room-type UUID. First row is the observation baseline, never evidence of earlier capacity. Carried forward until the next snapshot. Current-day row can change until the local day ends; maintenance/OOS/blocks remain in physical capacity.';
ALTER TABLE public.reports_inventory_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY reports_inventory_active_staff_read ON public.reports_inventory_history
  FOR SELECT TO authenticated
  USING (public.user_role_at_least(hotel_id, 'read_only'));
REVOKE ALL ON public.reports_inventory_history FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.reports_inventory_history TO authenticated, service_role;

-- Only private trigger code may capture snapshots; no API mutation privileges.
CREATE FUNCTION reports_private.capture_inventory(p_hotel_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_zone text;
  v_date date;
  v_last_date date;
  v_capacity jsonb;
BEGIN
  SELECT h.timezone INTO v_zone FROM public.hotels h WHERE h.id = p_hotel_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF; -- parent hotel deletion
  IF v_zone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_zone) THEN
    RAISE EXCEPTION 'Cannot capture reporting inventory: hotel timezone is missing or invalid';
  END IF;
  v_date := (clock_timestamp() AT TIME ZONE v_zone)::date;
  SELECT max(effective_date) INTO v_last_date FROM public.reports_inventory_history WHERE hotel_id = p_hotel_id;
  -- A westward timezone change must not rewrite the previous calendar date.
  -- The new timezone baseline starts no earlier than the latest recorded date.
  v_date := greatest(v_date, coalesce(v_last_date, v_date));
  SELECT coalesce(jsonb_object_agg(room_type_id::text, capacity), '{}'::jsonb)
    INTO v_capacity
    FROM (SELECT r.room_type_id, count(*)::integer AS capacity FROM public.rooms r
           WHERE r.hotel_id = p_hotel_id AND r.is_active IS TRUE GROUP BY r.room_type_id) counts;
  INSERT INTO public.reports_inventory_history (hotel_id, effective_date, capacity_by_type, time_zone)
  VALUES (p_hotel_id, v_date, v_capacity, v_zone)
  ON CONFLICT (hotel_id, effective_date) DO UPDATE
    SET capacity_by_type = EXCLUDED.capacity_by_type, time_zone = EXCLUDED.time_zone,
        captured_at = clock_timestamp();
END;
$$;

-- Acquire the hotel lock BEFORE changing a room. This serializes concurrent room
-- writers so the subsequent closing snapshot includes preceding committed writes.
CREATE FUNCTION reports_private.lock_room_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    PERFORM id FROM public.hotels WHERE id IN (OLD.hotel_id, NEW.hotel_id) ORDER BY id FOR UPDATE;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM id FROM public.hotels WHERE id = OLD.hotel_id FOR UPDATE;
  ELSE
    PERFORM id FROM public.hotels WHERE id = NEW.hotel_id FOR UPDATE;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION reports_private.capture_room_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM reports_private.capture_inventory(OLD.hotel_id);
  ELSE
    PERFORM reports_private.capture_inventory(NEW.hotel_id);
    IF TG_OP = 'UPDATE' AND OLD.hotel_id IS DISTINCT FROM NEW.hotel_id THEN
      PERFORM reports_private.capture_inventory(OLD.hotel_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE FUNCTION reports_private.capture_hotel_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM reports_private.capture_inventory(NEW.id);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION reports_private.capture_inventory(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION reports_private.lock_room_inventory() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION reports_private.capture_room_inventory() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION reports_private.capture_hotel_inventory() FROM PUBLIC, anon, authenticated, service_role;

-- Block room writers during the initial snapshot; a partial baseline would be
-- indistinguishable from true zero capacity. This migration requires a brief lock.
LOCK TABLE public.rooms IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.hotels IN SHARE ROW EXCLUSIVE MODE;
CREATE TRIGGER reports_inventory_room_lock
  BEFORE INSERT OR DELETE OR UPDATE OF hotel_id, room_type_id, is_active ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION reports_private.lock_room_inventory();
CREATE TRIGGER reports_inventory_room_capture
  AFTER INSERT OR DELETE OR UPDATE OF hotel_id, room_type_id, is_active ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION reports_private.capture_room_inventory();
CREATE TRIGGER reports_inventory_hotel_capture
  AFTER INSERT OR UPDATE OF timezone ON public.hotels
  FOR EACH ROW EXECUTE FUNCTION reports_private.capture_hotel_inventory();
DO $$
DECLARE v_hotel uuid;
BEGIN
  FOR v_hotel IN SELECT id FROM public.hotels ORDER BY id LOOP
    PERFORM reports_private.capture_inventory(v_hotel);
  END LOOP;
END;
$$;

COMMIT;
