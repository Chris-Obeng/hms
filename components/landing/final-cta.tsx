import Link from "next/link";
import { CountUp, Reveal } from "@/components/landing/reveal";

export function FinalCta() {
  return (
    <section className="lp-night">
      <div className="lp-section">
        <div className="lp-container flex flex-col items-center text-center">
          <Reveal className="flex flex-col items-center">
            <span className="lp-chip lp-chip--night">
              <span className="lp-chip__dot" />
              Night audit · closed
            </span>
            <h2
              className="lp-display mt-6 max-w-2xl"
              style={{ color: "var(--lp-night-fg)" }}
            >
              Close tomorrow knowing the rooms and the money agree.
            </h2>

            {/* The closing figure: the day reconciled, in brass. */}
            <div
              className="mt-8 flex w-full max-w-sm flex-col items-center gap-1 rounded-xl border px-6 py-5"
              style={{ borderColor: "var(--lp-night-line)", background: "var(--lp-night-raised)" }}
            >
              <span className="lp-index" style={{ color: "var(--lp-night-muted)" }}>
                Night audit · Mon 24 Aug
              </span>
              <span className="lp-figure" style={{ color: "var(--lp-night-brass)" }}>
                <CountUp to={48320} prefix="$" />
              </span>
              <span className="lp-index" style={{ color: "var(--lp-night-muted)" }}>
                52 rooms · 0 discrepancies
              </span>
            </div>

            <p
              className="lp-body mt-7 max-w-md"
              style={{ color: "var(--lp-night-muted)" }}
            >
              Start free for 14 days. Bring your rooms and your rates — our team
              sets up beside you, right through your first night&rsquo;s close.
            </p>
            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
              <Link href="/onboarding" className="lp-btn lp-btn--paper">
                Start your free trial
              </Link>
              <a href="#demo" className="lp-btn lp-btn--night">
                See a payment clear
                <span className="lp-arrow" aria-hidden>↓</span>
              </a>
            </div>
            <p className="lp-index mt-6" style={{ color: "var(--lp-night-muted)" }}>
              No card required · Works offline · Live in a day
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
