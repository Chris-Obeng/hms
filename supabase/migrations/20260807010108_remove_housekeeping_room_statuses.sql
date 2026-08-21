UPDATE public.rooms SET status = 'available' WHERE status IN ('checkout_pending', 'cleaning');
ALTER TABLE public.rooms DROP CONSTRAINT IF EXISTS rooms_status_check;
ALTER TABLE public.rooms ADD CONSTRAINT rooms_status_check CHECK (status IN ('available', 'occupied', 'maintenance', 'out_of_service'));
DROP FUNCTION IF EXISTS public.bulk_update_room_statuses(uuid, jsonb);
