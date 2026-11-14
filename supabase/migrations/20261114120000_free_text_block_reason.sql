-- Let staff type their own block reason.
--
-- The block sheet offers preset reasons (maintenance, deep_cleaning,
-- owner_use, renovation, other). Under "Other", staff can now type a short
-- label, which the calendar shows on the block instead of "Other". The label
-- is stored in availability_blocks.reason, so the preset-only CHECK from
-- 20240101000900 has to go.
--
-- What still bounds the column:
--   * availability_blocks_reason_length (20260923120000): at most 50
--     characters, the same cap as blockReasonParam in
--     app/dashboard/calendar/actions.ts.
--   * availability_blocks_reason_not_blank (below): a reason, when present,
--     contains a non-whitespace character. The server trims input before it
--     writes, so only a direct PostgREST writer could break this.
-- Preset values keep their slugs, so existing rows are unchanged and all of
-- them satisfy the new constraint.

ALTER TABLE public.availability_blocks
  DROP CONSTRAINT IF EXISTS availability_blocks_reason_check;

DO $$ BEGIN
  ALTER TABLE public.availability_blocks
    ADD CONSTRAINT availability_blocks_reason_not_blank
    CHECK (reason IS NULL OR reason ~ '[^[:space:]]');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
