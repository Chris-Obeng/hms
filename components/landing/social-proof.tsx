import { Reveal } from "@/components/landing/reveal";

export function SocialProof() {
  return (
    <section className="lp-section lp-section--tint">
      <div className="lp-container">
        <Reveal>
          <figure className="mx-auto max-w-3xl text-center">
            <blockquote className="lp-quote max-w-2xl mx-auto">
              &ldquo;RoomLine is being built hand-in-hand with Sweet Garden
              Hotel, Kumasi, and a small group of coastal guesthouses in Cape
              Coast — every feature on this page began as a problem their front
              desks brought us.&rdquo;
            </blockquote>
            <figcaption className="lp-micro mt-5">
              Built in Accra, for hotels across Africa.
            </figcaption>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}
