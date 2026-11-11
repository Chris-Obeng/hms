import Image from "next/image";
import Link from "next/link";
import { ActionLink } from "./action-link";
import { Reveal } from "./reveal";

export function DemoCta() {
  return (
    <section className="rl-closing" aria-labelledby="closing-heading">
      <div className="rl-wrap rl-grid">
        <Reveal className="rl-closing-photo">
          <figure className="rl-photo rl-photo--closing rl-photo-drift">
            <Image
              src="/images/landing/hotel-lounge-jpg.jpg"
              alt="Candlelit timber lounge inside a boutique courtyard hotel at dusk"
              fill
              sizes="(max-width: 900px) 94vw, 42vw"
            />
          </figure>
        </Reveal>

        <Reveal className="rl-closing-copy" delay={80}>
          <h2 id="closing-heading" className="rl-h2">
            Start with your&nbsp;rooms.
          </h2>
          <p className="rl-body">
            Create your property workspace today and put your front desk in calm
            order.
          </p>
          <div className="rl-hero-actions">
            <ActionLink />
            <Link href="/sign-in" prefetch={false} className="rl-plain-link">
              Sign in
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
