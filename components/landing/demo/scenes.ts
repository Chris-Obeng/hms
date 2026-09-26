/*
 * Everything about the demo that is not Remotion: how long the loop runs, which
 * canvas it draws on, and the one caption shown beside it on the page.
 *
 * Deliberately free of `remotion` imports so the landing page can server-render
 * the window chrome and the pre-hydration skeleton without pulling the player
 * bundle into the initial payload. product-demo.tsx re-exports it for the
 * animation side.
 */

export const FPS = 30;

/** Two canvases: a desk (wide) and a phone (tall), matching the CSS stage. */
export const SIZES = {
  desktop: { width: 1152, height: 720 },
  mobile: { width: 480, height: 640 },
} as const;

export type DemoSize = keyof typeof SIZES;

/** One scene: a folio settling. ~9s, with a hold tail before the crossfade loop. */
export const DURATION_IN_FRAMES = 270;

/** Loop length in seconds — quoted on the page. */
export const DURATION_SECONDS = Math.round(DURATION_IN_FRAMES / FPS);

/** The single caption under the window. */
export const CAPTION = {
  label: "A payment clears",
  text: "A guest folio is settled — mobile money, cash or card. The balance counts down, the status turns from awaiting to paid, and the amount lands in tonight’s audit.",
} as const;
