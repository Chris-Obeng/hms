import Link from "next/link";
import { Magnetic, Reveal } from "@/components/landing/reveal";

export function FinalCta() {
  return (
    <section className="lp-night lp-grain">
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

            <p
              className="lp-body mt-6 max-w-md"
              style={{ color: "var(--lp-night-muted)" }}
            >
              Start free for 14 days. Bring your rooms and your rates — our team
              sets up beside you, right through your first night&rsquo;s close.
            </p>
            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
              <Magnetic>
                <Link href="/onboarding" className="lp-btn lp-btn--paper">
                  Start your free trial
                  <span className="lp-arrow" aria-hidden>→</span>
                </Link>
              </Magnetic>
              <a href="#demo" className="lp-btn lp-btn--night">
                Request a demo
              </a>
            </div>
            <p className="lp-index mt-6" style={{ color: "var(--lp-night-muted)" }}>
              No card required · Live in a day · Cancel anytime
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
