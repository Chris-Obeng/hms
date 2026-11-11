import Image from "next/image";
import { Reveal } from "./reveal";

export function DeepDive() {
  return (
    <section id="ghana" className="rl-ghana" aria-labelledby="ghana-heading">
      <div className="rl-wrap rl-grid">
        <Reveal className="rl-ghana-wide">
          <figure className="rl-photo rl-photo--landscape rl-photo--reception rl-photo-drift">
            <Image
              src="/images/landing/hotel-reception-jpg.jpg"
              alt="Twin mahogany reception desks and cane armchairs inside a quiet boutique hotel lobby"
              fill
              sizes="(max-width: 900px) 94vw, 56vw"
            />
          </figure>
        </Reveal>

        <div className="rl-ghana-side">
          <Reveal delay={70}>
            <figure className="rl-photo rl-photo--suite rl-photo-drift">
              <Image
                src="/images/landing/hotel-suite.jpg"
                alt="Prepared hotel room with warm timber walls opening onto a lush green courtyard"
                fill
                sizes="(max-width: 900px) 94vw, 38vw"
              />
            </figure>
          </Reveal>

          <Reveal className="rl-ghana-copy" delay={120}>
            <h2 id="ghana-heading" className="rl-h2">
              Made for&nbsp;Ghana.
            </h2>
            <p className="rl-body">
              Online payments settle straight to your Ghanaian bank or MoMo
              account via Paystack. Reception keeps working on tablets and
              phones even when internet drops.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
