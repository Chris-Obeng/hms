"use client";

import * as React from "react";

/**
 * Registers the root-scope service worker. Idempotent: the browser dedupes
 * registrations for the same script URL and scope.
 */
export function SwRegister() {
  React.useEffect(() => {
    // Match the previous next-pwa behavior: no service worker in development,
    // so cached chunks never fight HMR.
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Offline + push features stay unavailable; app works normally.
    });
  }, []);
  return null;
}
