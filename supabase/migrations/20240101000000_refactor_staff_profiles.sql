-- ============================================================================
-- Refactor staff_profiles: hotel_id (uuid FK) -> clerk_org_id (text)
--
-- The Clerk webhook for organizationMembership.created can fire before the
-- hotels row is inserted. Using clerk_org_id directly eliminates the lookup
-- query and the race condition entirely.
--
-- Joins between staff_profiles and hotels use:
--   JOIN hotels ON hotels.clerk_org_id = staff_profiles.clerk_org_id
--
-- This migration is fully idempotent — safe to run on a fresh DB, on the
-- post-refactor DB, or anywhere in between.
-- ============================================================================

-- 1. Drop the legacy FK + dependent RLS policy on hotels
ALTER TABLE public.staff_profiles
  DROP CONSTRAINT IF EXISTS staff_profiles_hotel_id_fkey;

DROP POLICY IF EXISTS "staff_hotel_access" ON public.hotels;
DROP POLICY IF EXISTS "staff_profiles_org_isolation" ON public.staff_profiles;

-- 2. Add clerk_org_id (text, NOT NULL). Idempotent.
DO $$ BEGIN
  ALTER TABLE public.staff_profiles
    ADD COLUMN clerk_org_id text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Backfill any existing rows that have hotel_id (defensive — current live DB
-- has no rows with hotel_id, but this is safe if someone re-runs after a
-- partial rollback).
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'staff_profiles'
      AND column_name  = 'hotel_id'
  ) THEN
    UPDATE public.staff_profiles sp
       SET clerk_org_id = h.clerk_org_id
      FROM public.hotels h
     WHERE h.id = sp.hotel_id
       AND sp.clerk_org_id IS NULL;
  END IF;
END $$;

-- Now enforce NOT NULL. Wrapped in DO so re-runs after the column is already
-- NOT NULL don't fail.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'staff_profiles'
      AND column_name  = 'clerk_org_id'
      AND is_nullable  = 'YES'
  ) THEN
    -- Only set NOT NULL if there are no NULL values (e.g. hotels row gone)
    IF NOT EXISTS (
      SELECT 1 FROM public.staff_profiles WHERE clerk_org_id IS NULL
    ) THEN
      ALTER TABLE public.staff_profiles
        ALTER COLUMN clerk_org_id SET NOT NULL;
    END IF;
  END IF;
END $$;

-- 3. Drop the legacy hotel_id column (idempotent)
ALTER TABLE public.staff_profiles
  DROP COLUMN IF EXISTS hotel_id;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_staff_profiles_clerk_org_id
  ON public.staff_profiles(clerk_org_id);

CREATE INDEX IF NOT EXISTS idx_staff_profiles_clerk_user_id
  ON public.staff_profiles(clerk_user_id);

-- 5. Drop legacy unique constraint and add the new (clerk_user_id, clerk_org_id)
ALTER TABLE public.staff_profiles
  DROP CONSTRAINT IF EXISTS staff_profiles_clerk_user_id_hotel_id_key;
ALTER TABLE public.staff_profiles
  DROP CONSTRAINT IF EXISTS staff_profiles_clerk_user_id_org_key;

DO $$ BEGIN
  ALTER TABLE public.staff_profiles
    ADD CONSTRAINT staff_profiles_clerk_user_id_org_key
    UNIQUE (clerk_user_id, clerk_org_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
