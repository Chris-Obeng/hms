import type { CSSProperties, ReactNode } from "react";
import { C, FILM_FONT, easeInOut, ghs, mix, progress, u } from "./timing";

/**
 * Hero film: the live room calendar.
 *
 * A booking arrives from the hotel's own booking page, paid with mobile money,
 * and draws onto the calendar; the week's numbers move; a waiting arrival is
 * checked in. Seven seconds, played once, holding on the final state.
 *
 * Booking colours are the product's own status palette
 * (app/dashboard/calendar/calendar.css), as hex so Remotion Studio renders
 * them too: confirmed is blue, in house is green, pending is amber, checked
 * out is slate, out of order is hatched.
 */

export type CalendarVariant = "wide" | "compact";

export const CALENDAR_FILM = {
  fps: 30,
  durationInFrames: 210,
  wide: { width: 1280, height: 800 },
  compact: { width: 390, height: 700 },
} as const;

type Status = "confirmed" | "inHouse" | "pending" | "checkedOut" | "blocked";

const STATUS: Record<Status, { label: string; fill: string; accent: string; ink: string; meta: string }> = {
  confirmed: { label: "Confirmed", fill: "#DCEBFF", accent: "#588CDA", ink: "#123780", meta: "#3F5F9E" },
  inHouse: { label: "In house", fill: "#0E8050", accent: "#01603A", ink: "#FFFFFF", meta: "#CDEEDB" },
  pending: { label: "Pending", fill: "#FBE6BF", accent: "#C5770F", ink: "#6E3602", meta: "#8E5310" },
  checkedOut: { label: "Checked out", fill: "#E6EAEF", accent: "#9AA3AE", ink: "#3A4350", meta: "#6B7480" },
  blocked: { label: "Out of order", fill: "#EEF0F3", accent: "#94A3B8", ink: "#475569", meta: "#64748B" },
};

type Stay = {
  room: string;
  guest: string;
  /** Day index on the visible range; negative means the stay began earlier. */
  start: number;
  nights: number;
  status: Status;
  meta: string;
};

type Layout = {
  w: number;
  h: number;
  pad: number;
  gridTop: number;
  headH: number;
  roomW: number;
  rowH: number;
  barH: number;
  days: { dow: string; date: string }[];
  today: number;
  rooms: { no: string; type: string }[];
  name: number;
  meta: number;
  /** Fixed day width; days past the edge are clipped, like a scrolled calendar. */
  colW?: number;
};

const WEEK = [
  { dow: "Thu", date: "13" },
  { dow: "Fri", date: "14" },
  { dow: "Sat", date: "15" },
  { dow: "Sun", date: "16" },
  { dow: "Mon", date: "17" },
  { dow: "Tue", date: "18" },
  { dow: "Wed", date: "19" },
];

const ROOMS = [
  { no: "101", type: "Standard" },
  { no: "102", type: "Standard" },
  { no: "103", type: "Standard" },
  { no: "104", type: "Deluxe" },
  { no: "201", type: "Deluxe" },
  { no: "202", type: "Deluxe" },
  { no: "203", type: "Suite" },
];

const LAYOUTS: Record<CalendarVariant, Layout> = {
  wide: {
    w: 1280, h: 800, pad: 44, gridTop: 212, headH: 60, roomW: 156,
    rowH: 64, barH: 46, days: WEEK, today: 1, rooms: ROOMS, name: 16, meta: 13,
  },
  compact: {
    w: 390, h: 700, pad: 20, gridTop: 212, headH: 60, roomW: 56,
    rowH: 70, barH: 52, days: WEEK.slice(1, 5), today: 0, colW: 128,
    rooms: ROOMS.filter((r) => r.no !== "103"), name: 16, meta: 13,
  },
};

