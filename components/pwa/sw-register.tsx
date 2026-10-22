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
    if (process.env.NODE_ENV !== "production") {
      if ("serviceWorker" in navigator) {
        void navigator.serviceWorker.getRegistrations().then((registrations) =>
          Promise.all(
            registrations
              .filter((registration) => registration.active?.scriptURL.endsWith("/sw.js"))
              .map((registration) => registration.unregister()),
          ),
        );
      }
      return;
    }
    if (!("serviceWorker" in navigator)) return;
    // Fetch worker updates freshly; activation must never reload an active form.
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // Offline + push features stay unavailable; app works normally.
      });
  }, []);
  return null;
}
