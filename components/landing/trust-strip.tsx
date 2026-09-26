import { Reveal } from "@/components/landing/reveal";

const POINTS = [
  {
    title: "Settlement to your account",
    body: "Card and mobile-money payments clear straight to your own bank — never held by us, never a middleman on your revenue.",
  },
  {
    title: "Your data stays yours",
    body: "Export every guest, booking and payment whenever you want, no questions asked.",
  },
  {
    title: "Works when the wifi doesn't",
    body: "A dropped connection never stops check-in. RoomLine keeps working locally and syncs the moment you're back online.",
  },
] as const;

export function TrustStrip() {
  return (
    <section aria-labelledby="trust-heading" className="lp-section--tight lp-section border-t border-[var(--lp-line-strong)]">
      <div className="lp-container">
        <Reveal>
          <h2 id="trust-heading" className="lp-index">Built to keep working</h2>
        </Reveal>
        <div className="mt-8 grid gap-x-10 gap-y-10 md:grid-cols-3">
          {POINTS.map((point, i) => (
            <Reveal key={point.title} delay={i * 80}>
              <div className="border-t border-[var(--lp-line)] pt-5">
                <span className="lp-index">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="lp-h3 mt-3">{point.title}</h3>
                <p className="lp-small mt-2 max-w-xs">{point.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
