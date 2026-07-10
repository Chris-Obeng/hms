-- ============================================================================
-- Automatically update guest stats (total_stays, total_spend, last_stay_date)
-- when bookings are inserted, updated, or deleted.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_guest_stays_statistics()
RETURNS TRIGGER AS $$
DECLARE
  v_guest_id uuid;
BEGIN
  -- Determine which guest_id to update (handle old/new for updates, delete, insert)
  IF (TG_OP = 'DELETE') THEN
    v_guest_id := OLD.guest_id;
  ELSE
    v_guest_id := NEW.guest_id;
  END IF;

  IF v_guest_id IS NOT NULL THEN
    UPDATE public.guests
       SET total_stays = (
             SELECT COUNT(*)
               FROM public.bookings
              WHERE guest_id = v_guest_id
                AND status = 'checked_out'
           ),
           total_spend = COALESCE((
             SELECT SUM(amount_paid)
               FROM public.bookings
              WHERE guest_id = v_guest_id
                AND status = 'checked_out'
           ), 0),
           last_stay_date = (
             SELECT MAX(check_out)
               FROM public.bookings
              WHERE guest_id = v_guest_id
                AND status = 'checked_out'
           )
     WHERE id = v_guest_id;
  END IF;

  -- If guest_id changed during update, recalculate stats for the old guest as well
  IF (TG_OP = 'UPDATE' AND OLD.guest_id IS DISTINCT FROM NEW.guest_id AND OLD.guest_id IS NOT NULL) THEN
    UPDATE public.guests
       SET total_stays = (
             SELECT COUNT(*)
               FROM public.bookings
              WHERE guest_id = OLD.guest_id
                AND status = 'checked_out'
           ),
           total_spend = COALESCE((
             SELECT SUM(amount_paid)
               FROM public.bookings
              WHERE guest_id = OLD.guest_id
                AND status = 'checked_out'
           ), 0),
           last_stay_date = (
             SELECT MAX(check_out)
               FROM public.bookings
              WHERE guest_id = OLD.guest_id
                AND status = 'checked_out'
           )
     WHERE id = OLD.guest_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger idempotently
DROP TRIGGER IF EXISTS update_guest_stays_statistics_trigger ON public.bookings;
CREATE TRIGGER update_guest_stays_statistics_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.update_guest_stays_statistics();

-- Backfill stats for all existing guests in the database
UPDATE public.guests g
   SET total_stays = (
         SELECT COUNT(*)
           FROM public.bookings b
          WHERE b.guest_id = g.id
            AND b.status = 'checked_out'
       ),
       total_spend = COALESCE((
         SELECT SUM(b.amount_paid)
           FROM public.bookings b
          WHERE b.guest_id = g.id
            AND b.status = 'checked_out'
       ), 0),
       last_stay_date = (
         SELECT MAX(b.check_out)
           FROM public.bookings b
          WHERE b.guest_id = g.id
            AND b.status = 'checked_out'
       );
