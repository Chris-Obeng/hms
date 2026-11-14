/**
 * Oriel brand mark: the single source of truth for its geometry and colour.
 *
 * An oriel is a bay window that throws light into a room. The mark is a
 * marigold sun with an arched window cut through it: the "O" of Oriel, and
 * light seen through a window. Two shapes, so it holds at 16 px.
 *
 * Everything is drawn on a 512 × 512 grid so the app-icon tile, the PWA icon
 * set (scripts/generate-pwa-icons.mjs), the OG image and the in-app React mark
 * all render the same shapes. Keep this module dependency-free: the icon
 * script imports it directly with Node's type stripping.
 */

export const BRAND = {
  /** Near-black ink: tile background and the window. */
  ink: "#141413",
  /** Marigold sun: the disc. */
  sun: "#FFC23D",
  /** Warm white paper. */
  paper: "#FBFAF7",
} as const;

/** The sun disc. */
export const MARK_DISC = { cx: 256, cy: 256, r: 158 } as const;

/** The arched window cut through the disc (filled). */
export const MARK_WINDOW_PATH = "M204 342V222a52 52 0 0 1 104 0v120z";

/** Corner radius of the rounded app-icon tile on the 512 grid. */
export const TILE_RADIUS = 112;

/** Tight bounds of the disc on the 512 grid. Use as the viewBox without the tile. */
export const GLYPH_VIEWBOX = "98 98 316 316";

type MarkColors = { disc: string; window: string };

function markShapes({ disc, window }: MarkColors): string {
  const { cx, cy, r } = MARK_DISC;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${disc}"/><path d="${MARK_WINDOW_PATH}" fill="${window}"/>`;
}

const TILE_COLORS: MarkColors = { disc: BRAND.sun, window: BRAND.ink };

/** Rounded-square app icon (transparent corners). Favicons, `any` icons, UI. */
export function tileSvg(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
    `<rect width="512" height="512" rx="${TILE_RADIUS}" fill="${BRAND.ink}"/>` +
    markShapes(TILE_COLORS) +
    `</svg>`
  );
}

/**
 * Full-bleed square with the mark scaled about the centre. `scale` keeps the
 * disc inside a platform's safe zone: maskable icons need everything inside
 * the centred circle of radius 40% (web.dev › Maskable icons), iOS rounds the
 * corners of apple-touch-icon itself and paints transparency black.
 */
export function fullBleedSvg(scale = 1): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
    `<rect width="512" height="512" fill="${BRAND.ink}"/>` +
    `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">` +
    markShapes(TILE_COLORS) +
    `</g></svg>`
  );
}

/**
 * Single-colour silhouette on transparency, for notification badges and the
 * manifest `monochrome` icon. Platforms keep only the alpha channel, so the
 * window is punched out of the disc.
 */
export function monochromeSvg(scale = 1): string {
  const { cx, cy, r } = MARK_DISC;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
    `<defs><mask id="w"><rect width="512" height="512" fill="#fff"/>` +
    `<path d="${MARK_WINDOW_PATH}" fill="#000"/></mask></defs>` +
    `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" mask="url(#w)"/>` +
    `</g></svg>`
  );
}
