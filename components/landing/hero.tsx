import type { CSSProperties } from "react";
import { ActionLink, SecondaryLink } from "./action-link";
import { ProductFilm } from "./film/product-film";

const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;


export function Hero() {
  return (
    <section
      className="rl-hero"
      data-tone="paper"
      aria-labelledby="hero-heading"
    >
      <div className="rl-wrap">
        <div className="rl-hero-copy">
          <p className="rl-kicker rl-rise" style={d(0)}>
            For independent hotels and guesthouses
          </p>
          <h1 id="hero-heading" className="rl-display">
            <span className="rl-line" style={d(60)}>
              Run a calmer
            </span>{" "}
            <span className="rl-line" style={d(140)}>
              front desk.
            </span>
          </h1>
          <div className="rl-hero-side">
            <p className="rl-lead rl-hero-lead rl-rise" style={d(240)}>
              Oriel puts your bookings, rooms and every cedi you take on one
              screen, so the day runs itself and you can look after guests.
            </p>
            <div className="rl-actions rl-rise" style={d(320)}>
              <ActionLink />
              <SecondaryLink href="/sign-in">Sign in</SecondaryLink>
            </div>
            <p className="rl-pay rl-rise" style={d(380)}>
              Takes mobile money, Visa, Mastercard, cash and bank transfer
            </p>
          </div>
        </div>

        <div className="rl-hero-film rl-rise" style={d(260)}>
          <div className="rl-tile rl-tile--sun">
            <ProductFilm
              film="calendar"
              label="Oriel room calendar"
              description="A booking from the hotel's own booking page arrives, paid with MTN Mobile Money. It appears on the room calendar for room 202, the week's revenue rises by GHS 1,350, and a waiting guest in room 104 is checked in."
            />
          </div>
        </div>
      </div>
    </section>
  );
}
