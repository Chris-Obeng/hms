-- ============================================================================
-- Optimize update_guest_stays_statistics trigger to short-circuit on updates
-- where stays-relevant/spend-relevant columns have not changed.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_guest_stays_statistics()
RETURNS TRIGGER AS $$
DECLARE
  v_guest_id uuid;
BEGIN
  -- Short-circuit on update if no statistics-relevant columns changed
  IF (TG_OP = 'UPDATE') THEN
    IF (OLD.guest_id IS NOT DISTINCT FROM NEW.guest_id AND
        OLD.status IS NOT DISTINCT FROM NEW.status AND
        OLD.amount_paid IS NOT DISTINCT FROM NEW.amount_paid AND
        OLD.check_out IS NOT DISTINCT FROM NEW.check_out) THEN
      RETURN NULL;
    END IF;
  END IF;

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
