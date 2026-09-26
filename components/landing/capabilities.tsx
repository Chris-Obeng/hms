import Link from "next/link";
import { CountUp, Reveal } from "@/components/landing/reveal";

/*
 * Four capabilities, each with room to breathe. Alternating media/word
 * rhythm — no icon grid. Media panels are code-drawn product fragments,
 * not screenshots, so they never drift from the real UI's shape.
 */

function CalendarPanel() {
  const rows = [
    { room: "101", guest: "Marcus Bennett", w: "58%", tone: "clear" },
    { room: "102", guest: "Clara Nolan", w: "74%", tone: "await" },
    { room: "201", guest: "Walk-in · cash", w: "40%", tone: "house" },
    { room: "202", guest: "James Carter", w: "52%", tone: "clear" },
  ] as const;
  const tint = {
    clear: { text: "var(--lp-brand)", bg: "var(--lp-brand-wash)", line: "var(--lp-brand-line)" },
    await: { text: "var(--lp-await)", bg: "var(--lp-await-wash)", line: "var(--lp-await-line)" },
    house: { text: "var(--lp-house)", bg: "var(--lp-house-wash)", line: "var(--lp-house-line)" },
  } as const;
  return (
    <div className="flex h-full flex-col justify-center gap-2 p-6">
      {rows.map((row) => {
        const c = tint[row.tone];
        return (
          <div key={row.room} className="flex items-center gap-2.5">
            <span className="lp-num w-8 shrink-0 text-right text-[11px] font-semibold text-[var(--lp-muted)]">{row.room}</span>
            <div className="h-9 flex-1 rounded-lg border border-dashed border-[var(--lp-line)] bg-[var(--lp-band)]">
              <div
                className="flex h-full items-center overflow-hidden whitespace-nowrap rounded-lg border px-2.5 text-[11px] font-semibold"
                style={{ width: row.w, color: c.text, backgroundColor: c.bg, borderColor: c.line }}
              >
                {row.guest}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
function PaymentPanel() {
  return (
    <div className="flex h-full flex-col justify-center gap-2.5 p-6">
      <div className="flex items-center justify-between rounded-xl border border-[var(--lp-line)] bg-[var(--lp-surface)] px-4 py-3">
        <span className="text-sm font-semibold text-[var(--lp-ink)]">Mobile Money</span>
        <span className="lp-chip lp-chip--clear">
          <span className="lp-chip__dot" />
          Paid $1,080
        </span>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-[var(--lp-line)] bg-[var(--lp-surface)] px-4 py-3">
        <span className="text-sm font-semibold text-[var(--lp-ink)]">Cash at desk</span>
        <span className="lp-index">BK-2492 · recorded</span>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-[var(--lp-line)] bg-[var(--lp-surface)] px-4 py-3">
        <span className="text-sm font-semibold text-[var(--lp-ink)]">Card · Visa</span>
        <span className="lp-chip lp-chip--clear">
          <span className="lp-chip__dot" />
          Paid $2,340
        </span>
      </div>
    </div>
  );
}

function BookingPagePanel() {
  return (
    <div className="flex h-full flex-col justify-center gap-3 p-6">
      <div className="mx-auto w-full max-w-[260px] rounded-xl border border-[var(--lp-line)] bg-[var(--lp-surface)] p-4 shadow-[var(--lp-shadow-raise)]">
        <p className="lp-h3 text-base">Meridian Hotel</p>
        <p className="mt-0.5 text-xs text-[var(--lp-muted)]">Deluxe Double · $240 / night</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <span className="lp-num rounded-lg border border-[var(--lp-line)] bg-[var(--lp-band)] px-2 py-1.5 text-[11px] font-medium text-[var(--lp-muted)]">Aug 24</span>
          <span className="lp-num rounded-lg border border-[var(--lp-line)] bg-[var(--lp-band)] px-2 py-1.5 text-[11px] font-medium text-[var(--lp-muted)]">Aug 26</span>
        </div>
        <span className="lp-btn lp-btn--solid lp-btn--sm mt-3 w-full">Book now</span>
        <p className="lp-index mt-2 text-center">SMS confirmation sent</p>
      </div>
    </div>
  );
}
function ReportsPanel() {
  return (
    <div className="flex h-full flex-col justify-center gap-4 p-6">
      <div>
        <div className="flex items-baseline justify-between">
          <span className="lp-index">Occupancy</span>
          <b className="lp-num text-sm text-[var(--lp-ink)]">
            <CountUp to={82} suffix="%" />
          </b>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full border border-[var(--lp-line)] bg-[var(--lp-band)]">
          <div className="h-full w-[82%] rounded-full bg-[var(--lp-brand)]" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-[var(--lp-line)] bg-[var(--lp-surface)] p-3">
          <p className="lp-index">ADR</p>
          <p className="lp-num mt-1 text-lg font-semibold text-[var(--lp-ink)]">$512</p>
        </div>
        <div className="rounded-xl border border-[var(--lp-line)] bg-[var(--lp-surface)] p-3">
          <p className="lp-index">Revenue</p>
          <p className="lp-num mt-1 text-lg font-semibold text-[var(--lp-brand)]">
            <CountUp to={18740} prefix="$" />
          </p>
        </div>
      </div>
    </div>
  );
}
const ITEMS = [
  {
    id: "calendar",
    kicker: "01 · Front desk",
    title: "One calendar for every room",
    body: "Drag any reservation to a new date or room — overlaps are blocked before they exist. A walk-in is checked in within seconds of reaching the desk.",
    panel: <CalendarPanel />,
  },
  {
    id: "payments",
    kicker: "02 · Money",
    title: "Mobile money, cash and card — reconciled",
    body: "Take mobile money, cards and cash — cleared to your account or recorded by hand. Every payment lands against the right folio and settles straight to your own bank.",
    panel: <PaymentPanel />,
  },
  {
    id: "booking",
    kicker: "03 · Direct",
    title: "Your own booking page",
    body: "Send guests straight to you, so the OTAs keep nothing. Every reservation fires an instant SMS confirmation the moment it lands.",
    panel: <BookingPagePanel />,
  },
  {
    id: "audit",
    kicker: "04 · Close",
    title: "Night audit in one tap",
    body: "Close the day and lock every transaction. Occupancy, ADR and revenue reports build themselves quietly while your team works.",
    panel: <ReportsPanel />,
  },
] as const;
export function Capabilities() {
  return (
    <section id="features" className="lp-section scroll-mt-24">
      <div className="lp-container">
        <Reveal className="max-w-2xl">
          <p className="lp-index">§ 03 · What it does</p>
          <h2 className="lp-h2 mt-4">Four things, done properly.</h2>
        </Reveal>

        <div className="mt-14 flex flex-col gap-20 md:mt-20 md:gap-28">
          {ITEMS.map((item, i) => (
            <Reveal key={item.id}>
              <div id={item.id} className="grid scroll-mt-24 items-center gap-8 md:grid-cols-2 md:gap-14 lg:gap-20">
                <div className={i % 2 === 1 ? "md:order-2" : undefined}>
                  <p className="lp-index">{item.kicker}</p>
                  <h3 className="lp-h3 mt-3 text-2xl md:text-[1.75rem]">{item.title}</h3>
                  <p className="lp-body mt-3 max-w-md">{item.body}</p>
                </div>
                <div className={i % 2 === 1 ? "md:order-1" : undefined}>
                  <div
                    className="lp-window aspect-[4/3] md:aspect-[5/4]"
                    style={{ boxShadow: "var(--lp-shadow-raise)" }}
                  >
                    {item.panel}
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-16 md:mt-20">
          <Link href="/onboarding" className="lp-btn lp-btn--solid">
            Set up your hotel
            <span className="lp-arrow" aria-hidden>→</span>
          </Link>
        </Reveal>
      </div>
    </section>
  );
}




