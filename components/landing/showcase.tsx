import { Reveal } from "./reveal";

const FEATURES = [
  {
    title: "Live room calendar",
    body: "Block overlaps automatically across walk-ins, phone holds, and web bookings.",
  },
  {
    title: "Mobile Money & cash",
    body: "Record MTN MoMo, card, and desk cash on one guest bill in GHS.",
  },
  {
    title: "Direct booking link",
    body: "Take commission-free reservations straight from WhatsApp, Instagram, and Google.",
  },
  {
    title: "One-click night audit",
    body: "Verify open balances, reconcile every tender, and lock the business day.",
  },
] as const;

export function Showcase() {
  return (
    <section
      id="features"
      className="rl-features"
      aria-labelledby="features-heading"
    >
      <div className="rl-wrap rl-grid">
        <Reveal className="rl-features-intro">
          <h2 id="features-heading" className="rl-h2">
            Every stay in&nbsp;sync.
          </h2>
          <p className="rl-body">
            Built for 8 to 80 rooms, without legacy menus or midnight
            spreadsheets.
          </p>
        </Reveal>

        <div className="rl-features-list">
          {FEATURES.map((item, idx) => (
            <Reveal key={item.title} delay={idx * 60}>
              <article className="rl-feature-block">
                <h3 className="rl-h3">{item.title}</h3>
                <p className="rl-body">{item.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
