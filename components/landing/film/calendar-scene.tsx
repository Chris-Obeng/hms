import type { CSSProperties } from "react";
import { C, FILM_FONT, ghs, mix, progress, u } from "./timing";

/**
 * Hero film: the live room calendar.
 *
 * A booking arrives from the hotel's own booking page, paid with mobile money.
 * It lands on the calendar, the week's numbers move, and a waiting arrival is
 * checked in. Seven seconds, played once, then it holds on the final state.
 */

export type CalendarVariant = "wide" | "compact";

export const CALENDAR_FILM = {
  fps: 30,
  durationInFrames: 210,
  wide: { width: 1280, height: 800 },
  compact: { width: 520, height: 700 },
} as const;

type Status = "inHouse" | "confirmed" | "arriving" | "block";

type Stay = {
  room: string;
  guest: string;
  /** Day index on the visible week; negative means the stay began earlier. */
  start: number;
  nights: number;
  status: Status;
  meta: string;
};

const DAYS = ["Fri 14", "Sat 15", "Sun 16", "Mon 17", "Tue 18", "Wed 19", "Thu 20"];

const ROOMS = [
  { no: "101", type: "Standard" },
  { no: "102", type: "Standard" },
  { no: "103", type: "Standard" },
  { no: "104", type: "Deluxe" },
  { no: "201", type: "Deluxe" },
  { no: "202", type: "Deluxe" },
  { no: "203", type: "Suite" },
  { no: "301", type: "Family" },
];

const COMPACT_ROOMS = new Set(["101", "102", "104", "201", "202", "203"]);

const STAYS: Stay[] = [
  { room: "101", guest: "Ama Owusu", start: -1, nights: 3, status: "inHouse", meta: "In house" },
  { room: "102", guest: "Daniel Okafor", start: 2, nights: 3, status: "confirmed", meta: "3 nights" },
  { room: "103", guest: "Sarah Lindqvist", start: 3, nights: 4, status: "confirmed", meta: "4 nights" },
  { room: "201", guest: "Yaw Darko", start: -2, nights: 4, status: "inHouse", meta: "In house" },
  { room: "201", guest: "Akosua Addo", start: 4, nights: 2, status: "confirmed", meta: "2 nights" },
  { room: "203", guest: "Kofi Asante", start: -1, nights: 3, status: "inHouse", meta: "In house" },
  { room: "203", guest: "Maintenance", start: 5, nights: 2, status: "block", meta: "Blocked" },
  { room: "301", guest: "Abena Ofori", start: 1, nights: 4, status: "confirmed", meta: "4 nights" },
];

/** The arrival that gets checked in during the film. */
const ARRIVAL: Stay = {
  room: "104",
  guest: "Kwesi Boateng",
  start: 0,
  nights: 3,
  status: "arriving",
  meta: "Arriving today",
};

/** The booking that arrives from the booking page. */
const NEW_STAY: Stay = {
  room: "202",
  guest: "Nana Yaa Asare",
  start: 1,
  nights: 3,
  status: "confirmed",
  meta: "3 nights · Paid",
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
  days: number;
  name: number;
  meta: number;
};

const LAYOUTS: Record<CalendarVariant, Layout> = {
  wide: {
    w: 1280, h: 800, pad: 40, gridTop: 136, headH: 48, roomW: 176,
    rowH: 72, barH: 54, days: 7, name: 18, meta: 15,
  },
  compact: {
    w: 520, h: 700, pad: 24, gridTop: 200, headH: 48, roomW: 96,
    rowH: 74, barH: 58, days: 3, name: 21, meta: 17,
  },
};

