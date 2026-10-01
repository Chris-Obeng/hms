"use client";

import * as React from "react";

/**
 * Runs `onReady` once, after the first real interaction with the page.
 *
 * Apple is explicit that an alert must not interrupt app launch — "Avoid showing
 * an alert when your app starts" (HIG › Alerts › Best practices) — and that
 * access should be requested only once someone shows interest in the feature
 * (HIG › Privacy › Best practices). A prompt therefore waits for a tap, a key,
 * a scroll or a touch, then lets that gesture settle (`settleMs`) before taking
 * focus, instead of firing on a timer.
 *
 * `enabled` gates the listener entirely, so a prompt that is already dismissed,
 * unsupported or paused costs nothing.
 */
export function useFirstInteraction(
  enabled: boolean,
  onReady: () => void,
  settleMs = 600
): void {
  const callback = React.useRef(onReady);

  React.useEffect(() => {
    callback.current = onReady;
  }, [onReady]);

  React.useEffect(() => {
    if (!enabled) return;

    const events = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
    let timer: number | undefined;

    const onFirst = () => {
      for (const event of events) window.removeEventListener(event, onFirst);
      timer = window.setTimeout(() => callback.current(), settleMs);
    };

    for (const event of events) {
      window.addEventListener(event, onFirst, { passive: true });
    }

    return () => {
      for (const event of events) window.removeEventListener(event, onFirst);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [enabled, settleMs]);
}
