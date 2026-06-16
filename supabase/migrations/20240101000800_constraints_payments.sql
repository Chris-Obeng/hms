-- ============================================================================
-- payments — CHECK + UNIQUE constraints
-- ============================================================================

DO $$ BEGIN
  ALTER TABLE public.payments
    ADD CONSTRAINT payments_method_check
    CHECK (method IS NULL OR method IN (
      'card', 'bank_transfer', 'ussd', 'mobile_money',
      'cash', 'pos', 'paystack_link', 'refund'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.payments
    ADD CONSTRAINT payments_status_check
    CHECK (status IS NULL OR status IN (
      'pending', 'success', 'failed', 'refunded'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.payments
    ADD CONSTRAINT payments_paystack_reference_unique
    UNIQUE (paystack_reference);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
