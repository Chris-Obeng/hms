import { interpolate } from "remotion/no-react";

/**
 * Shared timing and sizing for the landing-page product films.
 *
 * Scenes are pure functions of `frame`, so the same markup renders three ways:
 * inside the Remotion Player, as a server-rendered poster (frame 0), and as a
 * still for reduced motion. `remotion/no-react` gives us `interpolate` without
 * pulling Remotion's React runtime into the page's first bundle.
 */

/** Cubic Bézier easing, same maths as CSS `cubic-bezier()`. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const ax = 3 * x1 - 3 * x2 + 1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;
  const ay = 3 * y1 - 3 * y2 + 1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const err = sampleX(t) - x;
      const d = slopeX(t);
      if (Math.abs(err) < 1e-5 || Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    return sampleY(Math.min(1, Math.max(0, t)));
  };
}

/** Strong ease-out for things entering or responding. */
export const easeOut = bezier(0.23, 1, 0.32, 1);
/** Ease-in-out for things that move or morph on screen. */
export const easeInOut = bezier(0.77, 0, 0.175, 1);

/**
 * 0 → 1 progress between two frames, clamped, eased. Seconds in, so timings
 * read like a script and survive an fps change.
 */
export function progress(
  frame: number,
  fps: number,
  fromSec: number,
  toSec: number,
  easing: (t: number) => number = easeOut,
) {
  return interpolate(frame, [fromSec * fps, toSec * fps], [0, 1], {
    easing,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/** Linear mix between two numbers. */
export const mix = (from: number, to: number, t: number) => from + (to - from) * t;

/**
 * A scene length in composition pixels. Inside the Player `--u` is 1px (the
 * Player scales the whole stage); on the server-rendered poster `--u` is set
 * from the frame's container width, so the poster and frame 0 match exactly.
 */
export const u = (n: number) => `calc(${n} * var(--u, 1px))`;

/**
 * Cedis the way the product prints them: "GHS 1,350" or "GHS 1,360.00".
 * Formatted by hand so server and browser always agree (no locale data).
 */
export function ghs(n: number, decimals = 0) {
  const fixed = Math.abs(n).toFixed(decimals);
  const [whole, frac] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `GHS ${n < 0 ? "-" : ""}${grouped}${frac ? `.${frac}` : ""}`;
}

export const FILM_FONT = 'var(--rl-font-text, "Plus Jakarta Sans"), ui-sans-serif, system-ui, sans-serif';

/** Film palette: the brand tokens as literals, so Remotion Studio renders them too. */
export const C = {
  canvas: "#FFFFFF",
  paper: "#FBFAF7",
  paper2: "#F2F0EB",
  ink: "#141413",
  text: "#1F1E1C",
  muted: "#5F5B55",
  line: "rgba(20, 20, 19, 0.1)",
  lineStrong: "rgba(20, 20, 19, 0.18)",
  onInk: "#FFFFFF",
  onInkMuted: "#B8B3AA",
  sun: "#FFC23D",
  sunDeep: "#8A5A00",
  sunWash: "#FFF1CC",
  lagoonWash: "#E4F3FF",
  ok: "#1F7A4D",
  okWash: "#DDF5E6",
} as const;
