/**
 * RoomLine brand mark — the single source of truth for its geometry and colour.
 *
 * The mark is an arched doorway with its door swung open: marigold light
 * fills the room behind it, and the threshold runs on past the right jamb as a
 * single line. Room + line.
 *
 * Everything is drawn on a 512 × 512 grid so the app-icon tile, the PWA icon
 * set (scripts/generate-pwa-icons.mjs), the OG image and the in-app React mark
 * all render the same shapes. Keep this module dependency-free: the icon
 * script imports it directly with Node's type stripping.
 */

export const BRAND = {
  /** Near-black ink — tile background and the open door leaf. */
  ink: "#141413",
  /** Marigold sun — the lit room behind the door. */
  sun: "#FFC23D",
  /** Paper — the door frame and threshold line. */
  paper: "#FBFAF7",
} as const;

/** Lit interior of the doorway (filled). */
export const MARK_LIGHT_PATH = "M140 368V232a92 92 0 0 1 184 0v136z";

/** The open door leaf, hinged on the left jamb and swung inward (filled). */
export const MARK_LEAF_PATH = "M140 368V226l82 24v104z";

/** Door frame and threshold line (stroked, round caps and joins). */
export const MARK_FRAME_PATH = "M140 368V232a92 92 0 0 1 184 0v136M140 368h236";

export const MARK_STROKE_WIDTH = 36;

/** Corner radius of the rounded app-icon tile on the 512 grid. */
export const TILE_RADIUS = 112;

/**
 * Tight bounds of the glyph on the 512 grid, including the stroke:
 * x 122–394, y 122–386. Use as the viewBox when rendering without the tile.
 */
export const GLYPH_VIEWBOX = "122 122 272 264";

type MarkColors = { light: string; leaf: string; frame: string };

function markShapes({ light, leaf, frame }: MarkColors): string {
  return (
    `<path d="${MARK_LIGHT_PATH}" fill="${light}"/>` +
    `<path d="${MARK_LEAF_PATH}" fill="${leaf}"/>` +
    `<path d="${MARK_FRAME_PATH}" fill="none" stroke="${frame}" stroke-width="${MARK_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

const TILE_COLORS: MarkColors = { light: BRAND.sun, leaf: BRAND.ink, frame: BRAND.paper };

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
 * Full-bleed square with the glyph scaled about the centre. `scale` keeps the
 * glyph inside a platform's safe zone: maskable icons need everything inside
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
 * door leaf is punched out of the lit interior to stay legible.
 */
export function monochromeSvg(scale = 1): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
    `<defs><mask id="leaf"><rect width="512" height="512" fill="#fff"/>` +
    `<path d="${MARK_LEAF_PATH}" fill="#000"/></mask></defs>` +
    `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">` +
    `<path d="${MARK_LIGHT_PATH}" fill="#fff" mask="url(#leaf)"/>` +
    `<path d="${MARK_FRAME_PATH}" fill="none" stroke="#fff" stroke-width="${MARK_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</g></svg>`
  );
}
