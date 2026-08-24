import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

export const WIDTH = 1280;
export const HEIGHT = 720;
export const SCENE_FRAMES = 150;
export const DURATION_IN_FRAMES = SCENE_FRAMES * 4;

export function ProductDemo() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(120% 90% at 50% 0%, rgba(212,175,55,0.10), transparent 55%), #0a0f0d",
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
    </div>
  );
}

/*
 * Scene shell: absolutely positioned full-size layer whose opacity is driven by
 * the local timeline.
 */
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
  const rise = interpolate(local, [0, 18], [18, 0], {
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

function WindowChrome({ title }: { title: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 44,
        padding: "0 16px",
        borderBottom: "1px solid rgba(245,240,232,0.07)",
      }}
    >
      <div style={{ display: "flex", gap: 7 }}>
        <Dot color="rgba(239,68,68,0.45)" />
        <Dot color="rgba(234,179,8,0.45)" />
        <Dot color="rgba(34,197,94,0.45)" />
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "rgba(245,240,232,0.35)",
        }}
      >
        {title}
      </span>
      <span style={{ width: 40 }} />
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: color }}
    />
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
        borderRadius: 20,
        border: "1px solid rgba(245,240,232,0.09)",
        backgroundColor: "#10151299",
        overflow: "hidden",
        boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
      }}
    >
      {children}
    </div>
  );
}

function StepPill({ step }: { step: string }) {
  return (
    <span
      style={{
        position: "absolute",
        top: 40,
        left: "50%",
        transform: "translateX(-50%)",
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: "0.02em",
        color: "#e5c158",
        border: "1px solid rgba(212,175,55,0.35)",
        backgroundColor: "rgba(212,175,55,0.08)",
        padding: "6px 14px",
        borderRadius: 999,
      }}
    >
      {step}
    </span>
  );
}

/* ── Scene 1: booking lands ──────────────────────────────────── */

function BookingScene() {
  const frame = useCurrentFrame();
  const slide = interpolate(frame, [8, 26], [-56, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <>
      <StepPill step="A booking comes in" />
      <StageCard width={520}>
        <WindowChrome title="RoomLine · New booking" />
        <div style={{ padding: "22px 24px 26px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span
              style={{
                width: 46,
                height: 46,
                borderRadius: 14,
                backgroundColor: "rgba(212,175,55,0.14)",
                color: "#e5c158",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
              }}
            >
              KW
            </span>
            <div>
              <p style={{ fontSize: 17, fontWeight: 700, color: "#f5f0e8" }}>
                Kwabena Mensah
              </p>
              <p style={{ fontSize: 13, color: "rgba(245,240,232,0.5)" }}>
                Booked online · Ashanti Suites, Kumasi
              </p>
            </div>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11,
                fontWeight: 700,
                color: "#34d399",
                border: "1px solid rgba(52,211,153,0.35)",
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
      {/* notification toast sliding in */}
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
          border: "1px solid rgba(245,240,232,0.1)",
          backgroundColor: "#14191588",
          fontSize: 13,
          color: "#f5f0e8",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            backgroundColor: "#e5c158",
          }}
        />
        Front desk calendar updated
      </div>
    </>
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
        border: "1px solid rgba(245,240,232,0.08)",
        padding: "10px 12px",
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "rgba(245,240,232,0.38)",
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
          color: accent ? "#e5c158" : "#f5f0e8",
        }}
      >
        {value}
      </p>
    </div>
  );
}

/* ── Scene 2: calendar updates ───────────────────────────────── */

type Block = {
  room: string;
  type: string;
  colStart: number;
  span: number;
  label: string;
  sub?: string;
  tone: "gold" | "emerald" | "neutral";
};

