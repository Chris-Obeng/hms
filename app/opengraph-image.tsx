import { ImageResponse } from "next/og";
import {
  BRAND,
  GLYPH_VIEWBOX,
  MARK_FRAME_PATH,
  MARK_LEAF_PATH,
  MARK_LIGHT_PATH,
  MARK_STROKE_WIDTH,
} from "@/lib/brand/mark";

export const alt =
  "RoomLine — Hotel software for independent properties in Ghana";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#10241E",
          padding: 72,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Open-door mark (lib/brand/mark.ts) on the ink background. */}
          <svg viewBox={GLYPH_VIEWBOX} width={41} height={40}>
            <path d={MARK_LIGHT_PATH} fill={BRAND.brass} />
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
          <span
            style={{
              color: "#F4F4F0",
              fontSize: 34,
              fontWeight: 700,
              letterSpacing: "-0.03em",
            }}
          >
            RoomLine.
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              color: "#F4F4F0",
              fontSize: 76,
              fontWeight: 700,
              lineHeight: 0.98,
              letterSpacing: "-0.04em",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Run a calmer</span>
            <span>front desk.</span>
          </div>
          <div style={{ color: "#A6B6B0", fontSize: 26, maxWidth: 820 }}>
            Reservations, rooms, Mobile Money payments, and night audit for
            independent hotels in Ghana.
          </div>
        </div>

        <div style={{ color: "#D8B25C", fontSize: 20, fontWeight: 600 }}>
          Accra, Ghana
        </div>
      </div>
    ),
    size,
  );
}
