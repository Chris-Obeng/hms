import { ActionLink } from "./action-link";
import { Reveal } from "./reveal";

const STEPS = [
  {
    title: "First, add your rooms",
    body: "Set room types, GHS rates, staff roles, and your payout account in fifteen minutes.",
  },
  {
    title: "Daily, run reception",
    body: "Check in arrivals, assign inspected rooms, and log payments from one screen.",
  },
  {
    title: "Nightly, close the books",
    body: "Lock the business date at midnight and wake up to exact occupancy and revenue.",
  },
] as const;

export function How() {
  return (
    <section
      id="how-it-works"
      className="rl-dark-band"
      aria-labelledby="how-heading"
    >
      <div className="rl-wrap">
        <Reveal className="rl-how-head">
          <h2 id="how-heading" className="rl-h2">
            Live in one&nbsp;afternoon.
          </h2>
          <ActionLink variant="brass" />
        </Reveal>

        <ol className="rl-how-steps">
          {STEPS.map((step, idx) => (
            <li key={step.title}>
              <Reveal className="rl-how-cell" delay={idx * 65}>
                <h3 className="rl-h3">{step.title}</h3>
                <p className="rl-body">{step.body}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
