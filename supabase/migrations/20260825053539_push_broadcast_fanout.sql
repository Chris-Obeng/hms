ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
CHECK (
  type IS NULL
  OR type = ANY (ARRAY[
    'new_booking'::text, 'booking_cancelled'::text, 'payment_received'::text, 'payment_failed'::text,
    'staff_access_request'::text, 'check_in_reminder'::text, 'check_out_reminder'::text, 'test_push'::text
  ])
);