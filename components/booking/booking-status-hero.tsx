import * as React from "react";

export type BookingStatusTone = "success" | "warning" | "danger" | "info";

const TONE_CLASS: Record<BookingStatusTone, string> = {
  success: "bg-[#17C964]/15 text-[#17C964]",
  warning: "bg-[#F5A524]/15 text-[#F5A524]",
  danger: "bg-[#FF383C]/12 text-[#FF383C]",
  info: "bg-[#0485F7]/12 text-[#0485F7]",
};

interface BookingStatusHeroProps {
  tone: BookingStatusTone;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  /** Announce changes to screen readers; set where the status updates live. */
  live?: boolean;
}

/** Icon, headline and one line of context at the top of the confirmation page. */
export function BookingStatusHero({ tone, icon, title, subtitle, live }: BookingStatusHeroProps) {
  return (
    <div className="flex flex-col items-center text-center gap-3">
      <div
        aria-hidden
        className={`flex size-12 md:size-14 items-center justify-center rounded-full ${TONE_CLASS[tone]}`}
      >
        {icon}
      </div>
      <div className="space-y-1" role={live ? "status" : undefined}>
        <h1 className="text-2xl md:text-[28px] font-semibold tracking-[-0.4px] text-[#18181B] leading-tight">
          {title}
        </h1>
        <p className="text-xs md:text-sm text-[#71717A]">{subtitle}</p>
      </div>
    </div>
  );
}
