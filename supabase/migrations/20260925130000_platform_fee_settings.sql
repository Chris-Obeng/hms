-- Platform-wide transaction fee configuration (RoomLine's cut per booking).
--
-- Single source of truth for the fee RoomLine charges each hotel per online
-- payment. The fee is applied at Paystack *settlement*: the guest is charged the
-- full booking total, and the split routes RoomLine's cut to the main account
-- while the remainder settles to the hotel's subaccount on Paystack's schedule.
-- It is realised per transaction via `transaction_charge` at initialize time
-- (a flat amount in the currency's subunit, sent to the main account), computed
-- from this row. Editing this row changes the fee for the *next* transaction;
-- no Paystack round-trip and no change to any subaccount's percentage_charge.
--
-- Singleton: exactly one row (id = 1). Global only — no per-hotel override.
-- Seeded with a zero fee so existing behaviour is unchanged until an admin sets
-- one (a zero fee omits transaction_charge entirely at initialize).

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  fee_type text NOT NULL DEFAULT 'percentage'
    CHECK (fee_type IN ('percentage', 'flat')),
  -- Percentage of the booking total (0–100), used when fee_type = 'percentage'.
  fee_percent numeric(5,2) NOT NULL DEFAULT 0
    CHECK (fee_percent >= 0 AND fee_percent <= 100),
  -- Flat fee in the currency's smallest unit, used when fee_type = 'flat'.
  fee_flat_minor bigint NOT NULL DEFAULT 0
    CHECK (fee_flat_minor >= 0),
  fee_flat_currency text NOT NULL DEFAULT 'GHS'
    CHECK (fee_flat_currency ~ '^[A-Z]{3}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- platform_admins.id of the admin who last changed the fee (matches
  -- platform_admin_audit_logs.admin_id for a cheap "last edited by" display).
  updated_by uuid
);

COMMENT ON TABLE public.platform_settings IS
  'Singleton (id = 1): platform-wide per-transaction fee RoomLine charges hotels. Applied via Paystack transaction_charge at settlement.';

INSERT INTO public.platform_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Service-role only: read and written through supabaseAdmin from the platform
-- settings action and the payment-init paths. No anon/authenticated access.
REVOKE ALL ON TABLE public.platform_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.platform_settings TO service_role;

-- Platform-wide fee edits are not scoped to a hotel, but every platform mutation
-- is audited. hotel_id was NOT NULL (all prior actions were per-hotel); relax it
-- so a hotel-less fee change can be logged with hotel_id = NULL. FK already
-- permits NULL; getHotel360 filters by hotel_id, so NULL rows never surface in
-- per-hotel oversight. Idempotent (DROP NOT NULL on an already-nullable column
-- is a no-op).
ALTER TABLE public.platform_admin_audit_logs ALTER COLUMN hotel_id DROP NOT NULL;
