import { Reveal } from "@/components/landing/reveal";

const POINTS = [
  {
    title: "Paystack-processed payments",
    body: "Cards and mobile money run on Paystack, settled to your own bank account.",
  },
  {
    title: "You own your data",
    body: "Export every guest, booking and payment, anytime, no questions asked.",
  },
  {
    title: "Offline-first",
    body: "Patchy internet or a power cut won't stop check-in; RoomLine syncs when you're back online.",
  },
] as const;

export function TrustStrip() {
  return (
    <section aria-labelledby="trust-heading" className="lp-section border-y border-[var(--lp-hairline)]">
      <div className="lp-container">
        <Reveal>
          <h2 id="trust-heading" className="lp-eyebrow">Built to keep working</h2>
        </Reveal>
        <div className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-3">
          {POINTS.map((point, i) => (
            <Reveal key={point.title} delay={i * 80}>
              <h3 className="lp-heading">{point.title}</h3>
              <p className="lp-small mt-1.5 max-w-xs">{point.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
