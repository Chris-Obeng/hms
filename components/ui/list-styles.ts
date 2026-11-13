// Shared class strings for list cards. Plain module so server components
// (route loading states) can import them too.

/** Card surface for list pages: toolbar, header band and rows share one card. */
export const LIST_CARD =
  "gap-0 overflow-hidden rounded-3xl border border-border/60 p-0 shadow-[0_1px_2px_rgb(15_23_42/0.04)]";

/** Column header band; the list's grid template decides the breakpoint it appears at. */
export const LIST_HEADER =
  "hidden border-t border-border/50 bg-secondary/40 px-6 py-2 text-2xs font-medium text-muted-foreground";

/** Rows container: hairline dividers under the toolbar or header band. */
export const LIST_ROWS = "divide-y divide-border/50 border-t border-border/50";
