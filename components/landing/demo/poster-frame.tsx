/*
 * Static stand-in for the demo's first frame. Rendered server-side so the
 * hero visual costs zero JS and zero media bytes; replaced by the Remotion
 * player once the visitor starts playback.
 */
export function PosterFrame() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0a0f0d]">
      <div
        className="w-[520px] max-w-[92%] overflow-hidden rounded-[20px] border border-ivory/[0.09] bg-[#101512]/60 shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
        aria-hidden="true"
      >
        <div className="flex h-11 items-center justify-between border-b border-ivory/[0.07] px-4">
          <span className="flex gap-1.5">
            <i className="size-2.5 rounded-full bg-red-500/45" />
            <i className="size-2.5 rounded-full bg-yellow-500/45" />
            <i className="size-2.5 rounded-full bg-green-500/45" />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ivory/35">
            RoomLine · New booking
          </span>
          <span className="w-10" />
        </div>
        <div className="p-6">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 items-center justify-center rounded-xl bg-gold/[0.14] text-base font-bold text-[#e5c158]">
              KW
            </span>
            <div>
              <p className="text-[16px] font-bold text-ivory">Kwabena Mensah</p>
              <p className="text-xs text-ivory/50">Booked online · Ashanti Suites, Kumasi</p>
            </div>
            <span className="ml-auto rounded-full border border-emerald-400/35 px-2.5 py-1 text-[10px] font-bold text-emerald-400">
              NEW
            </span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2.5 text-left">
            {[
              ["Room", "Deluxe 204"],
              ["Nights", "2 · Aug 24–26"],
              ["Total", "GHS 1,548"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-ivory/[0.08] p-2.5">
                <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-ivory/40">
                  {label}
                </p>
                <p
                  className={`mt-0.5 text-[13px] font-bold tabular-nums ${
                    label === "Total" ? "text-[#e5c158]" : "text-ivory"
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
