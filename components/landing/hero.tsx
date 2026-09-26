import Link from "next/link";
import { DemoPlayer } from "@/components/landing/demo-player";
import { MaskLines, Reveal } from "@/components/landing/reveal";

/*
 * The opening claim, then the product itself. The headline masks up line by
 * line; everything else rises in on a short stagger, so the fold reads as one
 * orchestrated move rather than a pile of elements. The demo is the only image.
 */

export function Hero() {
  return (
    <section className="lp-section relative overflow-hidden">
      <div className="lp-container flex flex-col items-center pt-4 text-center md:pt-10">
        <Reveal as="p" className="lp-index">
          Bookings · Payments · Night audit
        </Reveal>

        <h1 className="lp-display lp-display--hero mt-5 max-w-4xl">
          <MaskLines lines={["One screen for the", "entire front desk."]} delay={120} />
        </h1>

        <Reveal as="p" className="lp-lead mt-6 max-w-xl text-center" delay={260}>
          Bookings, payments and the nightly audit in one place — mobile money,
          cash and card included — so the desk ends every day with the rooms and
          the money in agreement.
        </Reveal>

        <Reveal className="mt-9 flex flex-col items-center gap-3 sm:flex-row" delay={360}>
          <Link href="/onboarding" className="lp-btn lp-btn--solid">
            Start free trial
          </Link>
          <a href="#demo" className="lp-btn lp-btn--ghost">
            See a payment clear
            <span className="lp-arrow" aria-hidden>↓</span>
          </a>
        </Reveal>

        <Reveal as="p" className="lp-index mt-6" delay={440}>
          Free for 14 days · No card required · Works offline
        </Reveal>
      </div>

      <Reveal className="lp-container mt-12 md:mt-16" delay={200}>
        <div id="demo" className="scroll-mt-24">
          <DemoPlayer />
        </div>
      </Reveal>
    </section>
  );
}
