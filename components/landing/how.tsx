import { Stagger, StaggerItem } from "@/components/landing/reveal";

/* How it works — four steps on one connecting brass line, each with a
 * fragment of the real product surface. Editorial ledger, not a wizard. */

const STEPS = [
  {
    no: "Step 01",
    title: "Bring your rooms & rates",
    body: "Room types, nightly rates, taxes. Import the diary or type it in — live the same day.",
    shot: (
      <div className="flex items-center gap-2 p-4" role="img" aria-label="Room types fragment">
        {[["Standard", "₵850"], ["Deluxe", "₵1,200"], ["Suite", "₵2,400"]].map(([t, p]) => (
          <div key={t} className="flex-1 rounded-lg border border-[var(--lp-line)] bg-[var(--lp-surface)] p-2.5 text-center">
            <p className="text-[11px] font-semibold text-[var(--lp-ink)]">{t}</p>
            <p className="lp-num mt-0.5 text-[11px] text-[var(--lp-muted)]">{p}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    no: "Step 02",
    title: "Take bookings everywhere",
    body: "Direct page, walk-ins and OTAs land on the same board. Overlaps block before they exist.",
    shot: (
      <div className="p-4" role="img" aria-label="New reservation fragment">
        <div className="rounded-lg border border-[var(--lp-line)] bg-[var(--lp-surface)] p-3">
          <p className="text-[12px] font-semibold text-[var(--lp-ink)]">Clara Nolan · Deluxe 102</p>
          <p className="lp-num mt-0.5 text-[11px] text-[var(--lp-muted)]">Aug 25 → Aug 29 · 4 nights</p>
          <p className="mt-2 inline-block rounded border border-[var(--lp-brand-line)] bg-[var(--lp-brand-wash)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--lp-brand)]">Hold placed · no overlap</p>
        </div>
      </div>
    ),
  },
  {
    no: "Step 03",
    title: "Run the day",
    body: "Check in, move rooms, assign cleans, take mobile money, cash or card — all against the folio.",
    shot: (
      <div className="flex items-center gap-2 p-4" role="img" aria-label="Running the day fragment">
        <div className="flex-1 rounded-lg bg-[var(--lp-brand)] p-3 text-center text-[11px] font-semibold text-[var(--lp-night-fg)]">Check in · 102</div>
        <div className="flex-1 rounded-lg border border-[var(--lp-line)] bg-[var(--lp-surface)] p-3 text-center text-[11px] font-semibold text-[var(--lp-ink)]">Clean · 204</div>
        <div className="flex-1 rounded-lg border border-[var(--lp-line)] bg-[var(--lp-surface)] p-3 text-center text-[11px] font-semibold text-[var(--lp-ink)]">₵1,080 paid</div>
      </div>
    ),
  },
  {
    no: "Step 04",
    title: "Close in one tap",
    body: "Night audit locks every transaction. Occupancy, ADR and revenue are ready before breakfast.",
    shot: (
      <div className="flex items-center justify-between rounded-lg bg-[var(--lp-brand)] p-4" role="img" aria-label="Night audit fragment">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-night-muted)]">Audit · closed</span>
        <span className="lp-num text-[15px] font-semibold text-[var(--lp-night-brass)]">$48,320</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-night-muted)]">0 gaps</span>
      </div>
    ),
  },
] as const;

export function How() {
  return (
    <section id="how" className="lp-section scroll-mt-24 border-t border-[var(--lp-line-strong)] bg-[var(--lp-surface)]">
      <div className="lp-container">
        <div className="max-w-2xl">
          <p className="lp-eyebrow">03 · How it works</p>
          <h2 className="lp-h2 mt-4">Live by tonight&apos;s audit.</h2>
          <p className="lp-lead mt-4">Four steps, one day. Most properties close their first night on RoomLine within 24 hours of signup.</p>
        </div>
        <Stagger className="relative mt-12 grid gap-10 md:grid-cols-4 md:gap-5" step={70}>
          <div className="absolute left-0 right-0 top-[9px] hidden h-px bg-[var(--lp-line-strong)] md:block" aria-hidden />
          <div className="absolute left-0 top-[9px] hidden h-px w-1/4 bg-[var(--lp-brass)] md:block" aria-hidden />
          {STEPS.map((s) => (
            <StaggerItem key={s.no}>
              <div className="relative">
                <span className="relative z-[1] flex size-[18px] items-center justify-center rounded-full border border-[var(--lp-brass)] bg-[var(--lp-paper)]" aria-hidden>
                  <span className="size-1.5 rounded-full bg-[var(--lp-brass)]" />
                </span>
                <p className="lp-index mt-5">{s.no}</p>
                <h3 className="lp-h3 mt-2 text-[1.2rem]">{s.title}</h3>
                <p className="lp-body mt-2 text-[0.9rem]">{s.body}</p>
                <div className="mt-4 overflow-hidden rounded-lg border border-[var(--lp-line)] bg-[var(--lp-paper)]">{s.shot}</div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
