"use client";

import * as React from "react";
import { Toast, ToastQueue } from "@heroui/react";

/**
 * Toasts for the guest booking pages, on their own HeroUI queue so they can
 * sit somewhere other than the dashboard's bottom-centre region.
 *
 * Below the lg breakpoint the booking pages pin their main action (Continue,
 * Book now) to the bottom of the screen, and a bottom toast covered it until
 * it timed out. There they show at the top instead; on wider screens they
 * stay at the bottom like everywhere else.
 */
const queue = new ToastQueue({ maxVisibleToasts: 3 });

/** Matches HeroUI's default `toast` timeout. */
const TIMEOUT_MS = 4000;

export const bookingToast = {
  danger(title: React.ReactNode, options?: { description?: React.ReactNode }) {
    return queue.add({ title, description: options?.description, variant: "danger" }, { timeout: TIMEOUT_MS });
  },
};

const STACKED_FOOTER_QUERY = "(max-width: 1023px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(STACKED_FOOTER_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function BookingToastProvider() {
  const hasStickyFooter = React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(STACKED_FOOTER_QUERY).matches,
    () => false
  );

  return (
    <Toast.Provider
      queue={queue}
      placement={hasStickyFooter ? "top" : "bottom"}
      className="booking-portal"
    />
  );
}
