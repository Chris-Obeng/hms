CREATE OR REPLACE FUNCTION public.enqueue_notification_push() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
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