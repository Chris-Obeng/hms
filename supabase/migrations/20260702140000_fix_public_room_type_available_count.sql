-- Fix room_type_available_count to be queryable by anonymous guest booking requests
CREATE OR REPLACE FUNCTION public.room_type_available_count(
  p_room_type_id uuid,
  p_check_in    date,
  p_check_out   date
)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    (SELECT count(*) FROM public.rooms r
     WHERE r.room_type_id = p_room_type_id
       AND r.is_active = true
       AND r.status NOT IN ('maintenance', 'out_of_service'))
    -
    (SELECT count(DISTINCT b.room_id) FROM public.bookings b
     WHERE b.room_type_id = p_room_type_id
       AND b.status IN ('pending', 'confirmed', 'checked_in')
       AND b.room_id IS NOT NULL
       AND b.check_in < p_check_out
       AND b.check_out > p_check_in)
$$;

COMMENT ON FUNCTION public.room_type_available_count IS
  'Returns how many rooms of a type are free for [p_check_in, p_check_out). Fixed to allow anonymous booking flow requests.';
