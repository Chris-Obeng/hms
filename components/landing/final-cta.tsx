import Link from "next/link";
import { Reveal } from "@/components/landing/reveal";

export function FinalCta() {
  return (
    <section className="lp-section">
      <div className="lp-container flex flex-col items-center text-center">
        <Reveal>
          <h2 className="lp-title max-w-xl">No more surprises at check-in</h2>
          <p className="lp-body mt-4 max-w-md">
            Try it on tomorrow&rsquo;s arrivals — our team will set up beside you.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4">
            <Link
              href="/onboarding"
              className="button button--primary inline-flex h-12 items-center rounded-lg px-8 text-base font-semibold"
            >
              Get started
            </Link>
            <p className="lp-micro">Setup takes minutes. See pricing before you commit.</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
