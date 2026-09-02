-- =============================================================================
-- Per-date availability primitive, and the oversell fix built on top of it.
--
-- THE BUG BEING FIXED
-- -------------------
-- `assert_room_type_inventory()` is the last line of defence against selling a
-- room twice. Three defects let it through today:
--
--   1. It counts booking ROWS (`count(*)`) while the read-side availability RPC
--      sums QUANTITIES (`sum(rooms_count)`). A single booking for 4 rooms counts
--      as 1 against capacity, so a 4-room property can be sold 4x over by four
--      multi-room bookings.
--   2. It compares `booked_rooms >= capacity - blocked` and ignores
--      `NEW.rooms_count` entirely, so a request for 3 rooms passes whenever
--      1 room is free.
--   3. It has no abandoned-payment-hold exclusion, so it disagrees with the
--      read side about what is available and can reject a legitimate booking
--      the search page just offered.
--
-- Two more, in the same code path:
--
--   4. The trigger's `UPDATE OF` list omits `rooms_count`, so raising the room
--      count on an existing booking bypasses the guard completely.
--   5. The `availability_blocks` join filters `rooms.is_active` but not
--      `rooms.status`, so a room that is both out of service and blocked is
--      subtracted from capacity twice, under-reporting availability.
--
-- THE APPROACH
-- ------------
-- Rather than patch two functions that had already drifted apart, express the
-- projection once — availability per room type per night — and rebuild every
-- consumer on it. One definition cannot disagree with itself. It is also the
-- exact shape the ARI (availability/rates/inventory) projection needs for
-- channel distribution later, and the shape the availability matrix already
-- renders, so this is not extra generality: it is the shape of the domain.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The primitive.
--
-- Restricted to `service_role`: capacity, blocked and booked counts are
-- commercially sensitive (they reveal occupancy and therefore negotiating
-- position) and must never reach a public client. The two public wrappers below
-- are SECURITY DEFINER, so they can call this while callers cannot.
--
-- `available` is computed in an OUTER select over the CTE that names `blocked`
-- and `booked`. Referencing the correlated subqueries twice in one select list
-- would execute each of them twice per room type per night.
--
-- The date series is built from an integer series rather than
-- `generate_series(date, date, interval '1 day')`: the interval form promotes
-- its arguments to timestamptz, which can duplicate or skip a night across a
-- DST boundary if the server timezone ever changes. Nights are calendar days,
-- so count them as integers.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.room_type_availability_by_date(
  p_room_type_ids uuid[],
  p_from date,
  p_to date,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS TABLE (
  room_type_id uuid,
  stay_date date,
  capacity integer,
  blocked integer,
  booked integer,
  available integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  WITH stay_dates AS (
    -- [p_from, p_to) — the night of check-out is not occupied.
    -- Empty when p_to <= p_from, which makes the whole result empty.
    SELECT (p_from + i)::date AS stay_date
      FROM generate_series(0, (p_to - p_from) - 1) AS i
  ),
  inventory AS (
    SELECT rt.id AS room_type_id,
           (
             SELECT count(*)::integer
               FROM public.rooms r
              WHERE r.room_type_id = rt.id
                AND r.is_active = true
                AND r.status NOT IN ('maintenance', 'out_of_service')
           ) AS capacity
      FROM public.room_types rt
     WHERE rt.id = ANY (p_room_type_ids)
  ),
  nightly AS (
    SELECT
      i.room_type_id,
      d.stay_date,
      i.capacity,
      (
        SELECT count(DISTINCT ab.room_id)::integer
          FROM public.availability_blocks ab
          JOIN public.rooms r ON r.id = ab.room_id
         WHERE r.room_type_id = i.room_type_id
           AND r.is_active = true
           -- Rooms already excluded from capacity must not be subtracted again.
           AND r.status NOT IN ('maintenance', 'out_of_service')
           AND ab.start_date <= d.stay_date
           AND ab.end_date > d.stay_date
      ) AS blocked,
      (
        SELECT COALESCE(sum(b.rooms_count), 0)::integer
          FROM public.bookings b
         WHERE b.room_type_id = i.room_type_id
           AND b.status IN ('pending', 'confirmed', 'checked_in')
           AND (p_exclude_booking_id IS NULL OR b.id IS DISTINCT FROM p_exclude_booking_id)
           -- Abandoned online-payment holds do not hold inventory forever:
           -- pending + fully unpaid + guest-initiated + older than 30 min.
           -- Mirrors public.expire_stale_payment_holds(), which cancels them
           -- every 5 minutes; this keeps the read consistent between sweeps.
           AND NOT (
                 b.status = 'pending'
             AND b.payment_status = 'unpaid'
             AND b.payment_preference = 'pay_now'
             AND b.source = 'direct'
             AND b.created_at < now() - interval '30 minutes'
           )
           AND b.check_in <= d.stay_date
           AND b.check_out > d.stay_date
      ) AS booked
      FROM inventory i
      CROSS JOIN stay_dates d
  )
  SELECT
    n.room_type_id,
    n.stay_date,
    n.capacity,
    n.blocked,
    n.booked,
    GREATEST(n.capacity - n.blocked - n.booked, 0)::integer AS available
  FROM nightly n;
$function$;

COMMENT ON FUNCTION public.room_type_availability_by_date(uuid[], date, date, uuid) IS
  'Availability per room type per night over [p_from, p_to). Single source of truth for sellable inventory: capacity excludes inactive/maintenance/out-of-service rooms, blocked counts distinct blocked rooms, booked sums rooms_count for active bookings while ignoring abandoned pay-now holds older than 30 minutes. p_exclude_booking_id omits one booking so a booking can be revalidated against itself. Restricted to service_role — the component counts are commercially sensitive.';

REVOKE ALL ON FUNCTION public.room_type_availability_by_date(uuid[], date, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.room_type_availability_by_date(uuid[], date, date, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.room_type_availability_by_date(uuid[], date, date, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Public wrapper, single room type. Signature and grants unchanged, so every
--    existing caller keeps working; only the body is replaced.
--
--    The worst night governs a stay: a guest cannot occupy a room for four of
--    five nights, so the minimum across the range is the sellable count.
--    An empty range yields no rows, min() yields NULL, and 0 is returned —
--    matching the previous behaviour for p_check_out <= p_check_in.
-- -----------------------------------------------------------------------------
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
AS $function$
  SELECT COALESCE(min(a.available), 0)::integer
    FROM public.room_type_availability_by_date(
           ARRAY[p_room_type_id], p_check_in, p_check_out
         ) a;
$function$;

COMMENT ON FUNCTION public.room_type_available_count(uuid, date, date) IS
  'Public: sellable room count for [p_check_in, p_check_out) — the minimum availability across every night. Thin wrapper over public.room_type_availability_by_date().';

REVOKE ALL ON FUNCTION public.room_type_available_count(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.room_type_available_count(uuid, date, date)
  TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Public wrapper, many room types — one round trip instead of N.
--
--    The booking search page and the public rooms page both fan out one RPC per
--    room type today. Each of those calls re-derives the same date series and
--    re-scans bookings; at 20 room types that is 20 round trips whose latency
--    the guest pays serially against the connection pool. This returns the whole
--    set in one query.
--
--    Driven from room_types by LEFT JOIN so every requested room type that
--    exists gets a row, including one with zero rooms or an empty date range.
--    A caller can then treat a missing row as "unknown room type" rather than
--    having to guess whether zero means sold out.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.room_type_available_counts(
  p_room_type_ids uuid[],
  p_from date,
  p_to date
)
RETURNS TABLE (
  room_type_id uuid,
  available integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT rt.id AS room_type_id,
         COALESCE(min(a.available), 0)::integer AS available
    FROM public.room_types rt
    LEFT JOIN public.room_type_availability_by_date(p_room_type_ids, p_from, p_to) a
           ON a.room_type_id = rt.id
   WHERE rt.id = ANY (p_room_type_ids)
   GROUP BY rt.id;
$function$;

COMMENT ON FUNCTION public.room_type_available_counts(uuid[], date, date) IS
  'Public: sellable room count for many room types over [p_from, p_to) in a single round trip. One row per requested room type that exists. Batch form of public.room_type_available_count().';

REVOKE ALL ON FUNCTION public.room_type_available_counts(uuid[], date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.room_type_available_counts(uuid[], date, date)
  TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. The write-side guard, rebuilt on the same primitive.
--
--    Because the primitive already sums rooms_count, already ignores abandoned
--    holds, and already excludes the row being written, all three oversell
--    defects disappear by construction rather than by a matching patch that
--    could drift again. The guard is now, in full: "is the worst night of this
--    stay still able to absorb rooms_count?"
--
--    The advisory lock is kept and still taken before reading. Two concurrent
--    inserts for the last room would otherwise both read availability 1 and
--    both pass, since neither can see the other's uncommitted row under READ
--    COMMITTED. Serialising on (hotel_id, room_type_id) makes the read-then-write
--    atomic for the only pair that can conflict, without blocking other room
--    types or other hotels.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_room_type_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_worst       integer;
  v_first_short date;
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

  SELECT min(a.available),
         min(a.stay_date) FILTER (WHERE a.available < NEW.rooms_count)
    INTO v_worst, v_first_short
    FROM public.room_type_availability_by_date(
           ARRAY[NEW.room_type_id],
           NEW.check_in,
           NEW.check_out,
           NEW.id
         ) a;

  -- COALESCE guards the impossible-but-cheap case of an empty projection
  -- (unknown room type): treat unknown inventory as no inventory.
  IF COALESCE(v_worst, 0) < NEW.rooms_count THEN
    RAISE EXCEPTION USING
      ERRCODE = '23P01',
      CONSTRAINT = 'bookings_room_type_inventory_guard',
      MESSAGE = format(
        'Only %s room(s) of type %s available on %s, %s requested',
        COALESCE(v_worst, 0),
        NEW.room_type_id,
        COALESCE(v_first_short, NEW.check_in),
        NEW.rooms_count
      );
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.assert_room_type_inventory() IS
  'BEFORE INSERT/UPDATE guard on bookings: rejects a write whose worst night cannot absorb rooms_count, with SQLSTATE 23P01 and constraint name bookings_room_type_inventory_guard. Serialises on (hotel_id, room_type_id) via an advisory transaction lock so concurrent bookings for the last room cannot both pass.';

REVOKE ALL ON FUNCTION public.assert_room_type_inventory() FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 5. Re-issue the trigger with rooms_count in the column list.
--
--    Without it, `UPDATE bookings SET rooms_count = 5` never fires the guard —
--    the cheapest possible oversell, and reachable from the booking edit screen.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS bookings_room_type_inventory_guard ON public.bookings;
CREATE TRIGGER bookings_room_type_inventory_guard
BEFORE INSERT OR UPDATE OF
  hotel_id, room_type_id, check_in, check_out, status, rooms_count
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.assert_room_type_inventory();

-- -----------------------------------------------------------------------------
-- 6. Index for the booked-count subquery.
--
--    Equality column first, then the range columns. Partial on the three
--    statuses the projection counts, so cancelled and checked-out history —
--    which grows without bound — stays out of the index entirely.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bookings_rt_active_daterange
  ON public.bookings (room_type_id, check_in, check_out)
  WHERE status IN ('pending', 'confirmed', 'checked_in');

-- -----------------------------------------------------------------------------
-- 7. Close the NULL-status capacity hole.
--
--    `rooms.status` was nullable with no default while capacity is computed as
--    `status NOT IN ('maintenance', 'out_of_service')`. In SQL that predicate is
--    NULL — not true — for a NULL status, so a room with no status set is
--    silently dropped from capacity: the room is invisible to the booking
--    funnel and the guard refuses reservations that should succeed. It fails
--    closed rather than overselling, which is why it has never been noticed,
--    but it is lost revenue and it makes capacity untrustworthy.
--
--    Remote currently has 9 rooms and none of them are NULL, and both insert
--    paths (`app/actions/rooms.ts` and the rooms directory client) send a
--    status that a Zod `.default("available")` guarantees is present, so the
--    backfill below is a no-op today and the NOT NULL cannot break a caller
--    that omits the column — the default covers it.
-- -----------------------------------------------------------------------------
UPDATE public.rooms SET status = 'available' WHERE status IS NULL;

ALTER TABLE public.rooms ALTER COLUMN status SET DEFAULT 'available';
ALTER TABLE public.rooms ALTER COLUMN status SET NOT NULL;

COMMENT ON COLUMN public.rooms.status IS
  'Housekeeping/engineering state. NOT NULL with a default because capacity is '
  'computed with NOT IN (...), which silently excludes a NULL row.';
