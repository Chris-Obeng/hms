import { Stagger, StaggerItem } from "@/components/landing/reveal";

const PAINS = [
  {
    no: "01",
    title: "The 11pm double-booking",
    body: "A walk-in takes Room 204 while an OTA holds it. You discover it at check-in, in front of both guests — and comp a night to fix it.",
  },
  {
    no: "02",
    title: "Five books, none agreeing",
    body: "Reservations live in a paper diary, OTA inboxes and staff phones. One change never reaches the others, so housekeeping cleans the wrong rooms.",
  },
  {
    no: "03",
    title: "Money that won't close",
    body: "Cash, mobile money and card totals meet only at midnight — in a spreadsheet. The night audit takes an hour and still leaves ₵ unaccounted.",
  },
] as const;

export function Problem() {
  return (
    <section id="problem" className="lp-section scroll-mt-24 border-t border-[var(--lp-line-strong)]">
      <div className="lp-container">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
          <div>
            <p className="lp-eyebrow">01 · The problem</p>
            <h2 className="lp-h2 mt-4">
              Running a hotel on disconnected tools.
            </h2>
            <div className="lp-rule-brass mt-6 w-16" aria-hidden />
          </div>

          <Stagger className="grid gap-px overflow-hidden rounded-xl border border-[var(--lp-line)] bg-[var(--lp-line)] md:grid-cols-3">
            {PAINS.map((pain) => (
              <StaggerItem key={pain.no} className="bg-[var(--lp-surface)] p-7">
                <p className="lp-index">{pain.no}</p>
                <h3 className="lp-h3 mt-4 text-[1.35rem]">{pain.title}</h3>
                <p className="lp-body mt-3 text-[0.95rem]">{pain.body}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </div>
    </section>
  );
}
