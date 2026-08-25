import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

/*
 * Remotion product demo — the hero's signature moment.
 * Four scenes follow one booking end-to-end: an OTA reservation lands,
 * the calendar holds room 204, mobile money confirms, night audit closes.
 * Light UI to match the actual product; every number Ghana-specific
 * (GHS totals, VAT/NHIL/GETFund/levy breakdown, MTN MoMo).
 */

export const WIDTH = 1280;
export const HEIGHT = 720;
export const SCENE_FRAMES = 150;
export const DURATION_IN_FRAMES = SCENE_FRAMES * 4;

const INK = "#0f1c33";
const MUTED = "#5a6a85";
const HAIRLINE = "#e5eaf2";
const TINT = "#f6f8fc";
const CARD = "#ffffff";
const ACCENT = "#3b4fd8";
const SUCCESS = "#0e8a5f";
const SOFT_SUCCESS = "#e7f6ef";

export function ProductDemo() {
  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(120% 90% at 50% -10%, #eef2fa 0%, transparent 60%), linear-gradient(180deg, #f8fafd 0%, #f1f5fb 100%)",
        fontFamily:
          "var(--font-jakarta), system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <SceneLayer offset={0}>
        <BookingScene />
      </SceneLayer>
      <SceneLayer offset={1 * SCENE_FRAMES}>
        <CalendarScene />
      </SceneLayer>
      <SceneLayer offset={2 * SCENE_FRAMES}>
        <PaymentScene />
      </SceneLayer>
      <SceneLayer offset={3 * SCENE_FRAMES}>
        <NightAuditScene />
      </SceneLayer>
    </AbsoluteFill>
  );
}

