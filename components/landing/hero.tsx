import Image from "next/image";
import { ActionLink } from "./action-link";
import { MaskedLines, Reveal } from "./reveal";

export function Hero() {
  return (
    <section className="rl-hero" aria-labelledby="hero-heading">
      <div className="rl-wrap">
        <div className="rl-grid rl-hero-head">
          <div className="rl-hero-title-col">
            <h1 id="hero-heading" className="rl-h1">
              <MaskedLines lines={["Run a calmer", "front desk."]} />
            </h1>
          </div>

          <Reveal className="rl-hero-deck-col" delay={140}>
            <p className="rl-lead">
              Hotel software for independent properties in Ghana. Reservations,
              Mobile Money, direct bookings, and night audit.
            </p>
            <div className="rl-hero-actions">
              <ActionLink />
              <a href="#how-it-works" className="rl-plain-link">
                How it works
              </a>
            </div>
          </Reveal>
        </div>

        <Reveal delay={200}>
          <figure className="rl-hero-media rl-photo-drift">
            <Image
              src="/images/landing/hotel-exterior.jpg"
              alt="Warmly lit courtyard hotel pavilion beside a calm reflective pool at dusk"
              fill
              priority
              sizes="95vw"
            />
          </figure>
        </Reveal>
      </div>
    </section>
  );
}
