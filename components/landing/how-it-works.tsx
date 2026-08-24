const STEPS = [
  {
    step: "1",
    title: "Set up your rooms and rates",
    body: "Add room types, weekend pricing, seasonal rates and taxes. Walk through a guided setup — you see exact pricing before anything is live.",
  },
  {
    step: "2",
    title: "Take bookings and payments",
    body: "Share your booking page. Guests pay by mobile money or card through Paystack; walk-ins go straight onto the calendar. Money settles to your own bank account.",
  },
  {
    step: "3",
    title: "Close each day with night audit",
    body: "One tap posts charges, balances accounts and locks the day. Occupancy, ADR and revenue reports build themselves as you work.",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20 lg:px-8">
        <div className="max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-gold">How it works</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ivory sm:text-4xl">
            From empty calendar to first paid booking
          </h2>
        </div>

        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((item) => (
            <li
              key={item.step}
              className="relative rounded-2xl border border-ivory/[0.08] bg-ivory/[0.02] p-6"
            >
              <span className="flex size-9 items-center justify-center rounded-xl bg-gold/15 text-base font-bold text-gold">
                {item.step}
              </span>
              <h3 className="mt-4 text-lg font-bold tracking-tight text-ivory">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ivory/50">{item.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
