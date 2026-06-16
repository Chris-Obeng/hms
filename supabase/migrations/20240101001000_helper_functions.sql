-- ============================================================================
-- Helper function: resolve hotel_ids for the current authenticated user
--
-- Returns the set of hotel UUIDs the caller's Clerk user has active staff
-- access to. Joins hotels ⨝ staff_profiles on clerk_org_id (the column that
-- exists on staff_profiles after the 20240101000000 refactor).
--
-- SECURITY DEFINER so RLS on staff_profiles / hotels doesn't block reads
-- inside the policies. STABLE so the planner can cache within a query.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_hotel_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT h.id
    FROM public.hotels h
    JOIN public.staff_profiles sp ON sp.clerk_org_id = h.clerk_org_id
   WHERE sp.clerk_user_id = auth.jwt() ->> 'sub'
     AND sp.is_active = true
$$;

-- Same idea for clerk_org_id (used by the staff_profiles RLS policy itself)
CREATE OR REPLACE FUNCTION public.get_user_clerk_org_ids()
RETURNS SETOF text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT clerk_org_id
    FROM public.staff_profiles
   WHERE clerk_user_id = auth.jwt() ->> 'sub'
     AND is_active = true
$$;
