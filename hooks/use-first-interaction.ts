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
 * unsupported or paused costs nothing. Flipping `enabled` from false to true
 * re-arms the listener, which is what lets a late-arriving signal (like the
 * browser's install event) ask on the *next* interaction instead of missing its
 * turn forever.
 *
 * If `onReady` returns exactly `false` the listener re-arms for the next
 * interaction instead of being consumed — the mechanism that keeps two modal
 * asks from stacking (HIG › Modality › Best practices): whoever claims the
 * shared prompt turn opens, the other declines and waits its turn.
 */
export function useFirstInteraction(
  enabled: boolean,
  onReady: () => void | false,
  settleMs = 600,
): void {
  const callback = React.useRef(onReady);

  React.useEffect(() => {
    callback.current = onReady;
  }, [onReady]);

  React.useEffect(() => {
    if (!enabled) return;

    const events = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
    let timer: number | undefined;

    const arm = () => {
      for (const event of events) {
        window.addEventListener(event, onFirst, { passive: true });
      }
    };

    const disarm = () => {
      for (const event of events) window.removeEventListener(event, onFirst);
    };

    const onFirst = () => {
      disarm();
      timer = window.setTimeout(() => {
        // `false` declines the turn without consuming it: the listener re-arms
        // for the next interaction instead of letting two asks stack.
        if (callback.current() === false) arm();
      }, settleMs);
    };

    arm();

    return () => {
      disarm();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [enabled, settleMs]);
}