const CAL_ROWS: Block[] = [
  { room: "101", type: "Standard", colStart: 1, span: 3, label: "Ama Owusu", sub: "Paid · MoMo", tone: "emerald" },
  { room: "102", type: "Deluxe", colStart: 3, span: 4, label: "Kwabena Mensah", sub: "Confirmed", tone: "gold" },
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
      <StepPill step="Your calendar fills itself" />
      <StageCard width={620}>
        <WindowChrome title="RoomLine · Front desk · Aug 24–30" />
        <div style={{ padding: "18px 20px 22px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "86px repeat(7, 1fr)",
              fontSize: 11,
              fontWeight: 600,
              color: "rgba(245,240,232,0.4)",
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
                  <span style={{ fontSize: 12, color: "rgba(245,240,232,0.55)" }}>
                    <b style={{ color: "#f5f0e8" }}>{b.room}</b> {b.type}
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
                            border: "1px dashed rgba(245,240,232,0.1)",
                          }}
                        />
                      );
                    }
                    const isFirst = cell + 1 === b.colStart;
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
                          color: b.tone === "gold" ? "#e5c158" : "#34d399",
                          backgroundColor:
                            b.tone === "gold"
                              ? "rgba(212,175,55,0.12)"
                              : "rgba(52,211,153,0.1)",
                          border:
                            b.tone === "gold"
                              ? "1px solid rgba(212,175,55,0.4)"
                              : "1px solid rgba(52,211,153,0.35)",
                        }}
                      >
                        {isFirst
                          ? `${b.label}${b.sub ? ` · ${b.sub}` : ""}`
                          : ""}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {/* highlight sweep on the new booking */}
          <div
            style={{
              marginTop: 14,
              fontSize: 12,
              color: "rgba(245,240,232,0.5)",
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
                backgroundColor: "#e5c158",
                transform: `scaleX(${grow})`,
                transformOrigin: "left",
              }}
            />
            Room 102 held automatically for Kwabena&apos;s dates
          </div>
        </div>
      </StageCard>
    </>
  );
}

/* ── Scene 3: payment confirmed ──────────────────────────────── */

function PaymentScene() {
  const frame = useCurrentFrame();
  const checkScale = interpolate(frame, [14, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <>
      <StepPill step="Money settles to you" />
      <StageCard width={500}>
        <WindowChrome title="RoomLine · Payment received" />
        <div style={{ padding: "22px 24px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                backgroundColor: "rgba(52,211,153,0.14)",
                border: "1px solid rgba(52,211,153,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: `scale(${checkScale})`,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M4 10.5l4 4 8-9"
                  stroke="#34d399"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <div>
              <p style={{ fontSize: 18, fontWeight: 800, color: "#f5f0e8", fontVariantNumeric: "tabular-nums" }}>
                GHS 1,548.80
              </p>
              <p style={{ fontSize: 13, color: "rgba(245,240,232,0.5)" }}>
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
                  color: "rgba(245,240,232,0.62)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <span>{k}</span>
                <span>{v}</span>
              </div>
            ))}
            <div
              style={{
                borderTop: "1px solid rgba(245,240,232,0.08)",
                paddingTop: 10,
                display: "flex",
                justifyContent: "space-between",
                fontSize: 14,
                fontWeight: 700,
                color: "#f5f0e8",
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
      <StepPill step="Night audit closes the day" />
      <StageCard width={540}>
        <WindowChrome title="RoomLine · Night audit · Sun 23 Aug" />
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
              border: "1px solid rgba(245,240,232,0.08)",
              padding: "14px 16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "rgba(245,240,232,0.55)" }}>
              <span>Occupancy</span>
              <b style={{ color: "#f5f0e8" }}>82%</b>
            </div>
            <div
              style={{
                marginTop: 8,
                height: 8,
                borderRadius: 999,
                backgroundColor: "rgba(245,240,232,0.08)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${82 * barGrow}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: "linear-gradient(90deg, #b98f22, #e5c158)",
                }}
              />
            </div>
            <div
              style={{
                marginTop: 12,
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
                color: "rgba(245,240,232,0.55)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span>ADR</span>
              <b style={{ color: "#f5f0e8" }}>GHS 512</b>
            </div>
            <div
              style={{
                marginTop: 6,
                display: "flex",
                justifyContent: "space-between",
                fontSize: 15,
                fontWeight: 800,
                color: "#e5c158",
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
            <span style={{ fontSize: 12, color: "rgba(245,240,232,0.45)" }}>
              Reports update instantly
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#0a0f0d",
                backgroundColor: "#e5c158",
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
