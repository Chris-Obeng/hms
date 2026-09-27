"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { DemoPlayer } from "@/components/landing/demo-player";
import { Magnetic, MaskLines, Reveal } from "@/components/landing/reveal";

/*
 * Editorial hero, not a centered SaaS pitch. Left column: one concrete claim
 * in big Fraunces, one sentence of subhead, magnetic primary + secondary CTA,
 * and a folio ledger strip. Right column: the real product in a browser frame
 * with scroll-linked tilt/parallax. Mobile stacks deliberately: claim, CTAs,
 * then the dashboard crop — not the desktop grid shrunk.
 */

function HeroVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const rotateX = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [4.5, -3.5]);
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [28, -28]);

  return (
    <div ref={ref} style={{ perspective: 1400 }}>
      <motion.div style={reduce ? undefined : { rotateX, y, transformStyle: "preserve-3d" }}>
        <DemoPlayer />
      </motion.div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="lp-section lp-grain relative overflow-hidden">
      <div className="lp-container lp-hero-grid pt-2 md:pt-8">
        <div>
          <Reveal as="p" className="lp-eyebrow">
            RoomLine · Property management
          </Reveal>

          <h1 className="lp-display lp-display--hero mt-5">
            <MaskLines
              lines={["Run the whole", "property from", "one dashboard."]}
              delay={120}
            />
          </h1>

          <Reveal as="p" className="lp-lead mt-6" delay={260}>
            Reservations, front desk, housekeeping, channels, billing and
            reporting — one calm system, so the rooms and the money agree at
            close of day.
          </Reveal>

          <Reveal className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center" delay={320}>
            <Magnetic>
              <Link href="/onboarding" className="lp-btn lp-btn--solid">
                Start free trial
                <span className="lp-arrow" aria-hidden>→</span>
              </Link>
            </Magnetic>
            <Link href="#product-demo" className="lp-btn lp-btn--ghost">
              Watch a folio clear
            </Link>
          </Reveal>

          <Reveal delay={380}>
            <dl className="lp-hero-ledger">
              <div>
                <dt>Today</dt>
                <dd>Mon 24 Aug</dd>
              </div>
              <div>
                <dt>Occupancy</dt>
                <dd>41 / 52 rooms</dd>
              </div>
              <div>
                <dt>To clear</dt>
                <dd>$1,548 · 3 folios</dd>
              </div>
            </dl>
          </Reveal>
        </div>

        <Reveal className="lg:pb-2" delay={200} y={12}>
          <div id="product-demo" className="scroll-mt-24">
            <HeroVisual />
          </div>
        </Reveal>
      </div>

      <div className="lp-container mt-10 md:mt-14">
        <Reveal as="p" className="lp-index" delay={120}>
          Free for 14 days · No card required · Live in a day
        </Reveal>
      </div>
    </section>
  );
}
