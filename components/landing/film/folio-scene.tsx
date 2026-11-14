import type { CSSProperties } from "react";
import { C, FILM_FONT, easeInOut, ghs, mix, progress, u } from "./timing";

/**
 * Showcase film: from booking to bank.
 *
 * A guest's folio, a mobile-money payment approved on their phone, the balance
 * going to zero, then the night audit closing the day. Eight seconds, played
 * once, holding on "Day closed".
 */

export const FOLIO_FILM = {
  fps: 30,
  durationInFrames: 240,
  width: 480,
  height: 640,
} as const;

const W = FOLIO_FILM.width;
const PAD = 28;

const box = (s: CSSProperties): CSSProperties => ({ position: "absolute", boxSizing: "border-box", ...s });

function Check({ size, color }: { size: number; color: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" style={{ width: u(size), height: u(size), flexShrink: 0 }}>
      <path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FolioScene({ frame, fps = FOLIO_FILM.fps }: { frame: number; fps?: number }) {
  // Script
  const payIn = progress(frame, fps, 0.6, 1.1);
  const approved = progress(frame, fps, 2.6, 2.9);
  const countDown = progress(frame, fps, 2.9, 3.6, easeInOut);
  const settled = progress(frame, fps, 3.6, 3.9);
  const sheetIn = progress(frame, fps, 4.6, 5.2);
  const rows = [5.3, 5.55, 5.8].map((t) => progress(frame, fps, t, t + 0.4));
  const press = progress(frame, fps, 6.5, 6.62) * (1 - progress(frame, fps, 6.62, 6.8));
  const closed = progress(frame, fps, 6.7, 7.0);

  // A slow pulse while the guest approves the prompt on their phone.
  const waiting = frame / fps >= 1.1 && approved < 1;
  const pulse = waiting ? 0.45 + 0.55 * Math.abs(Math.cos(((frame / fps) - 1.1) * Math.PI)) : 1;

  const balance = mix(1360, 0, countDown);

  const lineRow = (strong = false): CSSProperties => ({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    height: u(50),
    borderTop: `${u(1)} solid ${C.line}`,
    fontSize: u(18),
    fontWeight: strong ? 700 : 500,
    color: strong ? C.ink : C.text,
  });

  return (
    <div
      style={{
        position: "relative",
        width: u(W),
        height: u(FOLIO_FILM.height),
        overflow: "hidden",
        background: C.canvas,
        color: C.text,
        fontFamily: FILM_FONT,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1.25,
      }}
    >
      <div style={{ opacity: mix(1, 0.4, sheetIn) }}>
        {/* Guest */}
        <div style={box({ left: u(PAD), top: u(28), right: u(PAD) })}>
          <div style={{ fontSize: u(16), fontWeight: 600, color: C.muted }}>Folio · Room 204 Deluxe</div>
          <div style={{ marginTop: u(6), fontSize: u(28), fontWeight: 700, color: C.ink, letterSpacing: "-0.02em" }}>
            Kwame Asante
          </div>
          <div style={{ marginTop: u(4), fontSize: u(17), color: C.muted }}>Fri 14 – Sun 16 Nov · 2 nights</div>
        </div>

        {/* Charges */}
        <div style={box({ left: u(PAD), right: u(PAD), top: u(140) })}>
          <div style={lineRow()}>
            <span>Deluxe room × 2 nights</span>
            <span>{ghs(1200, 2)}</span>
          </div>
          <div style={lineRow()}>
            <span>Breakfast × 2</span>
            <span>{ghs(160, 2)}</span>
          </div>
          <div style={{ ...lineRow(true), borderBottom: `${u(1)} solid ${C.line}` }}>
            <span>Total</span>
            <span>{ghs(1360, 2)}</span>
          </div>
        </div>

        {/* Payment */}
        <div style={box({ left: u(PAD), right: u(PAD), top: u(316) })}>
          <div style={{ fontSize: u(15), fontWeight: 600, color: C.muted }}>Payments</div>
          <div
            style={{
              marginTop: u(10),
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: u(12),
              padding: u(14),
              borderRadius: u(14),
              border: `${u(1)} solid ${C.line}`,
              background: C.paper,
              opacity: payIn,
              translate: `0 ${u((1 - payIn) * 10)}`,
            }}
          >
            <div>
              <div style={{ fontSize: u(18), fontWeight: 600, color: C.ink }}>MTN Mobile Money</div>
              <div style={{ marginTop: u(4), fontSize: u(15), color: C.muted }}>024 ••• 5678</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: u(18), fontWeight: 700, color: C.ink }}>{ghs(1360, 2)}</div>
              <div style={{ position: "relative", marginTop: u(6), height: u(28) }}>
                <span style={{ ...pill(C.sunWash, C.sunDeep), opacity: 1 - approved }}>
                  <span
                    style={{
                      width: u(7),
                      height: u(7),
                      borderRadius: "50%",
                      background: C.sun,
                      opacity: pulse,
                    }}
                  />
                  Waiting for approval
                </span>
                <span style={{ ...pill(C.okWash, C.ok), opacity: approved }}>
                  <Check size={14} color={C.ok} />
                  Paid
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Balance */}
        <div
          style={box({
            left: u(PAD),
            right: u(PAD),
            top: u(452),
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          })}
        >
          <span style={{ fontSize: u(19), fontWeight: 700, color: C.ink }}>Balance due</span>
          <span style={{ display: "flex", alignItems: "center", gap: u(12) }}>
            <span
              style={{
                padding: `${u(5)} ${u(10)}`,
                borderRadius: u(999),
                background: C.okWash,
                color: C.ok,
                fontSize: u(14),
                fontWeight: 600,
                opacity: settled,
                translate: `${u((1 - settled) * 6)} 0`,
              }}
            >
              Settled
            </span>
            <span style={{ fontSize: u(24), fontWeight: 700, color: C.ink }}>{ghs(balance, 2)}</span>
          </span>
        </div>
      </div>

      {/* Night audit sheet */}
      <div
        style={box({
          left: 0,
          right: 0,
          bottom: 0,
          height: u(348),
          padding: `${u(26)} ${u(PAD)}`,
          borderRadius: `${u(24)} ${u(24)} 0 0`,
          background: C.ink,
          color: C.onInk,
          translate: `0 ${u((1 - sheetIn) * 364)}`,
        })}
      >
        <div style={{ fontSize: u(15), fontWeight: 600, color: C.onInkMuted }}>Night audit · Friday 14 Nov</div>
        <div style={{ marginTop: u(6), fontSize: u(25), fontWeight: 700, letterSpacing: "-0.02em" }}>
          Ready to close the day
        </div>

        <div style={{ marginTop: u(14) }}>
          {[
            ["Payments matched", "42 of 42"],
            ["Rooms sold", "18 of 24"],
            ["Revenue", ghs(12480)],
          ].map(([label, value], i) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                height: u(46),
                borderTop: `${u(1)} solid rgba(255, 255, 255, 0.12)`,
                fontSize: u(18),
                opacity: rows[i],
                translate: `0 ${u((1 - rows[i]) * 8)}`,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: u(10) }}>
                <Check size={18} color={C.sun} />
                {label}
              </span>
              <span style={{ fontWeight: 700 }}>{value}</span>
            </div>
          ))}
        </div>

        <div
          style={box({
            left: u(PAD),
            right: u(PAD),
            bottom: u(26),
            height: u(56),
            borderRadius: u(14),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: u(10),
            fontSize: u(19),
            fontWeight: 700,
            background: closed > 0 ? `rgba(255, 194, 61, ${mix(1, 0.16, closed)})` : C.sun,
            color: closed > 0.5 ? C.onInk : C.ink,
            scale: String(1 - press * 0.03),
            opacity: rows[2],
          })}
        >
          {closed > 0.5 ? (
            <span style={{ display: "flex", alignItems: "center", gap: u(10), opacity: mix(0, 1, (closed - 0.5) * 2) }}>
              <Check size={20} color={C.sun} />
              Day closed · 23:58
            </span>
          ) : (
            <span style={{ opacity: 1 - closed * 2 }}>Close the day</span>
          )}
        </div>
      </div>
    </div>
  );
}

function pill(bg: string, fg: string): CSSProperties {
  return {
    position: "absolute",
    right: 0,
    top: 0,
    display: "inline-flex",
    alignItems: "center",
    gap: u(6),
    height: u(28),
    padding: `0 ${u(10)}`,
    borderRadius: u(999),
    background: bg,
    color: fg,
    fontSize: u(14),
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
}
