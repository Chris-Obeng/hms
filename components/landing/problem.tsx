import { Reveal } from "@/components/landing/reveal";

const PAINS = [
  {
    title: "Room 204, twice sold",
    body: "A walk-in arrives while a Booking.com guest holds the same room. You find out at check-in, in front of both of them.",
  },
  {
    title: "Scattered across notebook and WhatsApp",
    body: "Reservations live in a paper notebook, WhatsApp chats and OTA email threads. When one booking changes, the others don't hear about it.",
  },
  {
    title: "Money that won't balance",
    body: "Guests check out owing you, and you spend weeks chasing them on WhatsApp. At close of day, cash, MoMo and card totals still don't agree.",
  },
] as const;

export function Problem() {
  return (
    <section id="how-it-works" className="lp-section lp-section--tint scroll-mt-16">
      <div className="lp-container">
        <Reveal className="max-w-2xl">
          <p className="lp-eyebrow">Sound familiar?</p>
          <h2 className="lp-title mt-3">Your notebook can&rsquo;t hold a hotel</h2>
        </Reveal>

        <div className="mt-12 grid gap-x-10 gap-y-10 md:mt-14 md:grid-cols-3">
          {PAINS.map((pain, i) => (
            <Reveal key={pain.title} delay={i * 80}>
              <div className="border-t-2 border-[var(--lp-hairline)] pt-6">
                <h3 className="lp-heading">{pain.title}</h3>
                <p className="lp-body mt-2.5">{pain.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
