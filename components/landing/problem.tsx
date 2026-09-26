import { Reveal } from "@/components/landing/reveal";

const PAINS = [
  {
    tag: "Conflict",
    tone: "due",
    title: "Room 204, twice sold",
    body: "A walk-in arrives while an online guest holds the same room. You find out at check-in, in front of both of them.",
  },
  {
    tag: "Untracked",
    tone: "house",
    title: "A notebook, three inboxes, one phone",
    body: "Reservations live across a paper diary, OTA email threads and staff phones. When one booking changes, the others never hear about it.",
  },
  {
    tag: "Unreconciled",
    tone: "await",
    title: "Money that won't balance",
    body: "Guests leave owing you, and you chase them for weeks. At close of day the cash drawer, mobile-money and card totals still don't agree.",
  },
] as const;

export function Problem() {
  return (
    <section id="how-it-works" className="lp-section lp-band scroll-mt-24">
      <div className="lp-container grid gap-10 md:grid-cols-[0.85fr_1.1fr] md:gap-16">
        <Reveal>
          <p className="lp-index">§ 01 · The problem</p>
          <h2 className="lp-h2 mt-4">
            The front desk keeps two sets of books, and neither agrees.
          </h2>
          <p className="lp-lead mt-5">
            Bookings scatter across a notebook, a phone and the OTAs. By close of
            day nobody can say for certain which rooms sold, or where the money
            went.
          </p>
        </Reveal>

        <div>
          {PAINS.map((pain, i) => (
            <Reveal key={pain.title} delay={i * 80}>
              <div className="grid grid-cols-[auto_1fr] gap-x-5 border-t border-[var(--lp-line-strong)] pt-6 first:pt-0 first:border-t-0 md:pt-7">
                <span className="lp-index pt-1.5">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <h3 className="lp-h3">{pain.title}</h3>
                    <span className={`lp-chip lp-chip--${pain.tone}`}>
                      <span className="lp-chip__dot" />
                      {pain.tag}
                    </span>
                  </div>
                  <p className="lp-body mt-2.5 max-w-md">{pain.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
