"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

interface Props {
  paymentRef: string;
  slug: string;
}

/**
 * Polls the verify fallback after a Paystack redirect. The webhook is the
 * primary confirmation path; this makes the guest see success without a
 * manual refresh when only the fallback has landed yet.
 */
export function PaymentVerifier({ paymentRef, slug }: Props) {
  const router = useRouter();
  const [status, setStatus] = React.useState<"polling" | "confirmed" | "failed">("polling");

  React.useEffect(() => {
    let attempts = 0;
    const MAX = 8;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const res = await fetch(
          `/api/booking/${encodeURIComponent(slug)}/payments/verify?reference=${encodeURIComponent(paymentRef)}`
        );
        const data = await res.json();
        if (data.verified) {
          setStatus("confirmed");
          // Pull server-rendered booking state (status/payment rows) fresh.
          router.refresh();
          return;
        }
      } catch {
        // network blip — keep trying
      }
      attempts++;
      if (attempts < MAX) timer = setTimeout(poll, 2000);
      else setStatus("failed");
    }

    poll();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [paymentRef, slug, router]);

  if (status === "confirmed") {
    return (
      <div className="booking-verify-pill" data-state="confirmed">
        <CheckCircle2 className="size-4 shrink-0" />
        <span className="font-medium">Payment confirmed</span>
      </div>
    );
  }

  if (status === "polling") {
    return (
      <div className="booking-verify-pill" data-state="polling">
        <Loader2 className="size-4 shrink-0 animate-spin" />
        <span>Confirming your payment…</span>
      </div>
    );
  }

  return (
    <div className="booking-verify-note">
      We could not confirm the payment yet. If you were charged, it will appear
      shortly — otherwise use the secure payment button below.
    </div>
  );
}
