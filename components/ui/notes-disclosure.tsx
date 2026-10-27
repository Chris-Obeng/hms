"use client";

import { ChevronRight } from "lucide-react";

/** Methodology lives here: visible on demand, out of the way of the figures. */
export function NotesDisclosure({ title = "How these figures work", items }: { title?: string; items: string[] }) {
  if (items.length === 0) return null;
  return <details className="group rounded-xl border border-border/60 bg-muted/30">
    <summary className="flex min-h-11 cursor-pointer select-none items-center gap-1.5 rounded-xl px-4 text-[13px] font-medium text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
      <ChevronRight className="size-3.5 shrink-0 transition-transform duration-150 group-open:rotate-90" aria-hidden="true" />
      {title}
    </summary>
    <ul className="space-y-2 px-4 pb-4 pl-9 text-[12.5px] leading-relaxed text-muted-foreground">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  </details>;
}
