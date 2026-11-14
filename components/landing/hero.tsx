import type { CSSProperties } from "react";
import { ActionLink, SecondaryLink } from "./action-link";
import { ProductFilm } from "./film/product-film";

const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

export function Hero() {
  return (
    <section className="rl-hero" data-tone="paper" aria-labelledby="hero-heading">
      <div className="rl-wrap">
        <div className="rl-hero-copy">
          <h1 id="hero-heading" className="rl-display">
            <span className="rl-line" style={d(0)}>
              Run a calmer
            </span>{" "}
            <span className="rl-line" style={d(80)}>
              front desk.
            </span>
          </h1>
          <p className="rl-lead rl-hero-lead rl-rise" style={d(180)}>
            Hotel software for independent hotels and guesthouses. Bookings,
            rooms and every cedi you take, on one screen.
          </p>
          <div className="rl-actions rl-rise" style={d(260)}>
            <ActionLink />
            <SecondaryLink href="/sign-in">Sign in</SecondaryLink>
          </div>
          <p className="rl-hero-note rl-rise" style={d(320)}>
            Mobile money, card and cash · Runs on the phone you already have
          </p>
        </div>

        <div className="rl-hero-film rl-tile rl-tile--sun rl-rise" style={d(200)}>
          <ProductFilm
            film="calendar"
            label="RoomLine room calendar"
            description="A booking from the hotel's own booking page arrives, paid with MTN Mobile Money. It appears on the room calendar for room 202, the week's revenue rises by GHS 1,350, and a waiting guest in room 104 is checked in."
          />
        </div>
      </div>
    </section>
  );
}
