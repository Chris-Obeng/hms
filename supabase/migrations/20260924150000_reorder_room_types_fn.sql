-- Atomic room-type reordering.
--
-- reorderRoomTypes previously issued one UPDATE per id in a server-side loop, so
-- a failure partway through could leave sort_order half-applied (some types on
-- the new order, the rest on the old). This folds the whole permutation into a
-- single statement: it either lands completely or not at all.
--
-- SECURITY INVOKER on purpose. The room_types_org_isolation RLS policy already
-- confines the caller to their own hotel's rows, and the manager-role gate lives
-- in the reorderRoomTypes server action. p_hotel_id is an extra WHERE guard, not
-- the security boundary. sort_order carries no unique constraint, so assigning
-- every new position in one statement is safe (no transient-collision risk).

CREATE OR REPLACE FUNCTION public.reorder_room_types(
  p_hotel_id    uuid,
  p_ordered_ids uuid[]
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.room_types AS rt
  SET sort_order = ord.ordinality - 1
  FROM unnest(p_ordered_ids) WITH ORDINALITY AS ord(id, ordinality)
  WHERE rt.id = ord.id
    AND rt.hotel_id = p_hotel_id;
$$;

REVOKE ALL ON FUNCTION public.reorder_room_types(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_room_types(uuid, uuid[]) TO authenticated;
