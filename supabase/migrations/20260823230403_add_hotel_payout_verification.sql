-- Payout destination ownership proof (mobile money wallets cannot be name-resolved
-- via Paystack /bank/resolve, so we verify with a small test payout).
alter table public.hotels
  add column if not exists payout_recipient_code text,
  add column if not exists payout_verification_status text not null default 'unverified',
  add column if not exists payout_transfer_reference text,
  add column if not exists payout_transfer_code text,
  add column if not exists payout_verified_at timestamptz;

comment on column public.hotels.payout_recipient_code is 'Paystack transfer recipient (RCP_...) for the settlement wallet/bank';
comment on column public.hotels.payout_verification_status is 'unverified | pending | otp_required | verified | failed — wallet ownership proof state';
comment on column public.hotels.payout_transfer_reference is 'Reference of the GHS 1 ownership-proof transfer';
comment on column public.hotels.payout_transfer_code is 'Paystack transfer code (TRF_...) kept for OTP finalization';