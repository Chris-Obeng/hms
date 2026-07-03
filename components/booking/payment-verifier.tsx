"use client";

import * as React from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

interface Props {
  paymentRef: string;
  slug: string;
  bookingRef: string;
}

export function PaymentVerifier({ paymentRef, slug, bookingRef }: Props) {
  const [status, setStatus] = React.useState<"polling" | "confirmed" | "failed">("polling");

  React.useEffect(() => {
    let attempts = 0;
    const MAX = 8;

    async function poll() {
      try {
        const res = await fetch(
          `/api/booking/${encodeURIComponent(slug)}/payments/verify?reference=${encodeURIComponent(paymentRef)}`
        );
        const data = await res.json();
        if (data.verified) {
          setStatus("confirmed");
          return;
        }
      } catch {
        // network blip — keep trying
      }
      attempts++;
      if (attempts < MAX) setTimeout(poll, 2000);
      else setStatus("failed");
    }

    poll();
  }, [paymentRef, slug]);

  if (status === "confirmed") {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 mb-4">
        <CheckCircle2 className="size-4 shrink-0" />
        <span className="font-medium">Payment confirmed</span>
      </div>
    );
  }

  if (status === "polling") {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-[#78716C] bg-[#F5F4F2] border border-[#E7E5E4] rounded-xl px-4 py-2.5 mb-4">
        <Loader2 className="size-4 shrink-0 animate-spin" />
        <span>Confirming payment…</span>
      </div>
    );
  }

  return (
    <div className="text-xs text-[#A8A29E] text-center mb-4">
      Payment verification pending. Your booking is reserved — check your email for confirmation.
    </div>
  );
}