/** Stays in week coordinates (Thu 13 = 0). The compact cut shifts them by one day. */
const STAYS: Stay[] = [
  { room: "101", guest: "Ama Owusu", start: -1, nights: 3, status: "inHouse", meta: "In house" },
  { room: "101", guest: "Selorm Adjei", start: 4, nights: 2, status: "pending", meta: "Pending · unpaid" },
  { room: "102", guest: "Daniel Okafor", start: 3, nights: 3, status: "confirmed", meta: "Confirmed · paid" },
  { room: "103", guest: "Esi Boateng", start: -1, nights: 2, status: "checkedOut", meta: "Checked out" },
  { room: "103", guest: "Sarah Lindqvist", start: 3, nights: 4, status: "confirmed", meta: "Confirmed" },
  { room: "201", guest: "Yaw Darko", start: -1, nights: 4, status: "inHouse", meta: "In house" },
  { room: "201", guest: "Akosua Addo", start: 5, nights: 2, status: "pending", meta: "Pending" },
  { room: "203", guest: "Kofi Asante", start: 0, nights: 3, status: "inHouse", meta: "In house" },
  { room: "203", guest: "AC repair", start: 5, nights: 2, status: "blocked", meta: "Out of order" },
];

const ARRIVAL: Stay = { room: "104", guest: "Kwesi Boateng", start: 1, nights: 3, status: "confirmed", meta: "Arriving today" };
const NEW_STAY: Stay = { room: "202", guest: "Nana Yaa Asare", start: 2, nights: 3, status: "confirmed", meta: "Confirmed · paid" };

const box = (s: CSSProperties): CSSProperties => ({ position: "absolute", boxSizing: "border-box", ...s });

