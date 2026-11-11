import { ImageResponse } from "next/og";

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
          <div style={{ display: "flex", alignItems: "flex-end", gap: 5 }}>
            <div
              style={{
                width: 9,
                height: 22,
                backgroundColor: "#F4F4F0",
              }}
            />
            <div
              style={{
                width: 9,
                height: 35,
                backgroundColor: "#D8B25C",
              }}
            />
            <div
              style={{
                width: 9,
                height: 27,
                backgroundColor: "#F4F4F0",
              }}
            />
          </div>
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
