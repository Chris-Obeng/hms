import { Reveal } from "@/components/landing/reveal";

export function SocialProof() {
  return (
    <section className="lp-section">
      <div className="lp-container">
        <Reveal className="mx-auto max-w-3xl">
          <p className="lp-index">Why we built it</p>
          <figure className="mt-6">
            <blockquote className="lp-display text-[clamp(1.75rem,1.2rem+2.4vw,2.75rem)]">
              We build RoomLine next to the front desks that run on it. Every
              screen here began as a real problem an operator walked us through —
              nothing on this page is a mockup of something we haven&rsquo;t
              shipped.
            </blockquote>
            <figcaption className="mt-6 flex items-center gap-3">
              <span className="h-px w-8 bg-[var(--lp-line-strong)]" aria-hidden />
              <span className="lp-index">The RoomLine team · built with independent hoteliers</span>
            </figcaption>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}
