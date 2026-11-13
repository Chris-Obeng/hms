import type { CSSProperties } from "react";
import { RoomLineMark } from "@/components/brand/roomline-mark";
import { ActionLink, SecondaryLink } from "./action-link";

const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

export function Hero() {
  return (
    <section className="rl-hero" aria-labelledby="hero-heading">
      <div className="rl-wrap rl-hero-grid">
        <div className="rl-hero-copy">
          <h1 id="hero-heading" className="rl-display">
            <span className="rl-line" style={d(0)}>
              Run a calmer
            </span>{" "}
            <span className="rl-line" style={d(90)}>
              front desk.
            </span>
          </h1>
          <p className="rl-lead rl-enter" style={d(200)}>
            Hotel software for independent hotels and guesthouses in Ghana,
            from 8&nbsp;to&nbsp;80 rooms.
          </p>
          <div className="rl-actions rl-enter" style={d(280)}>
            <ActionLink />
            <SecondaryLink href="/sign-in">Sign in</SecondaryLink>
          </div>
        </div>

        {/*
          The open door. The app-icon tile matches the panel, so only the lit
          doorway shows. The light on the floor is a separate layer that
          starts under the threshold and never covers the glyph.
        */}
        <div className="rl-door rl-enter" style={d(160)} aria-hidden="true">
          <div className="rl-door-art">
            <RoomLineMark size={512} className="rl-door-mark" />
            <svg
              className="rl-door-light"
              viewBox="0 0 512 1152"
              focusable="false"
            >
              <defs>
                <linearGradient id="rl-floor-light" x1="0" y1="388" x2="0" y2="1100" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#D8B25C" stopOpacity="0.3" />
                  <stop offset="1" stopColor="#D8B25C" stopOpacity="0" />
                </linearGradient>
                <filter id="rl-floor-soft" x="-20%" y="-5%" width="140%" height="110%">
                  <feGaussianBlur stdDeviation="9" />
                </filter>
              </defs>
              <path
                d="M162 402H302L500 1152H-36Z"
                fill="url(#rl-floor-light)"
                filter="url(#rl-floor-soft)"
              />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
