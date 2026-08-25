import Link from "next/link";
import { Reveal } from "@/components/landing/reveal";

/*
 * Prices mirror app/dashboard/billing/page.tsx PLAN_META exactly (GHS
 * 400 / 750 / 1,400) — keep the two in sync.
 */
const PLANS = [
  {
    name: "Starter",
    price: "GHS 400",
    tagline: "For small guesthouses finding their feet",
    features: [
      "Up to 15 rooms",
      "3 staff accounts",
      "Direct booking page",
      "Payments & mobile money",
      "Night audit",
    ],
    cta: "Choose Starter",
    featured: false,
  },
  {
    name: "Growth",
    price: "GHS 750",
    tagline: "Most hotels start here",
    features: [
      "Up to 40 rooms",
      "10 staff accounts",
      "Everything in Starter, plus:",
      "Housekeeping board",
      "Reports",
      "Priority support",
    ],
    cta: "Start with Growth",
    featured: true,
  },
  {
    name: "Professional",
    price: "GHS 1,400",
    tagline: "For groups running more than one property",
    features: [
      "Unlimited rooms and staff",
      "Everything in Growth, plus:",
      "Multi-property management",
      "Audit log",
      "Dedicated onboarding",
    ],
    cta: "Choose Professional",
    featured: false,
  },
] as const;

export function Pricing() {
  return (
    <section id="pricing" className="lp-section scroll-mt-16">
      <div className="lp-container">
        <Reveal className="max-w-2xl">
          <p className="lp-eyebrow">Pricing</p>
          <h2 className="lp-title mt-3">Flat monthly pricing, in cedis</h2>
          <p className="lp-body mt-4 max-w-xl">
            No commissions on your bookings, no markup on payments — just one
            flat monthly fee.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-4 md:mt-14 md:grid-cols-3 md:gap-5 lg:gap-6">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 80} className={plan.featured ? "md:-my-4" : undefined}>
              <div
                className={`flex h-full flex-col rounded-2xl border bg-white p-7 ${
                  plan.featured
                    ? "border-accent shadow-[var(--lp-media-shadow)]"
                    : "border-[var(--lp-hairline)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold tracking-tight text-foreground">{plan.name}</h3>
                  {plan.featured ? (
                    <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">
                      Most hotels start here
                    </span>
                  ) : null}
                </div>
                <p className="lp-price mt-4">
                  {plan.price}
                  <span className="ml-1 text-sm font-medium text-muted">/month</span>
                </p>
                <p className="lp-small mt-2">{plan.tagline}</p>
                <ul className="mt-6 flex flex-col gap-2.5 border-t border-[var(--lp-hairline)] pt-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm text-muted">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        className="mt-0.5 shrink-0 text-accent"
                        aria-hidden="true"
                      >
                        <path
                          d="M3.5 8.5l3 3 6-7"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-7">
                  <Link
                    href="/onboarding"
                    className={
                      plan.featured
                        ? "button button--primary flex h-11 w-full items-center justify-center rounded-lg text-sm font-semibold"
                        : "button button--outline flex h-11 w-full items-center justify-center rounded-lg text-sm font-semibold"
                    }
                  >
                    {plan.cta}
                  </Link>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