export function CalendarScene({
  frame,
  fps = CALENDAR_FILM.fps,
  variant,
}: {
  frame: number;
  fps?: number;
  variant: CalendarVariant;
}) {
  const L = LAYOUTS[variant];
  const compact = variant === "compact";
  const shift = compact ? -1 : 0; // compact starts on Fri 14
  const daysW = L.w - L.pad * 2 - L.roomW;
  const colW = L.colW ?? daysW / L.days.length;
  const gridH = L.rooms.length * L.rowH;

  // Script
  const noteIn = progress(frame, fps, 0.6, 1.1);
  const noteOut = progress(frame, fps, 3.4, 3.7);
  const draw = progress(frame, fps, 1.3, 2.0, easeInOut);
  const ring = progress(frame, fps, 2.0, 2.3) * (1 - progress(frame, fps, 3.2, 3.8));
  const numbers = progress(frame, fps, 1.8, 2.6);
  const checkIn = progress(frame, fps, 4.4, 4.9);
  const inHouseTick = progress(frame, fps, 4.6, 5.1);

  const occupancy = Math.round(mix(71, 73, numbers));
  const revenue = Math.round(mix(38420, 39770, numbers) / 10) * 10;
  const inHouse = Math.round(mix(11, 12, inHouseTick));

  const rowOf = (room: string) => L.rooms.findIndex((r) => r.no === room);
  const place = (s: Stay) => ({ ...s, start: s.start + shift });

  const kpis = compact
    ? [
        { label: "In house", value: String(inHouse) },
        { label: "Revenue this week", value: ghs(revenue) },
      ]
    : [
        { label: "Occupancy", value: `${occupancy}%` },
        { label: "Revenue this week", value: ghs(revenue) },
        { label: "In house", value: String(inHouse) },
        { label: "Arrivals today", value: "6" },
      ];

  const bar = (s: Stay, extra?: Partial<BarProps>) => {
    const row = rowOf(s.room);
    if (row < 0) return null;
    return (
      <Bar
        key={`${s.room}-${s.guest}-${s.status}`}
        stay={place(s)}
        L={L}
        colW={colW}
        top={row * L.rowH}
        {...extra}
      />
    );
  };

  return (
    <div
      style={{
        position: "relative",
        width: u(L.w),
        height: u(L.h),
        overflow: "hidden",
        background: C.canvas,
        color: C.text,
        fontFamily: FILM_FONT,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1.25,
        letterSpacing: "-0.01em",
      }}
    >
      {/* ── Header ───────────────────────────────────────────────── */}
      {compact ? (
        <div style={box({ left: u(L.pad), right: u(L.pad), top: u(28), display: "flex", alignItems: "flex-end", justifyContent: "space-between" })}>
          <div>
            <div style={{ fontSize: u(14), color: C.muted }}>Labadi Courtyard</div>
            <div style={{ marginTop: u(2), fontSize: u(30), fontWeight: 800, color: C.ink, letterSpacing: "-0.04em" }}>
              Calendar
            </div>
          </div>
          <div
            style={{
              width: u(40),
              height: u(40),
              borderRadius: "50%",
              background: C.ink,
              color: C.onInk,
              display: "grid",
              placeItems: "center",
              fontSize: u(22),
              fontWeight: 500,
            }}
          >
            +
          </div>
        </div>
      ) : (
        <div style={box({ left: u(L.pad), right: u(L.pad), top: u(36), display: "flex", alignItems: "center", justifyContent: "space-between" })}>
          <div>
            <div style={{ fontSize: u(26), fontWeight: 800, color: C.ink, letterSpacing: "-0.035em" }}>Room calendar</div>
            <div style={{ marginTop: u(4), fontSize: u(14), color: C.muted }}>Labadi Courtyard · 24 rooms</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: u(12) }}>
            <span style={{ fontSize: u(14), fontWeight: 600, color: C.ink }}>13 – 19 Nov</span>
            <div style={{ display: "flex", padding: u(4), borderRadius: u(999), background: C.paper2 }}>
              {["Day", "Week", "Month"].map((t) => (
                <span
                  key={t}
                  style={{
                    padding: `${u(6)} ${u(14)}`,
                    borderRadius: u(999),
                    fontSize: u(13),
                    fontWeight: 600,
                    background: t === "Week" ? C.canvas : "transparent",
                    color: t === "Week" ? C.ink : C.muted,
                    boxShadow: t === "Week" ? `0 ${u(1)} ${u(3)} rgba(20,20,19,0.12)` : "none",
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── KPIs ─────────────────────────────────────────────────── */}
      <div
        style={box({
          left: u(L.pad),
          right: u(L.pad),
          top: u(compact ? 108 : 112),
          display: "grid",
          gridTemplateColumns: `repeat(${kpis.length}, minmax(0, 1fr))`,
          gap: u(compact ? 10 : 0),
        })}
      >
        {kpis.map((k, i) => (
          <div
            key={k.label}
            style={
              compact
                ? { padding: `${u(14)} ${u(14)}`, borderRadius: u(16), background: C.paper }
                : { paddingLeft: i === 0 ? 0 : u(24), borderLeft: i === 0 ? "none" : `${u(1)} solid ${C.line}` }
            }
          >
            <div style={{ fontSize: u(13), color: C.muted, whiteSpace: "nowrap" }}>{k.label}</div>
            <div style={{ marginTop: u(6), fontSize: u(compact ? 22 : 26), fontWeight: 800, color: C.ink, letterSpacing: "-0.035em", whiteSpace: "nowrap" }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Day header ───────────────────────────────────────────── */}
      {L.days.map((d, i) => {
        const isToday = i === L.today;
        return (
          <div
            key={d.date}
            style={box({
              left: u(L.pad + L.roomW + i * colW),
              top: u(L.gridTop),
              maxWidth: u(Math.max(0, daysW - i * colW)),
              width: u(colW),
              height: u(L.headH + gridH),
              background: isToday ? "rgba(255, 241, 204, 0.6)" : "transparent",
              borderLeft: `${u(1)} solid ${C.line}`,
              borderRadius: isToday ? `${u(12)} ${u(12)} 0 0` : 0,
            })}
          >
            <div style={{ height: u(L.headH), padding: `${u(10)} ${u(12)} 0`, display: "grid", alignContent: "start", gap: u(2) }}>
              <span style={{ fontSize: u(12), fontWeight: 600, color: isToday ? C.sunDeep : C.muted }}>
                {isToday ? `${d.dow} · Today` : d.dow}
              </span>
              <span style={{ fontSize: u(20), fontWeight: 800, letterSpacing: "-0.03em", color: i < L.today ? C.muted : C.ink }}>
                {d.date}
              </span>
            </div>
          </div>
        );
      })}

      {/* Past days sit back a little */}
      {L.today > 0 ? (
        <div
          style={box({
            left: u(L.pad + L.roomW),
            top: u(L.gridTop + L.headH),
            width: u(colW * L.today),
            height: u(gridH),
            background: `repeating-linear-gradient(135deg, rgba(20,20,19,0.025) 0 ${u(6)}, transparent ${u(6)} ${u(12)})`,
          })}
        />
      ) : null}

      {/* ── Rooms ───────────────────────────────────────────────── */}
      {L.rooms.map((room, i) => (
        <div
          key={room.no}
          style={box({
            left: u(L.pad),
            top: u(L.gridTop + L.headH + i * L.rowH),
            width: u(L.w - L.pad * 2),
            height: u(L.rowH),
            borderTop: `${u(1)} solid ${C.line}`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          })}
        >
          <div style={{ fontSize: u(15), fontWeight: 800, color: C.ink }}>{room.no}</div>
          <div style={{ fontSize: u(12), color: C.muted }}>{room.type}</div>
        </div>
      ))}

      {/* ── Stays (clipped to the visible days) ─────────────────── */}
      <div
        style={box({
          left: u(L.pad + L.roomW),
          top: u(L.gridTop + L.headH),
          width: u(daysW),
          height: u(gridH),
          overflow: "hidden",
        })}
      >
        {STAYS.map((s) => bar(s))}

        {/* Arrival: confirmed → in house, a crossfade masked with a little blur */}
        {bar(ARRIVAL, { textOpacity: 1 - checkIn, blur: checkIn * (1 - checkIn) * 4 })}
        {bar(
          { ...ARRIVAL, status: "inHouse", meta: "Checked in · 14:05" },
          { opacity: checkIn, textOpacity: checkIn, blur: checkIn * (1 - checkIn) * 4 },
        )}

        {/* New booking draws in from its check-in day */}
        {bar(NEW_STAY, { reveal: draw, ring })}

        {compact ? (
          <div
            style={box({
              right: 0,
              top: 0,
              width: u(36),
              height: "100%",
              background: `linear-gradient(to right, rgba(255,255,255,0), ${C.canvas})`,
            })}
          />
        ) : null}
      </div>

      {/* ── Legend ──────────────────────────────────────────────── */}
      {!compact ? (
        <div style={box({ left: u(L.pad + L.roomW), top: u(L.gridTop + L.headH + gridH + 20), display: "flex", gap: u(20) })}>
          {(["confirmed", "inHouse", "pending", "checkedOut", "blocked"] as Status[]).map((k) => (
            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: u(8), fontSize: u(13), color: C.muted }}>
              <span style={{ width: u(10), height: u(10), borderRadius: u(3), background: STATUS[k].fill, boxShadow: `inset 0 0 0 ${u(1.5)} ${STATUS[k].accent}` }} />
              {STATUS[k].label}
            </span>
          ))}
        </div>
      ) : null}

      {/* ── Notification ────────────────────────────────────────── */}
      <Notification
        compact={compact}
        style={{
          opacity: noteIn * (1 - noteOut),
          translate: `0 ${u((1 - noteIn) * -16 + noteOut * -12)}`,
          scale: String(mix(0.98, 1, noteIn)),
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: u(8) }}>
          <span style={{ fontSize: u(13), fontWeight: 600, color: C.muted }}>Oriel</span>
          <span style={{ fontSize: u(12), color: C.muted }}>now</span>
        </div>
        <div style={{ marginTop: u(2), fontSize: u(15), fontWeight: 700, color: C.ink }}>
          New booking from your booking page
        </div>
        <div style={{ marginTop: u(2), fontSize: u(14), color: C.text }}>
          Nana Yaa Asare · Room 202 · 3 nights
        </div>
        <div style={{ marginTop: u(2), fontSize: u(14), color: C.muted }}>
          {ghs(1350)} paid with MTN MoMo
        </div>
      </Notification>
    </div>
  );
}

function Notification({ compact, style, children }: { compact: boolean; style: CSSProperties; children: ReactNode }) {
  return (
    <div
      style={box({
        ...(compact ? { left: u(12), right: u(12), top: u(12) } : { right: u(44), top: u(284), width: u(400) }),
        display: "flex",
        gap: u(12),
        padding: u(14),
        borderRadius: u(22),
        background: "rgba(255,255,255,0.96)",
        border: `${u(1)} solid ${C.line}`,
        boxShadow: `0 ${u(1)} ${u(2)} rgba(20,20,19,0.06), 0 ${u(18)} ${u(40)} ${u(-12)} rgba(20,20,19,0.28)`,
        transformOrigin: "top center",
        zIndex: 3,
        ...style,
      })}
    >
      {/* Oriel app icon */}
      <svg viewBox="0 0 512 512" style={{ width: u(38), height: u(38), flexShrink: 0 }} aria-hidden="true">
        <rect width="512" height="512" rx="112" fill={C.ink} />
        <circle cx="256" cy="256" r="158" fill={C.sun} />
        <path d="M204 342V222a52 52 0 0 1 104 0v120z" fill={C.ink} />
      </svg>
      <div style={{ minWidth: 0, flex: 1 }}>{children}</div>
    </div>
  );
}

type BarProps = {
  stay: Stay;
  L: Layout;
  colW: number;
  top: number;
  opacity?: number;
  textOpacity?: number;
  reveal?: number;
  ring?: number;
  blur?: number;
};

function Bar({ stay, L, colW, top, opacity = 1, textOpacity = 1, reveal = 1, ring = 0, blur = 0 }: BarProps) {
  const visibleStart = Math.max(stay.start, 0);
  const visibleEnd = Math.min(stay.start + stay.nights, L.days.length + 1);
  if (visibleEnd <= 0 || visibleStart >= L.days.length) return null;

  const startsBefore = stay.start < 0;
  // Bars run from mid check-in day to mid check-out day, like the product.
  const left = startsBefore ? 0 : visibleStart * colW + colW * 0.12;
  const right = (stay.start + stay.nights) * colW + colW * 0.06;
  const width = Math.max(right - left, colW * 0.4);
  const s = STATUS[stay.status];
  const r = 10;
  const hatched = stay.status === "blocked";

  return (
    <div
      style={{
        position: "absolute",
        boxSizing: "border-box",
        left: u(left),
        top: u(top + (L.rowH - L.barH) / 2),
        width: u(width),
        height: u(L.barH),
        borderRadius: startsBefore ? `0 ${u(r)} ${u(r)} 0` : u(r),
        padding: `0 ${u(12)} 0 ${u(startsBefore ? 12 : 14)}`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        overflow: "hidden",
        opacity,
        filter: blur > 0.05 ? `blur(${u(blur)})` : undefined,
        clipPath: reveal < 1 ? `inset(0 ${(1 - reveal) * 100}% 0 0 round ${u(r)})` : undefined,
        background: hatched
          ? `repeating-linear-gradient(135deg, ${s.fill} 0 ${u(6)}, #E3E7EC ${u(6)} ${u(12)})`
          : s.fill,
        boxShadow: [
          startsBefore ? null : `inset ${u(3)} 0 0 ${s.accent}`,
          ring > 0 ? `0 0 0 ${u(3)} rgba(88, 140, 218, ${ring * 0.45})` : null,
        ]
          .filter(Boolean)
          .join(", ") || undefined,
        color: s.ink,
      }}
    >
      <div
        style={{
          opacity: textOpacity,
          fontSize: u(L.name),
          fontWeight: 700,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {stay.guest}
      </div>
      <div
        style={{
          opacity: textOpacity,
          marginTop: u(1),
          fontSize: u(L.meta),
          color: s.meta,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {stay.meta}
      </div>
    </div>
  );
}
