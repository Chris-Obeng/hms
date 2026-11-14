-- ============================================================================
-- Short booking references, unique per hotel.
--
-- Until now generate_booking_reference() returned a random 13-digit number
-- (e.g. 8803962598706) that was unique across every hotel on the platform.
-- Guests read these codes aloud at the front desk and type them into emails,
-- so 13 digits was too long. New references are 6 characters (e.g. K7MX4Q),
-- the same length as an airline booking code.
--
-- Format
--   * 6 characters from a 28-symbol alphabet: the digits 2-9 and the consonants
--     B C D F G H J K M N P Q R S T V W X Y Z.
--   * Left out on purpose: 0/O and 1/I/L, which look alike in many fonts and
--     over the phone, and the vowels A E I O U, so a code cannot spell a word.
--   * 28^6 = 481,890,304 codes per hotel. A hotel with 100,000 bookings on file
--     has about a 1 in 4,800 chance that a new code is already taken, and the
--     loop below then draws another one.
--   * Characters come from extensions.gen_random_bytes (pgcrypto), a
--     cryptographically secure source, instead of random(). Guest-facing routes
--     look bookings up by reference, so codes must not be predictable.
--     Rejection sampling (bytes >= 252 are discarded; 252 = 9 * 28) keeps every
--     symbol equally likely.
--
-- Uniqueness
--   * bookings_reference_unique (global) is replaced by
--     bookings_hotel_reference_key UNIQUE (hotel_id, reference). Two hotels may
--     now hold the same code. Every guest- and staff-facing lookup already
--     filters by hotel_id, and that composite index serves those lookups.
--   * Check-then-insert race: two transactions for the same hotel could draw the
--     same code, both see it as free, and the second insert would fail on the
--     constraint. The generator takes a transaction-scoped advisory lock on
--     (hotel, code) before the existence check. The lock is held until the
--     caller's transaction ends, which is after its INSERT. A second
--     transaction that draws the same code waits, then sees the committed row
--     and draws again. Every caller (create_booking_atomic, and through it
--     create_booking_group_atomic) generates and inserts in one transaction.
--     The unique constraint stays as the final guarantee.
--
-- Existing data
--   * Existing references (13-digit and older prefixed formats) are kept as
--     they are. They are already globally unique, so they satisfy the per-hotel
--     constraint. New codes are 6 characters long, so they can never equal an
--     existing 13-digit code.
--
-- Signature, SECURITY DEFINER, search_path and grants are unchanged, so callers
-- and the privilege parity checks are unaffected. p_prefix is still accepted
-- and ignored, as it has been since 20260713203000.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_booking_reference(
  p_hotel_id uuid,
  p_prefix   text DEFAULT 'BK'
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- 28 symbols: digits 2-9 and consonants without L. See the header.
  c_alphabet     CONSTANT text    := '23456789BCDFGHJKMNPQRSTVWXYZ';
  c_length       CONSTANT integer := 6;
  -- Largest multiple of 28 that fits in a byte. Bytes at or above it are
  -- discarded so every symbol is equally likely.
  c_byte_limit   CONSTANT integer := 252;
  -- With fewer than half the codes of a hotel in use, the chance of 32 misses
  -- in a row is below 2^-32. Reaching this limit means something is wrong, so
  -- fail loudly instead of looping forever.
  c_max_attempts CONSTANT integer := 32;
  -- Each 16-byte batch keeps a byte with probability 252/256, so needing more
  -- than 4 batches for 6 symbols does not happen with a working random source.
  -- The cap stops a broken source from looping forever.
  c_max_batches  CONSTANT integer := 4;

  v_bytes   bytea;
  v_byte    integer;
  v_pos     integer;
  v_ref     text;
  v_attempt integer := 0;
  v_batches integer;
BEGIN
  PERFORM p_prefix;

  IF p_hotel_id IS NULL THEN
    RAISE EXCEPTION 'generate_booking_reference: hotel id is required'
      USING ERRCODE = '22004';
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > c_max_attempts THEN
      RAISE EXCEPTION 'generate_booking_reference: no free reference after % attempts for hotel %',
        c_max_attempts, p_hotel_id
        USING ERRCODE = 'P0001';
    END IF;

    -- Draw one code by rejection sampling. 16 bytes nearly always yield 6
    -- usable symbols (each byte is kept with probability 252/256); if they do
    -- not, a fresh batch is drawn.
    v_ref := '';
    v_batches := 0;
    WHILE pg_catalog.length(v_ref) < c_length LOOP
      v_batches := v_batches + 1;
      v_bytes := extensions.gen_random_bytes(16);
      IF v_batches > c_max_batches OR v_bytes IS NULL OR pg_catalog.length(v_bytes) <> 16 THEN
        RAISE EXCEPTION 'generate_booking_reference: random source returned unusable bytes'
          USING ERRCODE = 'P0001';
      END IF;
      v_pos := 0;
      WHILE v_pos < 16 AND pg_catalog.length(v_ref) < c_length LOOP
        v_byte := pg_catalog.get_byte(v_bytes, v_pos);
        IF v_byte < c_byte_limit THEN
          v_ref := v_ref || pg_catalog.substr(c_alphabet, (v_byte % 28) + 1, 1);
        END IF;
        v_pos := v_pos + 1;
      END LOOP;
    END LOOP;

    -- Serialise concurrent transactions that drew the same code for this hotel.
    -- Held until the caller's transaction ends, i.e. past its INSERT.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('booking_reference:' || p_hotel_id::text || ':' || v_ref, 0)
    );

    EXIT WHEN NOT EXISTS (
      SELECT 1
        FROM public.bookings b
       WHERE b.hotel_id = p_hotel_id
         AND b.reference = v_ref
    );
  END LOOP;

  RETURN v_ref;
END;
$$;

COMMENT ON FUNCTION public.generate_booking_reference(uuid, text) IS
  'Returns a new 6-character booking reference (alphabet 23456789BCDFGHJKMNPQRSTVWXYZ) that is unused within p_hotel_id. Takes a transaction-scoped advisory lock on (hotel, code); call it in the same transaction as the INSERT. p_prefix is ignored. Service-role only.';

-- Privileges are preserved by CREATE OR REPLACE. Restated so this file is the
-- single place to read them.
REVOKE ALL ON FUNCTION public.generate_booking_reference(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_booking_reference(uuid, text) TO service_role;

-- ── Uniqueness: global → per hotel ──────────────────────────────────────────
-- Add the new constraint before dropping the old one, so references are never
-- unenforced. Both statements run in this migration's transaction.
DO $$ BEGIN
  ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_hotel_reference_key UNIQUE (hotel_id, reference);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_reference_unique;

COMMENT ON CONSTRAINT bookings_hotel_reference_key ON public.bookings IS
  'Booking references are unique per hotel, not globally. Always look a booking up by (hotel_id, reference). Paystack transaction references are built from the booking reference plus a random suffix so they stay globally unique.';