const box = (s: CSSProperties): CSSProperties => ({ position: "absolute", ...s });

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
  const rooms = compact ? ROOMS.filter((r) => COMPACT_ROOMS.has(r.no)) : ROOMS;
  const daysW = L.w - L.pad * 2 - L.roomW;
  const colW = daysW / L.days;

  // Script
  const toastIn = progress(frame, fps, 0.8, 1.3);
  const toastOut = progress(frame, fps, 3.6, 4.0);
  const draw = progress(frame, fps, 1.4, 2.1);
  const ringIn = progress(frame, fps, 2.1, 2.4);
  const ringOut = progress(frame, fps, 3.2, 3.8);
  const numbers = progress(frame, fps, 1.8, 2.6);
  const checkIn = progress(frame, fps, 4.6, 5.1);
  const inHouseTick = progress(frame, fps, 4.8, 5.3);

  const occupancy = Math.round(mix(71, 73, numbers));
  const revenue = Math.round(mix(38420, 39770, numbers) / 10) * 10;
  const inHouse = Math.round(mix(11, 12, inHouseTick));

  const kpis = compact
    ? [
        { label: "Revenue, this week", value: ghs(revenue) },
        { label: "In house", value: String(inHouse) },
      ]
    : [
        { label: "Occupancy, this week", value: `${occupancy}%` },
        { label: "Revenue, this week", value: ghs(revenue) },
        { label: "In house", value: String(inHouse) },
      ];

  const rowTop = (room: string) => {
    const i = rooms.findIndex((r) => r.no === room);
    return i < 0 ? null : L.gridTop + L.headH + i * L.rowH;
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
      }}
    >
      {/* Top bar */}
      <div style={box({ left: u(L.pad), top: u(compact ? 28 : 36) })}>
        <div style={{ fontSize: u(compact ? 26 : 24), fontWeight: 700, color: C.ink, letterSpacing: "-0.02em" }}>
          Labadi Courtyard
        </div>
        <div style={{ marginTop: u(4), fontSize: u(compact ? 18 : 15), color: C.muted }}>
          Friday, 14 November
        </div>
      </div>

      <div
        style={box({
          display: "flex",
          gap: u(compact ? 40 : 48),
          ...(compact
            ? { left: u(L.pad), top: u(108) }
            : { right: u(L.pad), top: u(32) }),
        })}
      >
        {kpis.map((k) => (
          <div key={k.label} style={{ textAlign: compact ? "left" : "right" }}>
            <div style={{ fontSize: u(compact ? 17 : 14), color: C.muted, whiteSpace: "nowrap" }}>{k.label}</div>
            <div
              style={{
                marginTop: u(4),
                fontSize: u(compact ? 34 : 28),
                fontWeight: 700,
                color: C.ink,
                letterSpacing: "-0.02em",
                whiteSpace: "nowrap",
              }}
            >
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Grid header */}
      <div
        style={box({
          left: u(L.pad),
          top: u(L.gridTop),
          width: u(L.roomW),
          height: u(L.headH),
          display: "flex",
          alignItems: "center",
          fontSize: u(L.meta),
          color: C.muted,
        })}
      >
        Rooms
      </div>

      {/* Day columns, hairlines and today tint */}
      {DAYS.slice(0, L.days).map((day, i) => (
        <div
          key={day}
          style={box({
            left: u(L.pad + L.roomW + i * colW),
            top: u(L.gridTop),
            width: u(colW),
            height: u(L.headH + rooms.length * L.rowH),
            borderLeft: `${u(1)} solid ${C.line}`,
            background: i === 0 ? "rgba(255, 241, 204, 0.55)" : "transparent",
          })}
        >
          <div
            style={{
              height: u(L.headH),
              display: "flex",
              alignItems: "center",
              gap: u(8),
              paddingLeft: u(12),
              fontSize: u(L.meta),
              fontWeight: i === 0 ? 700 : 500,
              color: i === 0 ? C.sunDeep : C.muted,
              whiteSpace: "nowrap",
            }}
          >
            {i === 0 && compact ? "Today" : day}
            {i === 0 && !compact ? <span style={{ fontWeight: 600 }}>· Today</span> : null}
          </div>
        </div>
      ))}

      {/* Rows */}
      {rooms.map((room, i) => {
        const top = L.gridTop + L.headH + i * L.rowH;
        return (
          <div
            key={room.no}
            style={box({
              left: u(L.pad),
              top: u(top),
              width: u(L.w - L.pad * 2),
              height: u(L.rowH),
              borderTop: `${u(1)} solid ${C.line}`,
            })}
          >
            <div
              style={{
                width: u(L.roomW),
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <div style={{ fontSize: u(L.name + 1), fontWeight: 700, color: C.ink }}>{room.no}</div>
              <div style={{ fontSize: u(L.meta), color: C.muted }}>{room.type}</div>
            </div>
          </div>
        );
      })}

      {/* Stays, clipped to the visible days */}
      <div
        style={box({
          left: u(L.pad + L.roomW),
          top: u(L.gridTop + L.headH),
          width: u(daysW),
          height: u(rooms.length * L.rowH),
          overflow: "hidden",
        })}
      >
        {STAYS.map((s) => {
          const top = rowTop(s.room);
          if (top === null) return null;
          return (
            <Bar
              key={`${s.room}-${s.guest}`}
              stay={s}
              L={L}
              colW={colW}
              top={top - L.gridTop - L.headH}
            />
          );
        })}

        {/* The arrival: crossfades from "arriving" to "in house" */}
        {rowTop(ARRIVAL.room) !== null ? (
          <>
            <Bar
              stay={ARRIVAL}
              L={L}
              colW={colW}
              top={rowTop(ARRIVAL.room)! - L.gridTop - L.headH}
              textOpacity={Math.max(0, 1 - checkIn * 2)}
            />
            <Bar
              stay={{ ...ARRIVAL, status: "inHouse", meta: "Checked in 14:05" }}
              L={L}
              colW={colW}
              top={rowTop(ARRIVAL.room)! - L.gridTop - L.headH}
              opacity={checkIn}
              textOpacity={Math.max(0, checkIn * 2 - 1)}
            />
          </>
        ) : null}

        {/* The new booking draws in from its check-in day */}
        <Bar
          stay={NEW_STAY}
          L={L}
          colW={colW}
          top={rowTop(NEW_STAY.room)! - L.gridTop - L.headH}
          reveal={draw}
          ring={ringIn * (1 - ringOut)}
        />

        {compact ? (
          <div
            style={box({
              right: 0,
              top: 0,
              width: u(56),
              height: "100%",
              background: `linear-gradient(to right, rgba(255,255,255,0), ${C.canvas})`,
            })}
          />
        ) : null}
      </div>

      {/* Toast: the booking arriving from the booking page */}
      <div
        style={box({
          ...(compact
            ? { left: u(L.pad), right: u(L.pad), top: u(20) }
            : { right: u(L.pad), top: u(112), width: u(392) }),
          boxSizing: "border-box",
          padding: u(compact ? 22 : 20),
          borderRadius: u(16),
          background: C.canvas,
          border: `${u(1)} solid ${C.line}`,
          boxShadow: `0 ${u(2)} ${u(4)} rgba(20,20,19,0.06), 0 ${u(24)} ${u(48)} ${u(-16)} rgba(20,20,19,0.28)`,
          opacity: toastIn * (1 - toastOut),
          translate: `0 ${u((1 - toastIn) * -12 + toastOut * -8)}`,
          zIndex: 3,
        })}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: u(8),
            fontSize: u(compact ? 17 : 14),
            fontWeight: 600,
            color: C.sunDeep,
          }}
        >
          <span
            style={{
              width: u(8),
              height: u(8),
              borderRadius: "50%",
              background: C.sun,
            }}
          />
          New booking · Your booking page
        </div>
        <div style={{ marginTop: u(10), fontSize: u(compact ? 24 : 20), fontWeight: 700, color: C.ink }}>
          {NEW_STAY.guest}
        </div>
        <div style={{ marginTop: u(4), fontSize: u(compact ? 18 : 15), color: C.muted }}>
          Sat 15 – Tue 18 Nov · Room 202 Deluxe
        </div>
        <div
          style={{
            marginTop: u(14),
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: u(compact ? 22 : 18), fontWeight: 700, color: C.ink }}>{ghs(1350)}</span>
          <span
            style={{
              padding: `${u(5)} ${u(10)}`,
              borderRadius: u(999),
              background: C.okWash,
              color: C.ok,
              fontSize: u(compact ? 16 : 14),
              fontWeight: 600,
            }}
          >
            Paid · MTN MoMo
          </span>
        </div>
      </div>
    </div>
  );
}

