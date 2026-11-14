import type { CSSProperties } from "react";

const STEPS = [
  { title: "Add your rooms", body: "Room types, room numbers and photos." },
  { title: "Set your rates", body: "Nightly prices in GHS, with weekend and seasonal rates." },
  { title: "Invite your team", body: "Send a link. Each person signs in with their own role." },
  { title: "Share your booking link", body: "Connect payouts, post the link and take your first booking." },
] as const;

export function Setup() {
  return (
    <section id="how-it-works" data-tone="sun" className="rl-section" aria-labelledby="setup-heading">
      <div className="rl-wrap" data-reveal="">
        <h2 id="setup-heading" className="rl-h2 rl-h2--split rl-r">
          Live in an afternoon.{" "}
          <span className="rl-h2-quiet">No hardware, no installer, no training day.</span>
        </h2>
        <ol className="rl-steps">
          {STEPS.map((step, i) => (
            <li key={step.title} className="rl-step rl-r" style={{ "--i": i + 1 } as CSSProperties}>
              <span className="rl-step-no" aria-hidden="true">
                {i + 1}
              </span>
              <h3 className="rl-step-title">{step.title}</h3>
              <p className="rl-step-body">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
