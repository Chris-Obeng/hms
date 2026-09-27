import Link from "next/link";
import { Magnetic, Reveal } from "@/components/landing/reveal";

/* Feature deep-dive — the night audit, full-bleed forest. The strongest
 * differentiator gets the biggest room: big product figure, specific copy,
 * and the looping payment demo as the motion moment. */

export function DeepDive() {
  return (
    <section className="lp-night lp-grain">
      <div className="lp-section">
        <div className="lp-container grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <p className="lp-index" style={{ color: "var(--lp-night-muted)" }}>04 · Deep dive · Night audit</p>
            <h2 className="lp-display mt-5" style={{ color: "var(--lp-night-fg)" }}>
              Close the day knowing the rooms and the money agree.
            </h2>
            <div className="mt-8 flex flex-col gap-4">
              {[
                ["Locked, not edited", "Every transaction freezes at close. Adjustments become new entries with names attached — the book never rewrites itself."],
                ["Three tills, one total", "Cash drawer, mobile-money and card post to the same audit. Discrepancies surface by folio, not by mystery ₵."],
                ["Owner-ready by breakfast", "Occupancy, ADR, RevPAR and revenue export to one page the owner actually reads."],
              ].map(([t, b]) => (
                <div key={t} className="border-l border-[var(--lp-night-line)] pl-5" style={{ borderLeftColor: "var(--lp-night-brass)" }}>
                  <h3 className="text-[1.02rem] font-semibold tracking-[-0.01em]" style={{ color: "var(--lp-night-fg)" }}>{t}</h3>
                  <p className="mt-1 max-w-md text-[0.92rem] leading-[1.65]" style={{ color: "var(--lp-night-muted)" }}>{b}</p>
                </div>
              ))}
            </div>
            <div className="mt-8">
              <Magnetic>
                <Link href="/onboarding" className="lp-btn lp-btn--paper">
                  Run your first audit
                  <span className="lp-arrow" aria-hidden>→</span>
                </Link>
              </Magnetic>
            </div>
          </Reveal>
          <Reveal delay={120} y={12}>
            <div className="overflow-hidden rounded-xl border border-[var(--lp-night-line)] bg-[var(--lp-night-raised)]">
              <div className="flex items-center justify-between border-b border-[var(--lp-night-line)] px-5 py-3.5">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--lp-night-muted)" }}>Audit · Mon 24 Aug</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--lp-night-brass)" }}>● Closed</span>
              </div>
              <div className="grid grid-cols-3 gap-px bg-[var(--lp-night-line)]">
                {[["Occupancy", "79%"], ["ADR", "$512"], ["RevPAR", "$404"]].map(([k, v]) => (
                  <div key={k} className="bg-[var(--lp-night-raised)] p-5 text-center">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--lp-night-muted)" }}>{k}</p>
                    <p className="lp-num mt-1.5 text-xl font-semibold" style={{ color: "var(--lp-night-fg)" }}>{v}</p>
                  </div>
                ))}
              </div>
              <div className="p-5 text-center sm:p-7">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--lp-night-muted)" }}>Revenue · reconciled</p>
                <p className="lp-num mt-2 text-[clamp(2rem,1.5rem+2.4vw,3rem)] font-semibold tracking-[-0.02em]" style={{ color: "var(--lp-night-brass)" }}>$48,320</p>
                <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--lp-night-muted)" }}>52 rooms · 0 discrepancies</p>
              </div>
              <p className="border-t border-[var(--lp-night-line)] px-5 py-3.5 text-[0.82rem] leading-[1.6]" style={{ color: "var(--lp-night-muted)" }}>
                The looping demo above shows the other half of this: a folio settling in real time, then landing here.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
