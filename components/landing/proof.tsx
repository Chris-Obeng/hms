const PROOF_ITEMS = [
  { value: "Mobile money", label: "MTN, Telecel Cash, AirtelTigo — plus card", id: "momo" },
  { value: "Same-day setup", label: "Add rooms, rates and staff in minutes", id: "setup" },
  { value: "Works offline-first", label: "Installable PWA for patchy connections", id: "pwa" },
  { value: "Your account", label: "Money settles straight to your bank via Paystack", id: "settle" },
] as const;

export function ProofSection() {
  return (
    <section id="see-it-work" className="scroll-mt-20 border-y border-ivory/[0.06] bg-ivory/[0.02]">
      <div className="mx-auto max-w-6xl px-5 py-12 lg:px-8">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {PROOF_ITEMS.map((item) => (
            <div key={item.id}>
              <dt className="order-2 mt-1 text-sm leading-relaxed text-ivory/45">{item.label}</dt>
              <dd className="order-1 text-lg font-bold tracking-tight text-gold">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
