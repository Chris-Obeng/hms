-- Revert: Paystack /bank/resolve DOES cover Ghana mobile money channels in
-- live mode, so ownership-proof payout columns are unnecessary.
alter table public.hotels
  drop column if exists payout_recipient_code,
  drop column if exists payout_verification_status,
  drop column if exists payout_transfer_reference,
  drop column if exists payout_transfer_code,
  drop column if exists payout_verified_at;