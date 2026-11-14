import type { CSSProperties } from "react";

/**
 * Trust, stated as facts the product can back up today. No logos or quotes
 * until there are real customers to show (see docs/design-system.md).
 */
const FACTS = [
  {
    title: "Payments through Paystack",
    body: "Card and mobile money are processed by Paystack and settled in GHS.",
  },
  {
    title: "Access by role",
    body: "Staff see only what their role allows, and the audit log records who changed what.",
  },
  {
    title: "Installs from the browser",
    body: "Add RoomLine to any phone's home screen. No app store, no new hardware.",
  },
  {
    title: "Your numbers, exportable",
    body: "Export occupancy, revenue and guest reports as CSV at any time.",
  },
] as const;

export function Trust() {
  return (
    <section id="trust" data-tone="dusk" className="rl-section rl-trust" aria-labelledby="trust-heading">
      <div className="rl-wrap rl-trust-grid">
        <div data-reveal="">
          <h2 id="trust-heading" className="rl-h2 rl-trust-title rl-r">
            Built for hotels in Ghana. Ready for guests from&nbsp;anywhere.
          </h2>
        </div>
        <ul className="rl-facts" data-reveal="">
          {FACTS.map((f, i) => (
            <li key={f.title} className="rl-fact rl-r" style={{ "--i": i } as CSSProperties}>
              <h3 className="rl-fact-title">{f.title}</h3>
              <p className="rl-fact-body">{f.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
