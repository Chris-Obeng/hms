import Link from "next/link";
import { Reveal } from "@/components/landing/reveal";

/*
 * Four capabilities, each with room to breathe. Alternating media/word
 * rhythm — no icon grid. Media panels are code-drawn product fragments,
 * not screenshots, so they never drift from the real UI's shape.
 */

function CalendarPanel() {
  return (
    <div className="flex h-full flex-col justify-center gap-2 p-6">
      {[
        { room: "101", guest: "Ama Owusu", w: "58%", tone: "#0b6b49", bg: "#e7f6ef" },
        { room: "102", guest: "Kwabena M.", w: "74%", tone: "#3b4fd8", bg: "#edf0fc" },
        { room: "201", guest: "Walk-in · cash", w: "40%", tone: "#5a6a85", bg: "#f6f8fc" },
        { room: "202", guest: "Efua Boateng", w: "52%", tone: "#0b6b49", bg: "#e7f6ef" },
      ].map((row) => (
        <div key={row.room} className="flex items-center gap-2.5">
          <span className="w-8 shrink-0 text-right text-[11px] font-semibold text-muted">{row.room}</span>
          <div className="h-9 flex-1 rounded-lg border border-dashed border-[var(--lp-hairline)] bg-[var(--lp-tint)]">
            <div
              className="flex h-full items-center overflow-hidden whitespace-nowrap rounded-lg border px-2.5 text-[11px] font-semibold"
              style={{ width: row.w, color: row.tone, backgroundColor: row.bg, borderColor: "transparent" }}
            >
              {row.guest}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PaymentPanel() {
  return (
    <div className="flex h-full flex-col justify-center gap-2.5 p-6">
      <div className="flex items-center justify-between rounded-xl border border-[var(--lp-hairline)] bg-white px-4 py-3">
        <span className="text-sm font-semibold text-foreground">MTN Mobile Money</span>
        <span className="rounded-md bg-[#e7f6ef] px-2 py-1 text-xs font-bold text-[#0b6b49]">Paid ₵1,080</span>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-[var(--lp-hairline)] bg-white px-4 py-3">
        <span className="text-sm font-semibold text-foreground">Cash at desk</span>
        <span className="text-xs font-medium text-muted">BK-2492 · recorded</span>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-[var(--lp-hairline)] bg-white px-4 py-3">
        <span className="text-sm font-semibold text-foreground">VISA · Paystack</span>
        <span className="rounded-md bg-[#e7f6ef] px-2 py-1 text-xs font-bold text-[#0b6b49]">Paid ₵2,340</span>
      </div>
    </div>
  );
}

function BookingPagePanel() {
  return (
    <div className="flex h-full flex-col justify-center gap-3 p-6">
      <div className="mx-auto w-full max-w-[260px] rounded-xl border border-[var(--lp-hairline)] bg-white p-4 shadow-[var(--lp-media-shadow)]">
        <p className="text-sm font-bold tracking-tight text-foreground">Ashanti Suites</p>
        <p className="mt-0.5 text-xs text-muted">Deluxe Double · ₵540 / night</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <span className="rounded-lg border border-[var(--lp-hairline)] bg-[var(--lp-tint)] px-2 py-1.5 text-[11px] font-medium text-muted">Aug 24</span>
          <span className="rounded-lg border border-[var(--lp-hairline)] bg-[var(--lp-tint)] px-2 py-1.5 text-[11px] font-medium text-muted">Aug 26</span>
        </div>
        <span className="button button--primary mt-3 block rounded-lg py-2 text-center text-xs font-semibold">
          Book now
        </span>
        <p className="mt-2 text-center text-[10px] text-muted">SMS confirmation sent instantly</p>
      </div>
    </div>
  );
}

function ReportsPanel() {
  return (
    <div className="flex h-full flex-col justify-center gap-4 p-6">
      <div>
        <div className="flex items-baseline justify-between text-xs text-muted">
          <span>Occupancy</span>
          <b className="font-tabular text-sm text-foreground">82%</b>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full border border-[var(--lp-hairline)] bg-[var(--lp-tint)]">
          <div className="h-full w-[82%] rounded-full bg-accent" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-[var(--lp-hairline)] bg-white p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-muted">ADR</p>
          <p className="font-tabular mt-1 text-lg font-bold text-foreground">GHS 512</p>
        </div>
        <div className="rounded-xl border border-[var(--lp-hairline)] bg-white p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-muted">Revenue</p>
          <p className="font-tabular mt-1 text-lg font-bold text-accent">GHS 18,740</p>
        </div>
      </div>
    </div>
  );
}

const ITEMS = [
  {
    title: "Front-desk calendar",
    body: "Drag any reservation to a new date or room — overlaps are blocked before they exist. A walk-in guest is checked in within seconds of reaching your desk.",
    panel: <CalendarPanel />,
    id: "calendar",
  },
  {
    title: "Payments & mobile money",
    body: "Accept MTN Mobile Money, Telecel Cash, AirtelTigo, cards and cash — all reconciled through Paystack or recorded by hand. Funds settle straight into your own bank account in cedis.",
    panel: <PaymentPanel />,
    id: "payments",
  },
  {
    title: "Direct booking page",
    body: "Your own booking page sends guests straight to you, so Booking.com keeps nothing. Every reservation fires an instant SMS confirmation the moment it lands.",
    panel: <BookingPagePanel />,
    id: "booking",
  },
  {
    title: "Night audit & reports",
    body: "Tap once to close the day and lock every transaction. Occupancy, ADR and revenue reports build themselves quietly while your team works.",
    panel: <ReportsPanel />,
    id: "audit",
  },
] as const;

export function Capabilities() {
  return (
    <section id="features" className="lp-section lp-section--tint scroll-mt-16">
      <div className="lp-container">
        <Reveal className="max-w-2xl">
          <p className="lp-eyebrow">Features</p>
          <h2 className="lp-title mt-3">Four things, done properly</h2>
        </Reveal>

        <div className="mt-12 flex flex-col gap-16 md:mt-16 md:gap-24">
          {ITEMS.map((item, i) => (
            <Reveal key={item.id}>
              <div className="grid items-center gap-8 md:grid-cols-2 md:gap-14 lg:gap-20">
                <div className={i % 2 === 1 ? "md:order-2" : undefined}>
                  <h3 className="lp-feature-title">{item.title}</h3>
                  <p className="lp-body mt-3 max-w-md">{item.body}</p>
                </div>
                <div className={i % 2 === 1 ? "md:order-1" : undefined}>
                  <div className="rounded-2xl border border-[var(--lp-hairline)] bg-[var(--surface)] shadow-[var(--lp-media-shadow)]">
                    {item.panel}
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-16 md:mt-20">
          <Link
            href="/onboarding"
            className="button button--secondary inline-flex h-11 items-center rounded-lg px-6 text-[15px] font-semibold"
          >
            Set up your hotel
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
