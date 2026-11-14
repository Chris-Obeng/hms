import { BRAND, GLYPH_VIEWBOX, MARK_DISC, MARK_WINDOW_PATH, TILE_RADIUS } from "@/lib/brand/mark";
import { cn } from "@/lib/utils";

type MarkProps = {
  /** Rendered width and height in px. */
  size?: number;
  className?: string;
  /** Accessible name. Omit when the mark sits next to a visible "Oriel". */
  title?: string;
};

function a11y(title?: string) {
  return title
    ? ({ role: "img", "aria-label": title } as const)
    : ({ "aria-hidden": true, focusable: false } as const);
}

/**
 * The Oriel app-icon tile: the sun-and-window mark on an ink rounded square.
 * Use it where the product needs its icon (sidebars, app header).
 */
export function OrielMark({ size = 32, className, title }: MarkProps) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={cn("shrink-0", className)} {...a11y(title)}>
      <rect width="512" height="512" rx={TILE_RADIUS} fill={BRAND.ink} />
      <circle cx={MARK_DISC.cx} cy={MARK_DISC.cy} r={MARK_DISC.r} fill={BRAND.sun} />
      <path d={MARK_WINDOW_PATH} fill={BRAND.ink} />
    </svg>
  );
}

/**
 * The bare mark for any surface: marigold disc, window in `currentColor`
 * (ink by default; set the text colour to the background on dark surfaces
 * so the window reads as a cut-out).
 */
export function OrielGlyph({ size = 24, className, title }: MarkProps) {
  return (
    <svg
      viewBox={GLYPH_VIEWBOX}
      width={size}
      height={size}
      className={cn("shrink-0 text-[#141413]", className)}
      {...a11y(title)}
    >
      <circle cx={MARK_DISC.cx} cy={MARK_DISC.cy} r={MARK_DISC.r} fill={BRAND.sun} />
      <path d={MARK_WINDOW_PATH} fill="currentColor" />
    </svg>
  );
}

/** Mark + wordmark lockup. The wordmark is set in the brand face, lowercase. */
export function OrielLogo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <OrielGlyph size={size} />
      <span
        className="font-extrabold lowercase"
        style={{ fontSize: Math.round(size * 0.92), letterSpacing: "-0.05em", lineHeight: 1 }}
      >
        oriel
      </span>
    </span>
  );
}