function SceneLayer({
  offset,
  children,
}: {
  offset: number;
  children: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const local = frame - offset;
  const fadeIn = interpolate(local, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(local, [SCENE_FRAMES - 14, SCENE_FRAMES], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rise = interpolate(local, [0, 18], [14, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const visible = local >= 0 && local < SCENE_FRAMES;
  return (
    <AbsoluteFill
      style={{
        opacity: Math.min(fadeIn, fadeOut),
        transform: `translateY(${rise}px)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {visible ? children : null}
    </AbsoluteFill>
  );
}

/* ── Shared bits ─────────────────────────────────────────────── */

function StepPill({ step }: { step: string }) {
  return (
    <span
      style={{
        position: "absolute",
        top: 44,
        left: "50%",
        transform: "translateX(-50%)",
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: "0.01em",
        color: INK,
        backgroundColor: CARD,
        border: `1px solid ${HAIRLINE}`,
        boxShadow: "0 2px 8px rgba(15,28,51,0.06)",
        padding: "7px 16px",
        borderRadius: 999,
      }}
    >
      {step}
    </span>
  );
}

function StageCard({
  children,
  width = 560,
}: {
  children: React.ReactNode;
  width?: number;
}) {
  return (
    <div
      style={{
        width,
        borderRadius: 18,
        border: `1px solid ${HAIRLINE}`,
        backgroundColor: CARD,
        overflow: "hidden",
        boxShadow:
          "0 1px 2px rgba(15,28,51,0.05), 0 12px 32px rgba(15,28,51,0.08), 0 32px 64px -16px rgba(15,28,51,0.14)",
      }}
    >
      {children}
    </div>
  );
}

function Fact({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 12,
        border: `1px solid ${HAIRLINE}`,
        backgroundColor: TINT,
        padding: "10px 12px",
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.09em",
          textTransform: "uppercase",
          color: MUTED,
        }}
      >
        {label}
      </p>
      <p
        style={{
          marginTop: 3,
          fontSize: 14,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: accent ? ACCENT : INK,
        }}
      >
        {value}
      </p>
    </div>
  );
}

/* ── Scene 1: a booking comes in ─────────────────────────────── */

function BookingScene() {
  const frame = useCurrentFrame();
  const slide = interpolate(frame, [8, 26], [-56, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <>
      <StepPill step="A Booking.com reservation lands" />
      <StageCard width={520}>
        <div style={{ padding: "22px 24px 26px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span
              style={{
                width: 46,
                height: 46,
                borderRadius: 14,
                backgroundColor: TINT,
                border: `1px solid ${HAIRLINE}`,
                color: ACCENT,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 17,
                fontWeight: 700,
              }}
            >
              KM
            </span>
            <div>
              <p style={{ fontSize: 17, fontWeight: 700, color: INK }}>
                Kwabena Mensah
              </p>
              <p style={{ fontSize: 13, color: MUTED }}>
                Booked online · Ashanti Suites, Kumasi
              </p>
            </div>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11,
                fontWeight: 700,
                color: SUCCESS,
                backgroundColor: SOFT_SUCCESS,
                borderRadius: 999,
                padding: "4px 10px",
              }}
            >
              NEW
            </span>
          </div>
          <div
            style={{
              marginTop: 18,
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 10,
            }}
          >
            <Fact label="Room" value="Deluxe 204" />
            <Fact label="Nights" value="2 · Aug 24–26" />
            <Fact label="Total" value="GHS 1,548" accent />
          </div>
        </div>
      </StageCard>
      <div
        style={{
          position: "absolute",
          right: "calc(50% - 380px)",
          bottom: 64,
          transform: `translateX(${slide}px)`,
          opacity: interpolate(frame, [8, 20], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 16px",
          borderRadius: 14,
          border: `1px solid ${HAIRLINE}`,
          backgroundColor: CARD,
          boxShadow: "0 8px 24px rgba(15,28,51,0.10)",
          fontSize: 13,
          fontWeight: 500,
          color: INK,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            backgroundColor: SUCCESS,
          }}
        />
        Front desk calendar updated
      </div>
    </>
  );
}

/* ── Scene 2: the calendar fills itself ──────────────────────── */

type Block = {
  room: string;
  type: string;
  colStart: number;
  span: number;
  label: string;
  sub?: string;
  tone: "accent" | "emerald" | "neutral";
};

const CAL_ROWS: Block[] = [
  { room: "101", type: "Standard", colStart: 1, span: 3, label: "Ama Owusu", sub: "Paid · MoMo", tone: "emerald" },
  { room: "102", type: "Deluxe", colStart: 3, span: 4, label: "Kwabena Mensah", sub: "Confirmed", tone: "accent" },
  { room: "201", type: "Suite", colStart: 5, span: 2, label: "Walk-in", sub: "Cash", tone: "emerald" },
];

function CalendarScene() {
  const frame = useCurrentFrame();
  const grow = interpolate(frame, [10, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <>
      <StepPill step="Room 204 is held before check-in" />
      <StageCard width={620}>
        <div style={{ padding: "18px 20px 22px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "86px repeat(7, 1fr)",
              fontSize: 11,
              fontWeight: 600,
              color: MUTED,
              marginBottom: 8,
            }}
          >
            <span />
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
              <span key={d} style={{ textAlign: "center" }}>
                {d} {24 + i}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[0, 1, 2].map((row) => {
              const b = CAL_ROWS[row];
              return (
                <div
                  key={b.room}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "86px repeat(7, 1fr)",
                    alignItems: "center",
                    gap: 0,
                  }}
                >
                  <span style={{ fontSize: 12, color: MUTED }}>
                    <b style={{ color: INK }}>{b.room}</b> {b.type}
                  </span>
                  {Array.from({ length: 7 }, (_, cell) => {
                    const inBlock = cell + 1 >= b.colStart && cell + 1 < b.colStart + b.span;
                    if (!inBlock) {
                      return (
                        <span
                          key={cell}
                          style={{
                            height: 30,
                            margin: 2,
                            borderRadius: 8,
                            border: `1px dashed ${HAIRLINE}`,
                            backgroundColor: TINT,
                          }}
                        />
                      );
                    }
                    const isFirst = cell + 1 === b.colStart;
                    const toneBg =
                      b.tone === "accent" ? "#edf0fc" : b.tone === "emerald" ? SOFT_SUCCESS : TINT;
                    const toneBorder =
                      b.tone === "accent" ? "#c9d2f4" : b.tone === "emerald" ? "#bfe5d6" : HAIRLINE;
                    const toneText = b.tone === "accent" ? ACCENT : b.tone === "emerald" ? SUCCESS : MUTED;
                    return (
                      <span
                        key={cell}
                        style={{
                          height: 30,
                          margin: 2,
                          borderRadius: 8,
                          display: "flex",
                          alignItems: "center",
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                          fontSize: 11,
                          fontWeight: 600,
                          paddingLeft: 8,
                          color: toneText,
                          backgroundColor: toneBg,
                          border: `1px solid ${toneBorder}`,
                        }}
                      >
                        {isFirst ? `${b.label}${b.sub ? ` · ${b.sub}` : ""}` : ""}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div
            style={{
              marginTop: 14,
              fontSize: 12,
              color: MUTED,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                width: 18,
                height: 3,
                borderRadius: 2,
                backgroundColor: ACCENT,
                transform: `scaleX(${grow})`,
                transformOrigin: "left",
              }}
            />
            No overlap — double bookings blocked automatically
          </div>
        </div>
      </StageCard>
    </>
  );
}

/* ── Scene 3: money settles ──────────────────────────────────── */

function PaymentScene() {
  const frame = useCurrentFrame();
  const checkScale = interpolate(frame, [14, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <>
      <StepPill step="MTN Mobile Money confirms in seconds" />
      <StageCard width={500}>
        <div style={{ padding: "22px 24px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                backgroundColor: SOFT_SUCCESS,
                border: "1px solid #bfe5d6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: `scale(${checkScale})`,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M4 10.5l4 4 8-9"
                  stroke={SUCCESS}
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <div>
              <p style={{ fontSize: 18, fontWeight: 800, color: INK, fontVariantNumeric: "tabular-nums" }}>
                GHS 1,548.80
              </p>
              <p style={{ fontSize: 13, color: MUTED }}>
                MTN Mobile Money · ref 8837**** · Paystack
              </p>
            </div>
          </div>
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              ["Deluxe 204 · 2 nights", "GHS 1,280.00"],
              ["VAT 15%", "GHS 192.00"],
              ["NHIL + GETFund 5%", "GHS 64.00"],
              ["Tourism levy 1%", "GHS 12.80"],
            ].map(([k, v]) => (
              <div
                key={k}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  color: MUTED,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <span>{k}</span>
                <span>{v}</span>
              </div>
            ))}
            <div
              style={{
                borderTop: `1px solid ${HAIRLINE}`,
                paddingTop: 10,
                display: "flex",
                justifyContent: "space-between",
                fontSize: 14,
                fontWeight: 700,
                color: INK,
              }}
            >
              <span>Lands in your account</span>
              <span>Next settlement</span>
            </div>
          </div>
        </div>
      </StageCard>
    </>
  );
}

/* ── Scene 4: night audit closes ─────────────────────────────── */

function NightAuditScene() {
  const frame = useCurrentFrame();
  const barGrow = interpolate(frame, [16, 42], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <>
      <StepPill step="One tap closes the day" />
      <StageCard width={540}>
        <div style={{ padding: "22px 24px 26px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            <Fact label="Arrivals" value="6" />
            <Fact label="Departures" value="4" />
            <Fact label="No-shows" value="1" />
          </div>
          <div
            style={{
              marginTop: 14,
              borderRadius: 12,
              border: `1px solid ${HAIRLINE}`,
              padding: "14px 16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: MUTED }}>
              <span>Occupancy</span>
              <b style={{ color: INK }}>82%</b>
            </div>
            <div
              style={{
                marginTop: 8,
                height: 8,
                borderRadius: 999,
                backgroundColor: TINT,
                border: `1px solid ${HAIRLINE}`,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${82 * barGrow}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: ACCENT,
                }}
              />
            </div>
            <div
              style={{
                marginTop: 12,
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
                color: MUTED,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span>ADR</span>
              <b style={{ color: INK }}>GHS 512</b>
            </div>
            <div
              style={{
                marginTop: 6,
                display: "flex",
                justifyContent: "space-between",
                fontSize: 15,
                fontWeight: 800,
                color: ACCENT,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span>Room revenue</span>
              <span>GHS 18,740</span>
            </div>
          </div>
          <div
            style={{
              marginTop: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 12, color: MUTED }}>
              Reports update instantly
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#ffffff",
                backgroundColor: ACCENT,
                borderRadius: 10,
                padding: "8px 16px",
              }}
            >
              Close the day
            </span>
          </div>
        </div>
      </StageCard>
    </>
  );
}
