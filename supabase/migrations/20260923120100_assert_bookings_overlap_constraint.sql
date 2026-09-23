-- Calendar review 2026-09-23 (H3): bookings_no_room_overlap is the only DB
-- backstop for the assignBookingToRoom check-then-write race, but the migration
-- that creates it (20240102000000_booking_availability.sql) SKIPS creation with
-- a NOTICE when pre-existing overlaps exist. A database that took that branch
-- has no double-booking protection at all.
--
-- This migration fails loudly when the constraint is missing, so `db push`
-- cannot silently leave an environment unprotected. If this fails, resolve
-- overlapping bookings first, then add the constraint exactly as defined in
-- 20240102000000_booking_availability.sql.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'bookings_no_room_overlap'
       AND conrelid = 'public.bookings'::regclass
  ) THEN
    RAISE EXCEPTION 'bookings_no_room_overlap is missing on public.bookings. Resolve overlapping active bookings, then apply the constraint from 20240102000000_booking_availability.sql before re-running migrations.';
  END IF;
END $$;
