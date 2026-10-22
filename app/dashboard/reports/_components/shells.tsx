"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import { Button, Skeleton } from "@heroui/react";
import { RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function SectionCard({ title, caption, action, children, className }: {
  title: string; caption?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  const id = useId();
  return <section className={cn("reports-section", className)} aria-labelledby={id}>
    <header className="reports-section-header">
      <div><h2 id={id}>{title}</h2>{caption && <p>{caption}</p>}</div>
      {action}
    </header>
    {children}
  </section>;
}

export function EmptyState({ text }: { text: string }) {
  return <div className="reports-empty" role="status"><p>{text}</p><p>Try another date range to explore activity.</p></div>;
}

export function UnavailableState({ text }: { text: string }) {
  return <div className="reports-empty" role="status"><p>Data unavailable</p><p>{text}</p></div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="reports-error" role="alert"><h2>Report could not be loaded</h2><p>{message}</p>
    <Button variant="outline" onPress={onRetry} className="reports-control"><RotateCw size={16} aria-hidden="true" />Retry report</Button>
  </div>;
}

export function TableShell({ head, caption, children }: { head: string[]; caption: string; children: ReactNode }) {
  return <div className="reports-table-scroll" role="region" aria-label={caption} tabIndex={0}>
    <table className="reports-table"><caption className="sr-only">{caption}</caption>
      <thead><tr>{head.map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>;
}

export function TabSkeleton() {
  return <div role="status" aria-label="Loading report" className="reports-loading">
    <span className="sr-only">Loading report…</span>
    <div className="reports-kpis" aria-hidden="true">{[0, 1, 2, 3].map((item) => <Skeleton key={item} animationType="none" className="h-28 rounded-lg" />)}</div>
    <Skeleton animationType="none" className="h-80 rounded-xl" aria-hidden="true" />
  </div>;
}

export const tooltipStyle: CSSProperties = {
  fontSize: 14, lineHeight: 1.5, background: "var(--popover)", color: "var(--popover-foreground)",
  border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px",
};
