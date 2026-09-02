-- One Paystack transaction must never produce two payment rows.
-- paystack_reference is enforced twice today (duplicate constraints); keep one.
ALTER TABLE public.payments DROP CONSTRAINT payments_paystack_reference_unique;
DROP INDEX IF EXISTS public.idx_payments_ref;

-- Secondary idempotency key: Paystack's numeric transaction id. Partial
-- (manual/offline rows have NULL paystack_id).
CREATE UNIQUE INDEX payments_paystack_id_unique
  ON public.payments (paystack_id)
  WHERE paystack_id IS NOT NULL;

COMMENT ON CONSTRAINT payments_paystack_reference_key ON public.payments IS
  'Idempotency guard: one Paystack reference = at most one payment row. Webhook and verify fallback race-safe via 23505 short-circuit.';

-- Track every authorization URL we handed to Paystack for a booking so a
-- reconciliation sweep can verify against Paystack even if the guest closed
-- the browser before redirecting and the webhook was delayed or lost.
ALTER TABLE public.bookings
  ADD COLUMN initiated_payment_refs text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.bookings.initiated_payment_refs IS
  'Paystack transaction references initialized for this booking (newest last, capped at 10). Read by reconcile_pending_payments(); written only at transaction init.';
