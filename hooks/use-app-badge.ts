"use client";

import * as React from "react";

type BadgingNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/**
 * Mirrors a count onto the installed app's icon with the Badging API
 * (MDN › Badging API). `0` clears the badge. The service worker sets a plain
 * flag when a push arrives while the app is closed; the next render here
 * replaces it with the exact count.
 *
 * Unsupported browsers and non-installed tabs simply ignore it.
 */
export function useAppBadge(count: number) {
  React.useEffect(() => {
    const nav = navigator as BadgingNavigator;
    if (typeof nav.setAppBadge !== "function") return;
    const value = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    const update =
      value > 0
        ? nav.setAppBadge(value)
        : typeof nav.clearAppBadge === "function"
          ? nav.clearAppBadge()
          : nav.setAppBadge(0);
    // Rejects when the document lacks permission (e.g. not installed); nothing to do.
    void update?.catch(() => {});
  }, [count]);
}
