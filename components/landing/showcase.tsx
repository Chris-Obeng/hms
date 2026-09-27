import Link from "next/link";
import { BedDouble, CalendarDays, ChartColumn, Globe, Wallet } from "lucide-react";
import { CountUp, Reveal, Stagger, StaggerItem } from "@/components/landing/reveal";

/* Modules — five, asymmetric, one line-icon system (lucide 1.5px).
 * Each module pairs copy with a fragment of the real product surface. */

function BoardMini() {
  const rows = [
    { room: "101", w: "58%", g: "Marcus Bennett", t: "clear" },
    { room: "102", w: "74%", g: "Clara Nolan", t: "await" },
    { room: "201", w: "40%", g: "Walk-in · cash", t: "house" },
  ] as const;
  const tint = {
    clear: ["var(--lp-brand)", "var(--lp-brand-wash)", "var(--lp-brand-line)"],
    await: ["var(--lp-await)", "var(--lp-await-wash)", "var(--lp-await-line)"],
    house: ["var(--lp-house)", "var(--lp-house-wash)", "var(--lp-house-line)"],
  } as const;
  return (
    <div className="flex h-full flex-col justify-center gap-2 p-5" role="img" aria-label="Front-desk calendar fragment">
      {rows.map((r) => {
        const c = tint[r.t];
        return (
          <div key={r.room} className="flex items-center gap-2">
            <span className="lp-num w-9 text-[11px] font-semibold text-[var(--lp-muted)]">{r.room}</span>
            <div className="h-8 flex-1 rounded-md border border-dashed border-[var(--lp-line)] bg-[var(--lp-paper)]">
              <div className="flex h-full items-center truncate rounded-md border px-2 text-[11px] font-semibold" style={{ width: r.w, color: c[0], backgroundColor: c[1], borderColor: c[2] }}>{r.g}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HouseMini() {
  const rows = [
    { room: "204", task: "Checkout clean", who: "Ama · 25 min", dot: "var(--lp-due)" },
    { room: "205", task: "Inspect", who: "Yaw · 10 min", dot: "var(--lp-await)" },
    { room: "206", task: "Ready", who: "Verified 11:40", dot: "var(--lp-brand)" },
  ] as const;
  return (
    <div className="flex h-full flex-col justify-center gap-2 p-5">
      {rows.map((r) => (
        <div key={r.room} className="flex items-center gap-2.5 rounded-lg border border-[var(--lp-line)] bg-[var(--lp-surface)] px-3 py-2.5">
          <span className="lp-num text-xs font-semibold">{r.room}</span>
          <span className="text-[13px] font-medium text-[var(--lp-ink)]">{r.task}</span>
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-[var(--lp-muted)]">
            <span className="inline-block size-1.5 rounded-full" style={{ background: r.dot }} aria-hidden />{r.who}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChannelMini() {
  const rows = [
    { ch: "Direct", left: "12 left", bar: "88%" },
    { ch: "Booking.com", left: "6 left", bar: "62%" },
    { ch: "Expedia", left: "6 left", bar: "48%" },
  ] as const;
  return (
    <div className="flex h-full flex-col justify-center gap-3 p-5">
      {rows.map((r) => (
        <div key={r.ch}>
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-semibold text-[var(--lp-ink)]">{r.ch}</span>
            <span className="lp-num text-[var(--lp-muted)]">{r.left}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full border border-[var(--lp-line)] bg-[var(--lp-paper)]">
            <div className="h-full rounded-full bg-[var(--lp-brand)]" style={{ width: r.bar }} />
          </div>
        </div>
      ))}
      <p className="lp-index pt-1">One inventory · pushed everywhere</p>
    </div>
  );
}

function BillingMini() {
  return (
    <div className="flex h-full flex-col justify-center gap-2 p-5">
      {[
        ["Mobile Money", "Paid $1,080"],
        ["Cash at desk", "BK-2492 · recorded"],
        ["Card · Visa", "Paid $2,340"],
      ].map(([m, s]) => (
        <div key={m} className="flex items-center justify-between rounded-lg border border-[var(--lp-line)] bg-[var(--lp-surface)] px-3 py-2.5">
          <span className="text-[13px] font-semibold text-[var(--lp-ink)]">{m}</span>
          <span className="lp-index">{s}</span>
        </div>
      ))}
    </div>
  );
}

function ReportMini() {
  return (
    <div className="flex h-full flex-col justify-center gap-4 p-5 sm:p-6">
      <div>
        <div className="flex items-baseline justify-between">
          <span className="lp-index">Occupancy · this week</span>
          <b className="lp-num text-sm text-[var(--lp-ink)]"><CountUp to={82} suffix="%" /></b>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full border border-[var(--lp-line)] bg-[var(--lp-paper)]">
          <div className="h-full w-[82%] rounded-full bg-[var(--lp-brand)]" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[["ADR", "$512"], ["RevPAR", "$418"], ["Revenue", "$18,740"]].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-[var(--lp-line)] bg-[var(--lp-surface)] p-3">
            <p className="lp-index">{k}</p>
            <p className="lp-num mt-1 text-[15px] font-semibold text-[var(--lp-ink)]">{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Showcase() {
  const cards = [
    { id: "reservations", icon: CalendarDays, kick: "Reservations · Front desk", t: "Every room, every night, on one board", b: "Drag a booking to a new date or room — overlaps block before they exist. Walk-ins check in in seconds.", v: <BoardMini />, span: "lg:col-span-7" },
    { id: "housekeeping", icon: BedDouble, kick: "Housekeeping", t: "The floor knows before the desk calls", b: "Checkout cleans, inspections and ready rooms update live for the whole floor team.", v: <HouseMini />, span: "lg:col-span-5" },
    { id: "channels", icon: Globe, kick: "Channel manager", t: "One inventory, pushed everywhere", b: "Sell direct first, let OTAs take the rest — same availability, never double-sold.", v: <ChannelMini />, span: "lg:col-span-5" },
    { id: "billing", icon: Wallet, kick: "Billing · POS", t: "Money lands on the right folio", b: "Mobile money, cash and card — cleared to your bank or recorded by hand, reconciled nightly.", v: <BillingMini />, span: "lg:col-span-7" },
  ] as const;
  return (
    <section id="modules" className="lp-section scroll-mt-24 border-t border-[var(--lp-line-strong)]">
      <div className="lp-container">
        <Reveal className="max-w-2xl">
          <p className="lp-eyebrow">02 · Modules</p>
          <h2 className="lp-h2 mt-4">Five departments, one ledger.</h2>
          <p className="lp-lead mt-4">One availability, one folio, one close of day — read five ways.</p>
        </Reveal>
        <Stagger className="mt-12 grid gap-5 lg:grid-cols-12" step={70}>
          {cards.map((m) => (
            <StaggerItem key={m.id} className={m.span}>
              <article id={m.id} className="flex h-full scroll-mt-24 flex-col overflow-hidden rounded-xl border border-[var(--lp-line)] bg-[var(--lp-surface)]">
                <div className="flex items-center gap-3 border-b border-[var(--lp-line)] px-5 py-3.5">
                  <span className="flex size-8 items-center justify-center rounded-md border border-[var(--lp-line)] bg-[var(--lp-paper)] text-[var(--lp-brand)]" aria-hidden>
                    <m.icon size={17} strokeWidth={1.5} />
                  </span>
                  <p className="lp-index">{m.kick}</p>
                </div>
                <div className="grid flex-1 gap-3 p-5 md:grid-cols-2 md:items-center md:gap-5">
                  <div>
                    <h3 className="lp-h3 text-[1.4rem]">{m.t}</h3>
                    <p className="lp-body mt-2 text-[0.95rem]">{m.b}</p>
                  </div>
                  <div className="min-h-[190px] overflow-hidden rounded-lg border border-[var(--lp-line)] bg-[var(--lp-paper)]">{m.v}</div>
                </div>
              </article>
            </StaggerItem>
          ))}
          <StaggerItem className="lg:col-span-12">
            <article className="grid overflow-hidden rounded-xl bg-[var(--lp-brand)] text-[var(--lp-night-fg)] lg:grid-cols-2">
              <div className="flex flex-col justify-center p-7 sm:p-9">
                <p className="lp-index" style={{ color: "var(--lp-night-muted)" }}>
                  <ChartColumn size={14} strokeWidth={1.5} className="mr-2 inline" aria-hidden />
                  Reporting · Night audit
                </p>
                <h3 className="lp-h3 mt-4 text-[clamp(1.5rem,1.2rem+1.6vw,2.1rem)]" style={{ color: "var(--lp-night-fg)" }}>
                  The numbers build themselves while your team works.
                </h3>
                <p className="lp-body mt-3 text-[0.95rem]" style={{ color: "var(--lp-night-muted)" }}>
                  Occupancy, ADR, RevPAR and revenue — closed nightly and locked against edits.
                </p>
                <div className="mt-6">
                  <Link href="/onboarding" className="lp-btn lp-btn--paper">See your own numbers<span className="lp-arrow" aria-hidden>→</span></Link>
                </div>
              </div>
              <div className="border-t border-[var(--lp-night-line)] bg-[var(--lp-night-raised)] lg:border-l lg:border-t-0">
                <ReportMini />
              </div>
            </article>
          </StaggerItem>
        </Stagger>
      </div>
    </section>
  );
}
