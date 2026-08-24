import { ImageResponse } from "next/og";

export const alt = "RoomLine — hotel management for Ghana and across Africa";
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
          backgroundColor: "#0a0f0d",
          padding: 72,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: "#d4af37",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="7" width="6" height="8" rx="1" fill="#0a0f0d" />
              <rect x="9" y="4" width="6" height="11" rx="1" fill="#0a0f0d" fillOpacity="0.55" />
            </svg>
          </div>
          <span style={{ color: "#f5f0e8", fontSize: 30, fontWeight: 700 }}>
            RoomLine
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              color: "#f5f0e8",
              fontSize: 64,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              maxWidth: 900,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Run your whole hotel</span>
            <span style={{ color: "#e5c158" }}>from one screen.</span>
          </div>
          <div style={{ color: "rgba(245,240,232,0.55)", fontSize: 26 }}>
            Bookings · mobile money and card payments · night audit
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {[82, 64, 40].map((w, i) => (
            <div
              key={i}
              style={{
                width: w * 2,
                height: 14,
                borderRadius: 8,
                backgroundColor:
                  i === 0 ? "#d4af37" : "rgba(245,240,232,0.14)",
              }}
            />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
