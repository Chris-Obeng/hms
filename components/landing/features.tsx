import type { CSSProperties } from "react";

const FEATURES = [
  {
    id: "calendar",
    title: "One live calendar",
    body: "Walk-ins, phone holds and web bookings in one place. No double bookings.",
  },
  {
    id: "payments",
    title: "Every cedi on one bill",
    body: "MoMo, card and cash in GHS. Online payments settle to your bank or MoMo.",
  },
  {
    id: "booking-page",
    title: "Your own booking page",
    body: "Share it on WhatsApp, Instagram and Google. No commission.",
  },
  {
    id: "night-audit",
    title: "Night audit in one click",
    body: "Reconcile every payment, lock the day, see occupancy and revenue.",
  },
] as const;

export function Features() {
  return (
    <section id="features" className="rl-section" aria-labelledby="features-heading">
      <div className="rl-wrap">
        <h2 id="features-heading" className="rl-h2 rl-features-title" data-reveal="">
          <span className="rl-r">The whole day, on one&nbsp;screen.</span>
        </h2>

        <ul className="rl-rows" data-reveal="">
          {FEATURES.map((f, i) => (
            <li
              key={f.id}
              id={f.id}
              className="rl-row rl-r"
              style={{ "--i": i } as CSSProperties}
            >
              <h3 className="rl-row-title">{f.title}</h3>
              <p className="rl-row-body">{f.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
