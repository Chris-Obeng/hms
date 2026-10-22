import { BedDouble, ChartNoAxesCombined, ConciergeBell, ReceiptText } from "lucide-react";

const jobs = [
  { icon: BedDouble, label: "01", title: "Reservations that stay in step.", description: "Keep dates, guests, and room availability together from the first booking to the final night." },
  { icon: ConciergeBell, label: "02", title: "A front desk with fewer handovers.", description: "Give every shift the same clear picture of arrivals, departures, room readiness, and guest details." },
  { icon: ReceiptText, label: "03", title: "Payments you can close with confidence.", description: "Follow charges, payments, and outstanding balances in Ghana cedis without chasing the story." },
] as const;

export function Showcase() {
  return (
    <section id="features" className="rl-section" aria-labelledby="features-heading">
      <div className="rl-container">
        <div className="rl-section-intro">
          <p className="rl-eyebrow">The work behind the welcome</p>
          <h2 id="features-heading" className="rl-heading">The right things, in the right order.</h2>
          <p className="rl-description">RoomLine removes the scattered handovers that make a good day at the property feel harder than it should.</p>
        </div>
        <div className="rl-capabilities">
          <div className="rl-feature-list">
            {jobs.map(({ icon: Icon, label, title, description }) => (
              <article className="rl-feature-row" key={title}>
                <span className="rl-feature-number">{label}</span>
                <Icon size={23} strokeWidth={1.6} aria-hidden="true" />
                <div><h3>{title}</h3><p>{description}</p></div>
              </article>
            ))}
          </div>
          <aside className="rl-capability-note">
            <ChartNoAxesCombined size={28} strokeWidth={1.5} aria-hidden="true" />
            <p className="rl-capability-note-title">Your property, in view.</p>
            <p>Less time looking for the answer. More time making the stay feel personal.</p>
            <span>One shared place to start the day.</span>
          </aside>
        </div>
      </div>
    </section>
  );
}
