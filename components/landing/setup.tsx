import type { CSSProperties } from "react";

const STEPS = ["Add your rooms", "Set rates in GHS", "Invite your staff", "Connect payouts"] as const;

export function Setup() {
  return (
    <section id="setup" className="rl-section rl-band-tone" aria-labelledby="setup-heading">
      <div className="rl-wrap" data-reveal="">
        <h2 id="setup-heading" className="rl-h2 rl-r">
          Live in an afternoon.
        </h2>
        <ol className="rl-steps">
          {STEPS.map((step, i) => (
            <li key={step} className="rl-r" style={{ "--i": i + 1 } as CSSProperties}>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
