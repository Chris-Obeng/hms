-- Drop the dependent RLS policy first
DROP POLICY IF EXISTS "staff_hotel_access" ON public.hotels;

-- Drop FK constraint on hotel_id
ALTER TABLE public.staff_profiles
  DROP CONSTRAINT IF EXISTS staff_profiles_hotel_id_fkey;

-- Drop hotel_id column
ALTER TABLE public.staff_profiles
  DROP COLUMN IF EXISTS hotel_id;

-- Add clerk_org_id column
ALTER TABLE public.staff_profiles
  ADD COLUMN clerk_org_id text NOT NULL;

-- Add index for fast lookups and joins
CREATE INDEX IF NOT EXISTS idx_staff_profiles_clerk_org_id
  ON public.staff_profiles(clerk_org_id);

CREATE INDEX IF NOT EXISTS idx_staff_profiles_clerk_user_id
  ON public.staff_profiles(clerk_user_id);

-- Unique constraint: one profile per user per hotel
ALTER TABLE public.staff_profiles
  DROP CONSTRAINT IF EXISTS staff_profiles_clerk_user_id_hotel_id_key;

ALTER TABLE public.staff_profiles
  ADD CONSTRAINT staff_profiles_clerk_user_id_org_key
  UNIQUE (clerk_user_id, clerk_org_id);

-- Recreate the RLS policy using clerk_org_id
CREATE POLICY "staff_hotel_access" ON public.hotels
  FOR SELECT
  USING (
    clerk_org_id IN (
      SELECT staff_profiles.clerk_org_id
      FROM public.staff_profiles
      WHERE staff_profiles.clerk_user_id = (auth.jwt() ->> 'sub')
        AND staff_profiles.is_active = true
    )
  );
