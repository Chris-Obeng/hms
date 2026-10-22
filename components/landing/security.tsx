import { Fingerprint, History, UserRoundCheck } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "./reveal";

const POINTS = [
  {
    icon: UserRoundCheck,
    title: "The right access for every role",
    body: "Give owners, managers, and front-desk staff permissions suited to their responsibilities — never more than they need.",
  },
  {
    icon: History,
    title: "A record you can follow",
    body: "Trace operational changes through the audit log, with staff activity attached to the work that was done.",
  },
  {
    icon: Fingerprint,
    title: "Clear accountability at close of day",
    body: "Review arrivals, departures, and balances before closing the business day with night audit.",
  },
] as const;

export function Security() {
  return (
    <section
      id="security"
      className="lp-section"
      aria-labelledby="security-heading"
    >
      <div className="lp-container lp-security">
        <div>
          <Reveal>
            <p className="lp-eyebrow">Confidence, built in</p>
          </Reveal>
          <Reveal delay={60}>
            <h2
              id="security-heading"
              className="lp-h2"
              style={{ marginTop: "1rem" }}
            >
              Your property.
              <br />
              Your people.
              <br />
              <span>Your control.</span>
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="lp-body" style={{ marginTop: "1rem", maxWidth: "28rem" }}>
              Good hospitality depends on trust. Your operating system should earn
              it, too.
            </p>
          </Reveal>
        </div>

        <Stagger className="lp-security-points" delay={80}>
          {POINTS.map(({ icon: Icon, title, body }) => (
            <StaggerItem key={title}>
              <article>
                <Icon size={22} strokeWidth={1.6} aria-hidden="true" />
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
