import {
  BRAND,
  GLYPH_VIEWBOX,
  MARK_FRAME_PATH,
  MARK_LEAF_PATH,
  MARK_LIGHT_PATH,
  MARK_STROKE_WIDTH,
  TILE_RADIUS,
} from "@/lib/brand/mark";
import { cn } from "@/lib/utils";

type MarkProps = {
  /** Rendered width and height in px. */
  size?: number;
  className?: string;
  /** Accessible name. Omit when the mark sits next to a visible "RoomLine". */
  title?: string;
};

function a11y(title?: string) {
  return title
    ? ({ role: "img", "aria-label": title } as const)
    : ({ "aria-hidden": true, focusable: false } as const);
}

/**
 * The RoomLine app-icon tile: the open-door glyph on a deep ink rounded square.
 * Use it wherever the product needs its icon (sidebars, headers, auth pages).
 */
export function RoomLineMark({ size = 32, className, title }: MarkProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      {...a11y(title)}
    >
      <rect width="512" height="512" rx={TILE_RADIUS} fill={BRAND.ink} />
      <path d={MARK_LIGHT_PATH} fill={BRAND.sun} />
      <path d={MARK_LEAF_PATH} fill={BRAND.ink} />
      <path
        d={MARK_FRAME_PATH}
        fill="none"
        stroke={BRAND.paper}
        strokeWidth={MARK_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The bare glyph for light surfaces: frame and leaf take `currentColor`
 * (ink by default), the lit room stays sun-lit. Sized by height; the glyph is
 * slightly wider than tall.
 */
export function RoomLineGlyph({ size = 24, className, title }: MarkProps) {
  return (
    <svg
      viewBox={GLYPH_VIEWBOX}
      height={size}
      width={Math.round((size * 272) / 264)}
      className={cn("shrink-0 text-[#141413]", className)}
      {...a11y(title)}
    >
      <path d={MARK_LIGHT_PATH} fill={BRAND.sun} />
      <path d={MARK_LEAF_PATH} fill="currentColor" />
      <path
        d={MARK_FRAME_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth={MARK_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
