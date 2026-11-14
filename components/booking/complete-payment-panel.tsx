"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@heroui/react";
import { Lock } from "lucide-react";

import { openPaystackCheckout, preloadPaystackPopup } from "@/lib/paystack-popup";

interface CompletePaymentPanelProps {
  slug: string;
  reference: string;
  amountLabel: string;
  /** Overrides the panel heading, e.g. after a failed attempt. */
  title?: string;
  /** Overrides the line under the heading. */
  description?: React.ReactNode;
  /** Overrides the button text. */
  ctaLabel?: string;
  /** Shown when a previous attempt visibly failed (card declined, timeout). */
  note?: string | null;
  /**
   * The server refused a new payment because this checkout may still take
   * money. Defaults to reloading the page to check that reference.
   */
  onPaymentInProgress?: (paymentReference: string) => void;
}

/**
 * Guest-facing "finish your payment" panel for bookings still in the unpaid
 * payment-hold state. Starts a fresh Paystack transaction and completes it in
 * Paystack's checkout over this page, falling back to the hosted checkout
 * page. Never mutates booking state itself.
 */
export function CompletePaymentPanel({
  slug,
  reference,
  amountLabel,
  title,
  description,
  ctaLabel,
  note,
  onPaymentInProgress,
}: CompletePaymentPanelProps) {
  const router = useRouter();
  const [starting, setStarting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(note ?? null);

  // The panel only shows when a payment is due, so get Paystack's checkout
  // ready while the guest reads it.
  React.useEffect(() => {
    preloadPaystackPopup().catch(() => {});
  }, []);

  // Returning with the browser's Back button can restore this page from the
  // back/forward cache with the spinner still on. Reset it so the guest can
  // try again.
  React.useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setStarting(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  async function start() {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/booking/${encodeURIComponent(slug)}/bookings/${encodeURIComponent(reference)}/retry-payment`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => null);
      // Keep the spinner on until the page changes. The reloaded page checks
      // the transaction with Paystack, so a guest who closes the form
      // mid-payment is not asked to pay again blindly.
      const toVerification = (paymentReference: string) =>
        router.replace(
          `/${encodeURIComponent(slug)}/confirmation?bref=${encodeURIComponent(reference)}&trxref=${encodeURIComponent(paymentReference)}`
        );
      if (res.status === 409 && data?.paymentInProgress && data.paymentReference) {
        // The previous checkout may still take money: check it instead.
        const openReference = String(data.paymentReference);
        if (onPaymentInProgress) {
          onPaymentInProgress(openReference);
          setStarting(false);
        } else {
          toVerification(openReference);
        }
        return;
      }
      if (res.ok && data?.authorizationUrl) {
        await openPaystackCheckout({
          accessCode: data.accessCode,
          authorizationUrl: data.authorizationUrl as string,
          reference: data.paymentReference ?? "",
          onSuccess: toVerification,
          onClose: toVerification,
        });
        return;
      }
      setError(
        data?.error ??
          "Could not start payment. Please try again or contact the hotel."
      );
    } catch {
      setError("Network error. Please check your connection and try again.");
    }
    setStarting(false);
  }

  return (
    <div className="booking-surface p-6 space-y-3">
      <div className="flex items-start gap-3">
        <span className="booking-status-icon" aria-hidden>
          <Lock className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--bk-ink)]">
            {title ?? "Payment required to confirm"}
          </p>
          <p className="text-xs text-[var(--bk-muted)] mt-1 leading-relaxed">
            {description ?? (
              <>
                Your room is held for 30 minutes. Complete the secure payment of{" "}
                <span className="booking-price font-semibold text-[var(--bk-ink)]">
                  {amountLabel}
                </span>{" "}
                to confirm this reservation.
              </>
            )}
          </p>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="text-xs text-[var(--bk-danger)] bg-[var(--bk-danger-soft)] border border-[var(--bk-danger-line)] rounded-xl px-3 py-2 leading-relaxed"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={start}
        disabled={starting}
        aria-busy={starting}
        className="booking-cta booking-cta-accent w-full h-12 rounded-xl text-sm touch-manipulation inline-flex items-center justify-center gap-2"
      >
        {starting ? (
          <>
            <Spinner size="sm" color="current" />
            Starting secure checkout…
          </>
        ) : (
          <>{ctaLabel ?? `Pay ${amountLabel} securely`}</>
        )}
      </button>
    </div>
  );
}
