import type { ReactNode } from "react";
import { fontData, fontDisplay, fontText, ui } from "../ui";
import { Label } from "./parts";

/*
 * The RoomLine shell, drawn once and reused by every scene so the demo reads
 * as one product rather than four mockups. Rail on wide canvases, a stacked
 * bar on phone-sized ones — same hierarchy, two geometries.
 */

export const NAV = ["Calendar", "Bookings", "Rooms", "Payments", "Night audit"];

export function Mark({ size = 26 }: { size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: ui.brand,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
      aria-hidden
    >
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 16 16" fill="none">
        <rect x="1" y="7" width="6" height="8" rx="1" fill="#FBFAF8" fillOpacity="0.95" />
        <rect x="9" y="3.5" width="6" height="11.5" rx="1" fill="#FBFAF8" fillOpacity="0.55" />
      </svg>
    </span>
  );
}

function Avatar({ size = 26 }: { size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 9999,
        background: ui.brandWash,
        border: `1px solid ${ui.brandLine}`,
        color: ui.brand,
        fontFamily: fontData,
        fontSize: size * 0.4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      DR
    </span>
  );
}

function NavList({ active }: { active: string }) {
  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {NAV.map((item) => {
        const on = item === active;
        return (
          <span
            key={item}
            style={{
              height: 34,
              display: "flex",
              alignItems: "center",
              paddingLeft: 10,
              borderRadius: 6,
              fontSize: 14,
              fontWeight: on ? 600 : 500,
              letterSpacing: -0.1,
              color: on ? ui.brand : ui.muted,
              background: on ? ui.brandWash : "transparent",
              boxShadow: on ? `inset 3px 0 0 ${ui.brand}` : "none",
            }}
          >
            {item}
          </span>
        );
      })}
    </nav>
  );
}

export function PhoneFrame({
  title,
  date = "Mon 24 Aug",
  active = "Calendar",
  children,
}: {
  title: string;
  date?: string;
  active?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: ui.paper,
        color: ui.ink,
        fontFamily: fontText,
      }}
    >
      <div
        style={{
          height: 56,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "0 16px",
          background: ui.surface,
          borderBottom: `1px solid ${ui.line}`,
        }}
      >
        <Mark size={24} />
        <span
          style={{
            fontFamily: fontDisplay,
            fontSize: 16,
            letterSpacing: -0.2,
            fontWeight: 500,
          }}
        >
          Meridian Hotel
        </span>
        <span style={{ marginLeft: "auto" }}>
          <Avatar size={26} />
        </span>
      </div>
      <div
        style={{
          padding: "15px 16px 11px",
          background: ui.surface,
          borderBottom: `1px solid ${ui.line}`,
        }}
      >
        <Label size={10}>{date}</Label>
        <div
          style={{
            fontFamily: fontDisplay,
            fontSize: 22,
            letterSpacing: -0.4,
            fontWeight: 500,
            marginTop: 4,
          }}
        >
          {title}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>{children}</div>
      <PhoneTabs active={active} />
    </div>
  );
}

/** The phone's tab bar: the same five destinations at thumb height. */
function PhoneTabs({ active }: { active: string }) {
  return (
    <div
      style={{
        height: 54,
        flexShrink: 0,
        display: "flex",
        background: ui.surface,
        borderTop: `1px solid ${ui.line}`,
      }}
    >
      {NAV.map((item) => {
        const on = item === active;
        return (
          <span
            key={item}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              fontFamily: fontData,
              fontSize: 8,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: on ? ui.brand : ui.faint,
            }}
          >
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: 9999,
                background: on ? ui.brand : ui.rule,
              }}
            />
            {item === "Night audit" ? "Audit" : item}
          </span>
        );
      })}
    </div>
  );
}

export function DeskFrame({
  title,
  date = "Mon 24 Aug",
  active = "Calendar",
  children,
}: {
  title: string;
  date?: string;
  active?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        background: ui.paper,
        color: ui.ink,
        fontFamily: fontText,
      }}
    >
      <aside
        style={{
          width: 198,
          flexShrink: 0,
          background: ui.surface,
          borderRight: `1px solid ${ui.line}`,
          padding: "18px 14px 16px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Mark />
          <span
            style={{
              fontFamily: fontDisplay,
              fontSize: 18,
              letterSpacing: -0.3,
              fontWeight: 500,
            }}
          >
            RoomLine
          </span>
        </div>
        <div style={{ marginTop: 24, marginBottom: 12 }}>
          <Label size={10}>Property</Label>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
            Meridian Hotel
          </div>
          <div
            style={{
              fontFamily: fontData,
              fontSize: 11.5,
              color: ui.faint,
              marginTop: 2,
            }}
          >
            52 rooms · 4 floors
          </div>
        </div>
        <NavList active={active} />
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar />
          <span style={{ fontSize: 13, fontWeight: 500 }}>Dana Reed</span>
          <span style={{ fontSize: 11.5, color: ui.faint }}>Manager</span>
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            height: 62,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 22px",
            background: ui.surface,
            borderBottom: `1px solid ${ui.line}`,
          }}
        >
          <span
            style={{
              fontFamily: fontDisplay,
              fontSize: 21,
              letterSpacing: -0.35,
              fontWeight: 500,
            }}
          >
            {title}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Label size={11}>{date}</Label>
            <span
              style={{
                fontSize: 13,
                color: ui.muted,
                fontFamily: fontData,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              52 rooms
            </span>
          </span>
        </header>
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>{children}</div>
      </div>
    </div>
  );
}

/** One entry point so scenes never branch on geometry themselves. */
export function Frame({
  wide,
  title,
  date,
  active,
  children,
}: {
  wide: boolean;
  title: string;
  date?: string;
  active?: string;
  children: ReactNode;
}) {
  return wide ? (
    <DeskFrame title={title} date={date} active={active}>
      {children}
    </DeskFrame>
  ) : (
    <PhoneFrame title={title} date={date} active={active}>
      {children}
    </PhoneFrame>
  );
}
