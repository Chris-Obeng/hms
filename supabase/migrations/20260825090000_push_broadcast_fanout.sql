-- Broadcast notifications (recipient_staff_id IS NULL) are visible to every
-- active staff member in-app but previously never reached the push pipeline:
-- the enqueue trigger skipped them entirely, so hotel-wide alerts such as
-- payment_received were silent on push. Fan them out to all active staff of
-- the owning hotel at enqueue time.

CREATE OR REPLACE FUNCTION public.enqueue_notification_push() RETURNS trigger
-- SECURITY DEFINER: notification_delivery_outbox is fully revoked from
-- anon/authenticated, so an INVOKER trigger makes every user-scoped
-- notifications INSERT (e.g. dashboard-created bookings) fail with
-- permission denied and aborts the notification write entirely.
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.recipient_staff_id IS NOT NULL THEN
    INSERT INTO public.notification_delivery_outbox(notification_id, recipient_staff_id)
    VALUES (NEW.id, NEW.recipient_staff_id) ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.notification_delivery_outbox(notification_id, recipient_staff_id)
    SELECT NEW.id, s.id
    FROM public.staff_profiles s
    WHERE s.clerk_org_id = (
      SELECT h.clerk_org_id FROM public.hotels h WHERE h.id = NEW.hotel_id
    )
      AND s.is_active
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

-- Trigger functions require EXECUTE for any role whose DML fires them;
-- staff-scoped inserts run as `authenticated`.
GRANT EXECUTE ON FUNCTION public.enqueue_notification_push() TO authenticated;

-- Allow the settings-page "Send Test Notification" action to write a
-- dedicated test event through the normal pipeline.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
CHECK (
  type IS NULL
  OR type = ANY (ARRAY[
    'new_booking', 'booking_cancelled', 'payment_received', 'payment_failed',
    'staff_access_request', 'check_in_reminder', 'check_out_reminder', 'test_push'
  ])
);