function Bar({
  stay,
  L,
  colW,
  top,
  opacity = 1,
  textOpacity = 1,
  reveal = 1,
  ring = 0,
}: {
  stay: Stay;
  L: Layout;
  colW: number;
  top: number;
  opacity?: number;
  textOpacity?: number;
  reveal?: number;
  ring?: number;
}) {
  const startsBefore = stay.start < 0;
  const left = Math.max(stay.start, 0) * colW + (startsBefore ? 0 : 4);
  const visibleNights = stay.nights + Math.min(stay.start, 0);
  const width = visibleNights * colW - (startsBefore ? 4 : 8);
  const r = 10;

  const look: Record<Status, CSSProperties> = {
    inHouse: { background: C.ink, color: C.onInk, border: `${u(1.5)} solid ${C.ink}` },
    confirmed: { background: C.canvas, color: C.ink, border: `${u(1.5)} solid ${C.lineStrong}` },
    arriving: { background: C.sunWash, color: C.ink, border: `${u(1.5)} solid ${C.sun}` },
    block: {
      background: `repeating-linear-gradient(135deg, ${C.paper2} 0 ${u(6)}, ${C.paper} ${u(6)} ${u(12)})`,
      color: C.muted,
      border: `${u(1.5)} solid ${C.line}`,
    },
  };
  const metaColor: Record<Status, string> = {
    inHouse: C.onInkMuted,
    confirmed: C.muted,
    arriving: C.sunDeep,
    block: C.muted,
  };

  return (
    <div
      style={{
        position: "absolute",
        left: u(left),
        top: u(top + (L.rowH - L.barH) / 2),
        width: u(width),
        height: u(L.barH),
        boxSizing: "border-box",
        borderRadius: startsBefore ? `0 ${u(r)} ${u(r)} 0` : u(r),
        padding: `0 ${u(12)}`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        overflow: "hidden",
        opacity,
        clipPath: reveal < 1 ? `inset(0 ${(1 - reveal) * 100}% 0 0 round ${u(r)})` : undefined,
        boxShadow: ring > 0 ? `0 0 0 ${u(3)} rgba(255, 194, 61, ${ring})` : undefined,
        ...look[stay.status],
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
          marginTop: u(2),
          fontSize: u(L.meta),
          color: metaColor[stay.status],
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
