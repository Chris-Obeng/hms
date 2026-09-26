import type { CSSProperties, ReactNode } from "react";
import { fontData, ui } from "../ui";

/* Shared atoms for the demo screens. Everything here is pure: it takes a
   number and renders a pixel state, so the same markup serves the Remotion
   comp and server HTML. */

type Tone = "clear" | "await" | "due" | "house" | "night" | "plain";

const TONES: Record<Tone, { fg: string; bg: string; line: string }> = {
  clear: { fg: ui.brand, bg: ui.brandWash, line: ui.brandLine },
  await: { fg: ui.await, bg: ui.awaitWash, line: ui.awaitLine },
  due: { fg: ui.due, bg: ui.dueWash, line: ui.dueLine },
  house: { fg: ui.house, bg: ui.houseWash, line: ui.houseLine },
  night: { fg: ui.nightBrand, bg: "rgba(143,217,184,0.12)", line: ui.nightLine },
  plain: { fg: ui.muted, bg: ui.surface, line: ui.line },
};

export function Chip({
  tone = "plain",
  children,
  dot = false,
  size = 13,
  style,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  size?: number;
  style?: CSSProperties;
}) {
  const t = TONES[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size * 0.28,
        height: size * 1.85,
        padding: `0 ${size * 0.5}px`,
        borderRadius: 4,
        border: `1px solid ${t.line}`,
        background: t.bg,
        color: t.fg,
        fontFamily: fontData,
        fontSize: size,
        fontWeight: 500,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {dot ? (
        <span
          style={{
            width: size * 0.42,
            height: size * 0.42,
            borderRadius: 9999,
            background: "currentColor",
          }}
        />
      ) : null}
      {children}
    </span>
  );
}

/** Uppercase mono label — the demo's version of the page's report index. */
export function Label({
  children,
  size = 11,
  color = ui.faint,
  style,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        fontFamily: fontData,
        fontSize: size,
        letterSpacing: size * 0.14,
        textTransform: "uppercase",
        color,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
