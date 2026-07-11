-- ============================================================================
-- Narrow the update_guest_stays_statistics_trigger to only fire on update of
-- columns relevant to stays/spend statistics.
-- ============================================================================

DROP TRIGGER IF EXISTS update_guest_stays_statistics_trigger ON public.bookings;

CREATE TRIGGER update_guest_stays_statistics_trigger
AFTER INSERT OR DELETE OR UPDATE OF guest_id, status, amount_paid, check_out ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.update_guest_stays_statistics();
