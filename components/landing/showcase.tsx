import { Reveal } from "@/components/landing/reveal";

type Block = {
  room: string;
  type: string;
  start: number;
  span: number;
  guest: string;
  note: string;
  tone: "paid" | "confirmed" | "walkin";
};

const DAYS = ["Mon 24", "Tue 25", "Wed 26", "Thu 27", "Fri 28", "Sat 29", "Sun 30"] as const;

const ROWS: Block[] = [
  { room: "101", type: "Standard", start: 1, span: 3, guest: "Ama Owusu", note: "Paid · MoMo", tone: "paid" },
  { room: "102", type: "Deluxe", start: 3, span: 4, guest: "Kwabena Mensah", note: "Confirmed · SMS sent", tone: "confirmed" },
  { room: "201", type: "Suite", start: 5, span: 2, guest: "Walk-in", note: "Cash at desk", tone: "walkin" },
  { room: "202", type: "Deluxe", start: 2, span: 2, guest: "Efua Boateng", note: "Paid · Card", tone: "paid" },
];

const TONES = {
  paid: { bg: "#e7f6ef", border: "#bfe5d6", text: "#0e8a5f" },
  confirmed: { bg: "#edf0fc", border: "#c9d2f4", text: "#3b4fd8" },
  walkin: { bg: "#f6f8fc", border: "#dfe6f1", text: "#5a6a85" },
} as const;

export function Showcase() {
  return (
    <section className="lp-section">
      <div className="lp-container">
        <Reveal className="max-w-2xl">
          <p className="lp-eyebrow">The front desk, on one screen</p>
          <h2 className="lp-title mt-3">
            Watch a booking land, hold its room, and get paid
          </h2>
          <p className="lp-body mt-4 max-w-xl">
            A Booking.com reservation arrives for Deluxe 204 and appears on the
            calendar by itself. The front desk confirms an MTN Mobile Money
            payment, and the room flips to confirmed before the guest reaches
            the counter.
          </p>
        </Reveal>

        <Reveal className="mt-12 md:mt-14">
          <div className="lp-frame">
            <div className="lp-frame__bar">
              <span className="lp-frame__dot" />
              <span className="lp-frame__dot" />
              <span className="lp-frame__dot" />
              <span className="lp-frame__url">app.roomline.com/dashboard/calendar</span>
            </div>

            {/* Week board */}
            <div className="overflow-x-auto p-4 sm:p-6" role="img" aria-label="RoomLine front-desk calendar showing one August week across four rooms">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-[72px_repeat(7,1fr)] gap-x-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted sm:text-xs">
                  <span />
                  {DAYS.map((d) => (
                    <span key={d} className="pb-3 text-center">{d}</span>
                  ))}
                </div>

                <div className="flex flex-col gap-2">
                  {ROWS.map((row) => (
                    <div key={row.room} className="grid grid-cols-[72px_repeat(7,1fr)] items-center gap-x-1.5">
                      <span className="truncate text-xs text-muted">
                        <b className="font-semibold text-foreground">{row.room}</b>{" "}
                        <span className="hidden lg:inline">{row.type}</span>
                      </span>
                      {Array.from({ length: 7 }, (_, cell) => {
                        const day = cell + 1;
                        const active = day >= row.start && day < row.start + row.span;
                        if (!active) {
                          return (
                            <span
                              key={cell}
                              className="h-10 rounded-lg border border-dashed border-[var(--lp-hairline)] bg-[var(--lp-tint)]"
                            />
                          );
                        }
                        const first = day === row.start;
                        const tone = TONES[row.tone];
                        return (
                          <span
                            key={cell}
                            className="flex h-10 items-center overflow-hidden whitespace-nowrap rounded-lg px-2 text-[11px] font-semibold"
                            style={{
                              backgroundColor: tone.bg,
                              border: `1px solid ${tone.border}`,
                              color: tone.text,
                            }}
                          >
                            {first ? (
                              <span className="truncate">
                                {row.guest}
                                <span className="ml-1 hidden font-medium opacity-70 xl:inline">· {row.note}</span>
                              </span>
                            ) : null}
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--lp-hairline)] px-4 py-3.5 sm:px-6">
              {[
                ["#0b6b49", "#e7f6ef", "Paid"],
                ["#3b4fd8", "#edf0fc", "Confirmed"],
                ["#5a6a85", "#f6f8fc", "Walk-in · cash"],
              ].map(([dot, chipBg, label]) => (
                <span key={label} className="flex items-center gap-2">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: dot }}
                    aria-hidden="true"
                  />
                  <span
                    className="rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                    style={{ backgroundColor: chipBg }}
                  >
                    {label}
                  </span>
                </span>
              ))}
              <span className="lp-micro ml-auto hidden md:block">
                Overlaps are blocked before they exist.
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
