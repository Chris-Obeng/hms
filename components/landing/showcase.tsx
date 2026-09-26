import { MaskLines, Reveal } from "@/components/landing/reveal";

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
  { room: "101", type: "Standard", start: 1, span: 3, guest: "Marcus Bennett", note: "Paid · Mobile Money", tone: "paid" },
  { room: "102", type: "Deluxe", start: 3, span: 4, guest: "Clara Nolan", note: "Confirmed · SMS sent", tone: "confirmed" },
  { room: "201", type: "Suite", start: 5, span: 2, guest: "Walk-in", note: "Cash at desk", tone: "walkin" },
  { room: "202", type: "Deluxe", start: 2, span: 2, guest: "James Carter", note: "Paid · Card", tone: "paid" },
];

// Signal tokens only — a booking's colour is its money state, never decoration.
const TONES = {
  paid: { bg: "var(--lp-brand-wash)", border: "var(--lp-brand-line)", text: "var(--lp-brand)" },
  confirmed: { bg: "var(--lp-await-wash)", border: "var(--lp-await-line)", text: "var(--lp-await)" },
  walkin: { bg: "var(--lp-house-wash)", border: "var(--lp-house-line)", text: "var(--lp-house)" },
} as const;

const LEGEND = [
  { variant: "clear", label: "Paid" },
  { variant: "await", label: "Confirmed" },
  { variant: "house", label: "Walk-in · cash" },
] as const;

export function Showcase() {
  return (
    <section id="showcase" className="lp-section scroll-mt-24">
      <div className="lp-container">
        <Reveal className="max-w-2xl">
          <p className="lp-index">§ 02 · The board</p>
          <h2 className="lp-h2 mt-4">
            <MaskLines lines={["Every room, every night,", "on one honest board."]} />
          </h2>
          <p className="lp-body mt-5 max-w-xl">
            A reservation lands, holds its room, and turns evergreen the moment
            the payment clears — so anyone at the desk can read the week at a
            glance and no room is ever sold twice.
          </p>
        </Reveal>

        <Reveal className="mt-12 md:mt-14">
          <div className="lp-window">
            <div className="lp-window__bar">
              <span className="lp-window__path">
                app.roomline.com/calendar
              </span>
              <span className="lp-window__end">
                <span className="lp-chip lp-chip--clear">
                  <span className="lp-chip__dot" />
                  Live
                </span>
              </span>
            </div>

            {/* Week board */}
            <div
              className="overflow-x-auto p-4 sm:p-6"
              role="img"
              aria-label="RoomLine front-desk calendar showing one week across four rooms"
            >
              <div className="min-w-[640px]">
                <div className="grid grid-cols-[76px_repeat(7,1fr)] gap-x-1.5">
                  <span />
                  {DAYS.map((d) => (
                    <span key={d} className="lp-index pb-3 text-center">
                      {d}
                    </span>
                  ))}
                </div>

                <div className="flex flex-col gap-2">
                  {ROWS.map((row) => (
                    <div key={row.room} className="grid grid-cols-[76px_repeat(7,1fr)] items-center gap-x-1.5">
                      <span className="truncate text-xs text-[var(--lp-muted)]">
                        <b className="lp-num font-semibold text-[var(--lp-ink)]">{row.room}</b>{" "}
                        <span className="hidden lg:inline">{row.type}</span>
                      </span>
                      {Array.from({ length: 7 }, (_, cell) => {
                        const day = cell + 1;
                        const active = day >= row.start && day < row.start + row.span;
                        if (!active) {
                          return (
                            <span
                              key={cell}
                              className="h-10 rounded-lg border border-dashed border-[var(--lp-line)] bg-[var(--lp-band)]"
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
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--lp-line)] px-4 py-3.5 sm:px-6">
              {LEGEND.map((item) => (
                <span key={item.label} className={`lp-chip lp-chip--${item.variant}`}>
                  <span className="lp-chip__dot" />
                  {item.label}
                </span>
              ))}
              <span className="lp-index ml-auto hidden md:block">
                Overlaps blocked before they exist
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
