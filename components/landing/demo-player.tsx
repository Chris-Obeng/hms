/**
 * Static, code-drawn product mock — no screenshots to keep the landing page
 * fast (zero extra requests, no layout shift). Deliberately stylized rather
 * than a fake screenshot: it shows the shape of the workspace, not pixel
 * claims we can't keep current.
 */
export function DemoPlayer() {
  return (
    <div className="relative">
      {/* Glow */}
      <div
        className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-gold/10 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative rounded-2xl border border-ivory/10 bg-[#0d1411] shadow-2xl shadow-black/50 overflow-hidden">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-ivory/[0.06] px-4 py-3">
          <span className="size-2.5 rounded-full bg-ivory/15" aria-hidden="true" />
          <span className="size-2.5 rounded-full bg-ivory/15" aria-hidden="true" />
          <span className="size-2.5 rounded-full bg-ivory/15" aria-hidden="true" />
          <span className="ml-3 rounded-md bg-ivory/[0.05] px-3 py-1 text-[11px] text-ivory/35">
            app.roomline.com/dashboard
          </span>
        </div>

        <div className="grid grid-cols-[auto_1fr]">
          {/* Mini sidebar */}
          <div className="hidden sm:flex flex-col gap-1 border-r border-ivory/[0.06] p-3" aria-hidden="true">
            {[
              { label: "Calendar", active: true },
              { label: "Bookings", active: false },
              { label: "Rooms", active: false },
              { label: "Guests", active: false },
              { label: "Reports", active: false },
            ].map((item) => (
              <span
                key={item.label}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-medium ${
                  item.active ? "bg-gold/15 text-gold" : "text-ivory/30"
                }`}
              >
                <span className={`size-1.5 rounded-full ${item.active ? "bg-gold" : "bg-ivory/20"}`} />
                {item.label}
              </span>
            ))}
          </div>

          {/* Main panel */}
          <div className="p-4 sm:p-5 space-y-4">
            {/* KPI row */}
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { k: "Occupancy", v: "82%", accent: true },
                { k: "ADR", v: "₵540" },
                { k: "Arrivals", v: "12" },
              ].map((kpi) => (
                <div
                  key={kpi.k}
                  className={`rounded-xl border p-3 ${
                    kpi.accent
                      ? "border-gold/25 bg-gold/[0.07]"
                      : "border-ivory/[0.07] bg-ivory/[0.03]"
                  }`}
                >
                  <p className="text-[10px] uppercase tracking-wider text-ivory/35">{kpi.k}</p>
                  <p className={`mt-1 text-lg font-bold ${kpi.accent ? "text-gold" : "text-ivory/85"}`}>
                    {kpi.v}
                  </p>
                </div>
              ))}
            </div>

            {/* Calendar strip */}
            <div className="rounded-xl border border-ivory/[0.07] bg-ivory/[0.02] p-3" aria-hidden="true">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-ivory/60">Front desk · Today</span>
                <span className="rounded-md bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                  3 rooms free
                </span>
              </div>
              <div className="space-y-1.5">
                {[
                  { w: "72%", tone: "bg-gold/70", label: "Kofi M." },
                  { w: "45%", tone: "bg-sky-400/50", label: "Ama B." },
                  { w: "58%", tone: "bg-ivory/25", label: "Walk-in" },
                  { w: "30%", tone: "bg-emerald-400/50", label: "Yaw O." },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 truncate text-right text-[10px] text-ivory/30">
                      {row.label}
                    </span>
                    <div className="h-4 flex-1 rounded-sm bg-ivory/[0.04]">
                      <div
                        className={`h-full rounded-sm ${row.tone}`}
                        style={{ width: row.w }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment row */}
            <div className="flex items-center justify-between rounded-xl border border-ivory/[0.07] bg-ivory/[0.02] px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-lg bg-gold/15 text-xs" aria-hidden="true">
                  ₵
                </span>
                <div>
                  <p className="text-[11px] font-medium text-ivory/70">MTN Mobile Money</p>
                  <p className="text-[10px] text-ivory/30">BK-2481 · Deluxe Double · 2 nights</p>
                </div>
              </div>
              <span className="rounded-md bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                Paid ₵1,080
              </span>
            </div>
          </div>
        </div>
      </div>

      <p className="relative mt-3 text-center text-xs text-ivory/30">
        One screen for the front desk — calendar, money, guests.
      </p>
    </div>
  );
}
