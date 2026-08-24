import Link from "next/link";

/**
 * Prices mirror app/dashboard/billing/page.tsx PLAN_META exactly — keep the
 * two in sync. If billing plans change, update both.
 */
const PLANS = [
  { name: "Starter", price: "GHS 400", rooms: "Up to 15 rooms", staff: "3 staff" },
  { name: "Growth", price: "GHS 750", rooms: "Up to 40 rooms", staff: "10 staff" },
  { name: "Professional", price: "GHS 1,400", rooms: "Unlimited rooms", staff: "Unlimited staff" },
] as const;

export function PricingTeaser() {
  return (
    <section className="scroll-mt-20 border-t border-ivory/[0.06]">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20 lg:px-8">
        <div className="max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-gold">Pricing</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ivory sm:text-4xl">
            One flat monthly price. Every feature included.
          </h2>
          <p className="mt-3 text-base leading-relaxed text-ivory/50">
            No commissions on your bookings. No payment markup. You see exact
            pricing before you commit.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className="rounded-2xl border border-ivory/[0.08] bg-ivory/[0.02] p-6"
            >
              <h3 className="text-sm font-semibold uppercase tracking-wider text-ivory/50">
                {plan.name}
              </h3>
              <p className="mt-3 text-2xl font-extrabold tracking-tight text-ivory">
                {plan.price}
                <span className="ml-1 text-sm font-medium text-ivory/40">/month</span>
              </p>
              <ul className="mt-4 space-y-1.5 text-sm text-ivory/55">
                <li>{plan.rooms}</li>
                <li>{plan.staff}</li>
                <li>Direct booking page + Paystack</li>
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10">
          <Link
            href="/onboarding"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-gold px-7 text-base font-semibold text-forest transition-transform hover:-translate-y-px active:translate-y-0 active:scale-[0.99]"
          >
            Set up your hotel
          </Link>
        </div>
      </div>
    </section>
  );
}
