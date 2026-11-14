"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@heroui/react";
import { Check, Clock, Phone, XCircle } from "lucide-react";

import { confirmationPath } from "@/lib/bookings/guest-access-link";

import { BookingStatusHero } from "./booking-status-hero";
import { CompletePaymentPanel } from "./complete-payment-panel";

/**
 * - `unpaid`: no checkout attempt to check, so ask for payment.
 * - `verifying`: back from Paystack; asking whether the charge went through.
 * - `confirmed`: Paystack says paid; the page is reloading as confirmed.
 * - `failed`: Paystack says the charge failed (or was reversed).
 * - `not_completed`: Paystack says the guest left checkout without paying.
 * - `unconfirmed`: no answer yet. The guest may have paid, so no pay button.
 */
type Phase = "unpaid" | "verifying" | "confirmed" | "failed" | "not_completed" | "unconfirmed";

/** Checks after the redirect, 2 seconds apart. */
const FIRST_RUN_CHECKS = 8;
/** Checks per "Check again" press. */
const RECHECK_CHECKS = 3;
const CHECK_INTERVAL_MS = 2000;
/**
 * The verify route allows 10 calls a minute per IP, and a first run plus a
 * quick "Check again" is 11. On a 429 the next check waits for Retry-After,
 * capped so the guest is not left waiting with no feedback for long.
 */
const MAX_RATE_LIMIT_WAIT_MS = 30_000;
/**
 * `abandoned` can arrive moments after the guest closes the form while a
 * mobile money charge is still being registered, so it is confirmed once more
 * after this delay before the page offers a new payment.
 */
const ABANDONED_RECONFIRM_MS = 5000;

interface AwaitingPaymentProps {
  slug: string;
  /** Booking (or group) reference. */
  reference: string;
  /** Signed guest access token from the page URL; null for a legacy link. */
  accessToken: string | null;
  /** Paystack transaction reference from the checkout redirect, if any. */
  paymentRef: string | null;
  firstName: string;
  amountLabel: string;
  hotelPhone: string | null;
}

/**
 * Status header and next step for a booking whose online payment is not yet
 * recorded. After a Paystack redirect it checks the payment first and only
 * offers a payment button once Paystack says the charge did not happen.
 *
 * The webhook is the primary confirmation path; the verify route is an
 * idempotent fallback that records the payment itself when the webhook has not
 * landed yet, so a "verified" answer means the booking is now confirmed.
 */
