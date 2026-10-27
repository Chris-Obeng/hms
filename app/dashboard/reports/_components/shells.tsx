"use client";

import type { CSSProperties, ReactNode } from "react";
import { Button, Skeleton } from "@heroui/react";
import { cn } from "@/lib/utils";

export function EmptyState({ text, hint = "Try another date range." }: { text: string; hint?: string }) {
  return <div role="status" className="px-4 py-10 text-center">
    <p className="text-sm text-foreground">{text}</p>
    <p className="mt-1 text-caption text-muted-foreground">{hint}</p>
  </div>;
}

export function UnavailableState({ text }: { text: string }) {
  return <div role="status" className="px-4 py-10 text-center">
    <p className="text-sm font-medium text-foreground">Data unavailable</p>
    <p className="mx-auto mt-1 max-w-md text-caption text-muted-foreground">{text}</p>
  </div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div role="alert" className="card-default mx-auto max-w-lg space-y-3 p-6 text-center">
    <div><h2 className="text-section">Report could not be loaded</h2><p className="mt-1 text-body text-muted-foreground">{message}</p></div>
    <Button variant="outline" onPress={onRetry} className="min-h-10">Try again</Button>
  </div>;
}

/** Right-aligned figures, one hairline per row, no header band. Scrolls inside its own box on narrow screens. */
export function TableShell({ head, caption, className, children }: { head: string[]; caption: string; className?: string; children: ReactNode }) {
  return <div className={cn("w-full overflow-x-auto overscroll-x-contain", className)} role="region" aria-label={caption} tabIndex={0}>
    <table className="w-full border-collapse text-[13px]">
      <caption className="sr-only">{caption}</caption>
      <thead><tr>{head.map((heading, index) => <th key={heading} scope="col"
        className={cn("whitespace-nowrap border-b border-border/60 px-4 pb-2 text-label font-medium text-muted-foreground", index === 0 ? "text-left" : "text-right")}>{heading}</th>)}</tr></thead>
      <tbody className="[&>tr:not(:last-child)>*]:border-b [&>tr:not(:last-child)>*]:border-border/40">{children}</tbody>
    </table>
  </div>;
}

/** The real block keeps its frame and height while figures arrive: no shimmer, no layout jump. */
export function TabSkeleton() {
  return <div role="status" aria-label="Loading report" className="space-y-4">
    <span className="sr-only">Loading report…</span>
    {/* Same two-up/three-up/five-up track as StatStrip, so the strip does not reflow when data lands. */}
    <div className="card-default grid grid-cols-2 divide-y divide-border/60 shadow-none sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0 lg:divide-x" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((item) => <div key={item} className="px-4 py-4">
        <Skeleton animationType="none" className="h-3 w-20 rounded" />
        <Skeleton animationType="none" className="mt-2.5 h-6 w-28 rounded" />
        <Skeleton animationType="none" className="mt-2 h-3 w-16 rounded" />
      </div>)}
    </div>
    <Skeleton animationType="none" className="h-[264px] rounded-xl" aria-hidden="true" />
  </div>;
}

export const tooltipStyle: CSSProperties = {
  fontSize: 12.5, lineHeight: 1.5, background: "var(--popover)", color: "var(--popover-foreground)",
  border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", boxShadow: "0 8px 24px oklch(0 0 0 / 0.08)",
};
