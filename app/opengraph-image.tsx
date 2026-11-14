import { ImageResponse } from "next/og";
import { BRAND, GLYPH_VIEWBOX, MARK_DISC, MARK_WINDOW_PATH } from "@/lib/brand/mark";

export const alt = "Oriel: hotel software for independent hotels and guesthouses";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social card: ink ground, the mark and wordmark, the headline, one marigold field. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: BRAND.ink,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: 760,
            padding: 72,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <svg viewBox={GLYPH_VIEWBOX} width={48} height={48}>
              <circle cx={MARK_DISC.cx} cy={MARK_DISC.cy} r={MARK_DISC.r} fill={BRAND.sun} />
              <path d={MARK_WINDOW_PATH} fill={BRAND.ink} />
            </svg>
            <span style={{ color: "#FFFFFF", fontSize: 44, fontWeight: 800, letterSpacing: "-0.05em" }}>
              oriel
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                color: "#FFFFFF",
                fontSize: 80,
                fontWeight: 800,
                lineHeight: 0.98,
                letterSpacing: "-0.045em",
              }}
            >
              <span>Run a calmer</span>
              <span>front desk.</span>
            </div>
            <div style={{ color: "#B8B3AA", fontSize: 28, lineHeight: 1.35 }}>
              Bookings, rooms, mobile money and the night audit for independent hotels.
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            margin: 40,
            borderRadius: 40,
            backgroundColor: BRAND.sun,
          }}
        >
          <svg viewBox={GLYPH_VIEWBOX} width={260} height={260}>
            <circle cx={MARK_DISC.cx} cy={MARK_DISC.cy} r={MARK_DISC.r} fill={BRAND.ink} />
            <path d={MARK_WINDOW_PATH} fill={BRAND.sun} />
          </svg>
        </div>
      </div>
    ),
    size,
  );
}
