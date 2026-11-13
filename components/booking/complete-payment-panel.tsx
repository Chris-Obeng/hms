"use client";

import * as React from "react";
import { Loader2, Lock } from "lucide-react";

interface CompletePaymentPanelProps {
  slug: string;
  reference: string;
  amountLabel: string;
  /** Shown when a previous attempt visibly failed (card declined, timeout). */
  note?: string | null;
}

/**
 * Guest-facing "finish your payment" panel for bookings still in the unpaid
 * payment-hold state. Requests a fresh Paystack authorization URL and sends
 * the browser there. Never mutates booking state itself.
 */
export function CompletePaymentPanel({
  slug,
  reference,
  amountLabel,
  note,
}: CompletePaymentPanelProps) {
  const [starting, setStarting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(note ?? null);

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
      if (res.ok && data?.authorizationUrl) {
        window.location.href = data.authorizationUrl as string;
        return;
      }
      setError(
        data?.error ??
          "Could not start payment. Please try again or contact the hotel."
      );
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="booking-surface p-6 space-y-3">
      <div className="flex items-start gap-3">
        <span className="booking-status-icon" aria-hidden>
          <Lock className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--bk-ink)]">
            Payment required to confirm
          </p>
          <p className="text-xs text-[var(--bk-muted)] mt-1 leading-relaxed">
            Your room is held for 30 minutes. Complete the secure payment of{" "}
            <span className="booking-price font-semibold text-[var(--bk-ink)]">
              {amountLabel}
            </span>{" "}
            to confirm this reservation.
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
        className="booking-cta booking-cta-accent w-full h-12 rounded-xl text-sm touch-manipulation inline-flex items-center justify-center gap-2"
      >
        {starting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Starting secure checkout…
          </>
        ) : (
          <>Pay {amountLabel} securely</>
        )}
      </button>
    </div>
  );
}
