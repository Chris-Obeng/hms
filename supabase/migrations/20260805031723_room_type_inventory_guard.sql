CREATE OR REPLACE FUNCTION public.assert_room_type_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  stay_date date;
  room_capacity integer;
  blocked_rooms integer;
  booked_rooms integer;
BEGIN
  IF NEW.room_type_id IS NULL
     OR NEW.status NOT IN ('pending', 'confirmed', 'checked_in') THEN
    RETURN NEW;
  END IF;

  IF NEW.check_out <= NEW.check_in THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'bookings_dates_valid',
      MESSAGE = 'Check-out must be after check-in';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.hotel_id::text || ':' || NEW.room_type_id::text, 0)
  );

  SELECT count(*)::integer
  INTO room_capacity
  FROM public.rooms r
  WHERE r.hotel_id = NEW.hotel_id
    AND r.room_type_id = NEW.room_type_id
    AND r.is_active = true
    AND r.status NOT IN ('maintenance', 'out_of_service');

  FOR stay_date IN
    SELECT generate_series(NEW.check_in, NEW.check_out - 1, interval '1 day')::date
  LOOP
    SELECT count(DISTINCT ab.room_id)::integer
    INTO blocked_rooms
    FROM public.availability_blocks ab
    JOIN public.rooms r ON r.id = ab.room_id
    WHERE r.hotel_id = NEW.hotel_id
      AND r.room_type_id = NEW.room_type_id
      AND r.is_active = true
      AND ab.start_date <= stay_date
      AND ab.end_date > stay_date;

    SELECT count(*)::integer
    INTO booked_rooms
    FROM public.bookings b
    WHERE b.hotel_id = NEW.hotel_id
      AND b.room_type_id = NEW.room_type_id
      AND b.id IS DISTINCT FROM NEW.id
      AND b.status IN ('pending', 'confirmed', 'checked_in')
      AND b.check_in <= stay_date
      AND b.check_out > stay_date;

    IF booked_rooms >= GREATEST(room_capacity - blocked_rooms, 0) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23P01',
        CONSTRAINT = 'bookings_room_type_inventory_guard',
        MESSAGE = format('No %s inventory available for %s', NEW.room_type_id, stay_date);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_room_type_inventory_guard ON public.bookings;
CREATE TRIGGER bookings_room_type_inventory_guard
BEFORE INSERT OR UPDATE OF hotel_id, room_type_id, check_in, check_out, status
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.assert_room_type_inventory();

CREATE OR REPLACE FUNCTION public.room_type_available_count(
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH stay_dates AS (
    SELECT generate_series(p_check_in, p_check_out - 1, interval '1 day')::date AS stay_date
  ),
  inventory AS (
    SELECT count(*)::integer AS room_capacity
    FROM public.rooms r
    WHERE r.room_type_id = p_room_type_id
      AND r.is_active = true
      AND r.status NOT IN ('maintenance', 'out_of_service')
  ),
  nightly AS (
    SELECT
      d.stay_date,
      i.room_capacity
        - (
            SELECT count(DISTINCT ab.room_id)::integer
            FROM public.availability_blocks ab
            JOIN public.rooms r ON r.id = ab.room_id
            WHERE r.room_type_id = p_room_type_id
              AND r.is_active = true
              AND ab.start_date <= d.stay_date
              AND ab.end_date > d.stay_date
          )
        - (
            SELECT count(*)::integer
            FROM public.bookings b
            WHERE b.room_type_id = p_room_type_id
              AND b.status IN ('pending', 'confirmed', 'checked_in')
              AND b.check_in <= d.stay_date
              AND b.check_out > d.stay_date
          ) AS available
    FROM stay_dates d
    CROSS JOIN inventory i
  )
  SELECT CASE
    WHEN p_check_out <= p_check_in THEN 0
    ELSE GREATEST(COALESCE(min(available), 0), 0)::integer
  END
  FROM nightly;
$$;

COMMENT ON FUNCTION public.room_type_available_count IS
  'Returns minimum sellable room-type inventory across every night, including assigned and unassigned bookings plus availability blocks.';

GRANT EXECUTE ON FUNCTION public.room_type_available_count(uuid, date, date)
TO anon, authenticated;

REVOKE ALL ON FUNCTION public.assert_room_type_inventory() FROM PUBLIC;