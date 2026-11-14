import type { CSSProperties, ReactNode } from "react";

/**
 * Three benefits, each on its own colour field with a small piece of the
 * product that proves it. The fragments are decorative (aria-hidden); the
 * title and sentence carry the meaning.
 */
const FEATURES: {
  id: string;
  tone: "lagoon" | "sun" | "ink";
  title: string;
  body: string;
  fragment: ReactNode;
}[] = [
  {
    id: "calendar",
    tone: "lagoon",
    title: "One calendar, no double bookings",
    body: "Walk-ins, phone calls, WhatsApp and web bookings land on the same live calendar.",
    fragment: (
      <ul className="rl-frag rl-frag-list">
        {[
          ["Walk-in", "Efua Mensah", "Room 101"],
          ["WhatsApp", "Kojo Badu", "Room 204"],
          ["Booking page", "Nana Yaa Asare", "Room 202"],
        ].map(([source, guest, room]) => (
          <li key={guest}>
            <span className="rl-frag-chip">{source}</span>
            <span className="rl-frag-strong">{guest}</span>
            <span className="rl-frag-muted">{room}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    id: "booking-page",
    tone: "sun",
    title: "Your own booking page",
    body: "Share one link on WhatsApp, Instagram and Google Maps. Guests book and pay you directly.",
    fragment: (
      <div className="rl-frag rl-frag-page">
        <div className="rl-frag-url">book.labadicourtyard.com</div>
        <div className="rl-frag-room">
          <div>
            <div className="rl-frag-strong">Deluxe room</div>
            <div className="rl-frag-muted">GHS 450 a night · Breakfast</div>
          </div>
          <span className="rl-frag-button">Book</span>
        </div>
      </div>
    ),
  },
  {
    id: "team",
    tone: "ink",
    title: "A team that sees what it should",
    body: "Owner, manager, front desk and view-only roles. Every change is logged with a name and a time.",
    fragment: (
      <div className="rl-frag rl-frag-team">
        <ul className="rl-frag-list">
          {[
            ["AM", "Akua Mensah", "Owner"],
            ["KA", "Kojo Asare", "Manager"],
            ["EO", "Esi Owusu", "Front desk"],
          ].map(([initials, name, role]) => (
            <li key={name}>
              <span className="rl-frag-avatar">{initials}</span>
              <span className="rl-frag-strong">{name}</span>
              <span className="rl-frag-muted">{role}</span>
            </li>
          ))}
        </ul>
        <p className="rl-frag-log">Kojo changed the Deluxe rate · 09:42</p>
      </div>
    ),
  },
];

export function Features() {
  return (
    <section id="features" data-tone="paper" className="rl-section" aria-labelledby="features-heading">
      <div className="rl-wrap">
        <h2 id="features-heading" className="rl-h2 rl-features-title" data-reveal="">
          <span className="rl-r">The whole day, on one&nbsp;screen.</span>
        </h2>

        <ul className="rl-cards" data-reveal="">
          {FEATURES.map((f, i) => (
            <li
              key={f.id}
              id={f.id}
              className={`rl-card rl-card--${f.tone} rl-r${f.tone === "ink" ? " rl-on-ink" : ""}`}
              style={{ "--i": i } as CSSProperties}
            >
              <div className="rl-card-copy">
                <h3 className="rl-card-title">{f.title}</h3>
                <p className="rl-card-body">{f.body}</p>
              </div>
              <div className="rl-card-frag" aria-hidden="true">
                {f.fragment}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
