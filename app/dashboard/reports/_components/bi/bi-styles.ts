/**
 * Shared surface and type styles for the Reports page. They match
 * the Rooms and Rates cards: one quiet border, a hairline shadow, 16px padding
 * on phones and 24px from `sm`, and a 16/24 title over a 12/16 caption.
 */
export const BI_CARD =
  "min-w-0 gap-4 rounded-3xl border border-border/60 p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:p-6";
export const BI_CARD_HEADER = "flex flex-wrap items-start justify-between gap-x-6 gap-y-2";
export const BI_CARD_TITLE = "text-md font-semibold leading-6 text-foreground";
export const BI_CARD_DESCRIPTION = "mt-1 text-xs leading-4 text-muted-foreground";
/** Axis ticks: quiet, small and tabular. */
export const BI_AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 11 } as const;
