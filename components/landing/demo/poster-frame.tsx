/*
 * Static stand-in for the demo's first frame. Rendered server-side so the
 * hero visual costs zero JS and zero media bytes on first paint; swapped
 * for the Remotion player on the client.
 */
export function PosterFrame() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="w-[520px] max-w-[92%] overflow-hidden rounded-[18px] border border-[var(--lp-hairline)] bg-white shadow-[0_1px_2px_rgba(15,28,51,0.05),0_12px_32px_rgba(15,28,51,0.08),0_32px_64px_-16px_rgba(15,28,51,0.14)]">
        <div className="p-6">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-xl border border-[var(--lp-hairline)] bg-[var(--lp-tint)] text-base font-bold text-accent">
              KM
            </span>
            <div>
              <p className="text-[16px] font-bold text-foreground">Kwabena Mensah</p>
              <p className="text-xs text-muted">Booked online · Ashanti Suites, Kumasi</p>
            </div>
            <span className="ml-auto rounded-full bg-[#e7f6ef] px-2.5 py-1 text-[10px] font-bold text-[#0b6b49]">
              NEW
            </span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2.5 text-left">
            {[
              ["Room", "Deluxe 204"],
              ["Nights", "2 · Aug 24–26"],
              ["Total", "GHS 1,548"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-[var(--lp-hairline)] bg-[var(--lp-tint)] p-2.5">
                <p className="text-[9px] font-bold uppercase tracking-[0.09em] text-muted">
                  {label}
                </p>
                <p
                  className={`mt-0.5 text-[13px] font-bold tabular-nums ${
                    label === "Total" ? "text-accent" : "text-foreground"
                  }`}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