export function AwaitingPayment({
  slug,
  reference,
  accessToken,
  paymentRef,
  firstName,
  amountLabel,
  hotelPhone,
}: AwaitingPaymentProps) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>(paymentRef ? "verifying" : "unpaid");
  const [run, setRun] = React.useState({ id: 0, checks: FIRST_RUN_CHECKS });

  React.useEffect(() => {
    if (!paymentRef) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let checks = 0;
    let abandonedOnce = false;

    async function check() {
      let status: string | null = null;
      let nextDelay = CHECK_INTERVAL_MS;
      try {
        const res = await fetch(
          `/api/booking/${encodeURIComponent(slug)}/payments/verify?reference=${encodeURIComponent(paymentRef!)}`,
          { cache: "no-store" }
        );
        if (res.status === 429) {
          const retryAfterSeconds = Number(res.headers.get("Retry-After"));
          if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
            nextDelay = Math.min(retryAfterSeconds * 1000, MAX_RATE_LIMIT_WAIT_MS);
          }
        }
        const data = (await res.json().catch(() => null)) as
          | { verified?: boolean; status?: unknown }
          | null;
        if (cancelled) return;
        if (data?.verified) {
          setPhase("confirmed");
          // Re-render the page from the booking row, now confirmed.
          router.refresh();
          return;
        }
        status = typeof data?.status === "string" ? data.status : null;
      } catch {
        // Network blip: count it and check again.
      }
      if (cancelled) return;

      // Paystack's final answers. Anything else (ongoing, pending,
      // processing, queued, an error or a rate limit) is checked again.
      if (status === "failed" || status === "reversed") {
        setPhase("failed");
        return;
      }
      if (status === "abandoned") {
        if (abandonedOnce) {
          setPhase("not_completed");
          return;
        }
        abandonedOnce = true;
        timer = setTimeout(check, ABANDONED_RECONFIRM_MS);
        return;
      }

      checks += 1;
      if (checks < run.checks) timer = setTimeout(check, nextDelay);
      else setPhase("unconfirmed");
    }

    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [paymentRef, slug, router, run]);

  const checkAgain = () => {
    setPhase("verifying");
    setRun((previous) => ({ id: previous.id + 1, checks: RECHECK_CHECKS }));
  };

  // Paystack's answer for this checkout changed since it was checked (a
  // mobile money charge came through late): follow it from the start.
  const followOpenPayment = (openReference: string) => {
    if (openReference === paymentRef) {
      setPhase("verifying");
      setRun((previous) => ({ id: previous.id + 1, checks: FIRST_RUN_CHECKS }));
      return;
    }
    router.replace(
      confirmationPath(slug, reference, { accessToken, paymentReference: openReference })
    );
  };

  if (phase === "verifying") {
    return (
      <BookingStatusHero
        live
        tone="info"
        icon={<Spinner size="md" color="current" />}
        title="Confirming your payment…"
        subtitle="This usually takes a few seconds. Please keep this page open."
      />
    );
  }

  if (phase === "confirmed") {
    return (
      <BookingStatusHero
        live
        tone="success"
        icon={<Check className="size-6" strokeWidth={2.5} />}
        title="Payment received"
        subtitle="Finishing your booking…"
      />
    );
  }

  if (phase === "unconfirmed") {
    return (
      <>
        <BookingStatusHero
          live
          tone="warning"
          icon={<Clock className="size-6" strokeWidth={2} />}
          title="We're still checking your payment"
          subtitle="If you paid, your booking will be confirmed automatically and we'll email you."
        />
        <div className="booking-surface p-6 space-y-4 text-center">
          <p className="text-sm text-[var(--bk-muted)] leading-relaxed max-w-md mx-auto">
            Mobile money payments can take a minute to come through. Please
            don&apos;t pay again while we check.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={checkAgain}
              className="booking-btn-primary h-10 px-6 text-sm inline-flex items-center justify-center w-full sm:w-auto cursor-pointer touch-manipulation"
            >
              Check again
            </button>
            {hotelPhone && (
              <a
                href={`tel:${hotelPhone}`}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium text-[#18181B] hover:bg-[#EBEBEC]/60 transition-colors"
              >
                <Phone className="size-4" />
                <span>Questions? {hotelPhone}</span>
              </a>
            )}
          </div>
        </div>
      </>
    );
  }

  if (phase === "failed" || phase === "not_completed") {
    const failed = phase === "failed";
    return (
      <>
        <BookingStatusHero
          live
          tone={failed ? "danger" : "warning"}
          icon={
            failed ? (
              <XCircle className="size-6" strokeWidth={2} />
            ) : (
              <Clock className="size-6" strokeWidth={2} />
            )
          }
          title={failed ? "Your payment didn't go through" : "Payment not completed"}
          subtitle="You haven't been charged, and your room is still held."
        />
        <CompletePaymentPanel
          slug={slug}
          reference={reference}
          accessToken={accessToken}
          amountLabel={amountLabel}
          title={failed ? "Try your payment again" : "Finish your payment"}
          description={
            <>
              Pay{" "}
              <span className="booking-price font-semibold text-[var(--bk-ink)]">
                {amountLabel}
              </span>{" "}
              to confirm this reservation.
              {failed
                ? " You can use another card or mobile money number."
                : null}
            </>
          }
          ctaLabel={failed ? "Try again" : `Pay ${amountLabel} securely`}
          onPaymentInProgress={followOpenPayment}
        />
      </>
    );
  }

  return (
    <>
      <BookingStatusHero
        tone="warning"
        icon={<Clock className="size-6" strokeWidth={2} />}
        title={`Almost there, ${firstName}.`}
        subtitle="Complete your payment below to confirm this reservation."
      />
      <CompletePaymentPanel
        slug={slug}
        reference={reference}
        accessToken={accessToken}
        amountLabel={amountLabel}
      />
    </>
  );
}
