import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PenColumn {
  label: string;
  /** Widths come from the design file: fill columns use "1fr", fixed ones a px string. */
  width: string;
  align?: "left" | "right";
}

/**
 * The pen design-file table recipe: a secondary-surface block holding white rows
 * with bottom hairlines. One CSS grid per row keeps columns aligned across
 * the head, body and footer. The block scrolls horizontally when narrow.
 */
export function PenTable({ caption, columns, footer, className, children }: {
  caption: string;
  columns: PenColumn[];
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const template = columns.map((column) => column.width).join(" ");
  return <div className={cn("rounded-[20px] bg-secondary p-1 pt-0", className)} role="region" aria-label={caption} tabIndex={0}>
    <div className="min-w-[520px] overflow-x-auto">
      <div className="grid border-b border-border/70" style={{ gridTemplateColumns: template }} role="row">
        {columns.map((column) => <span key={column.label} role="columnheader"
          className={cn("flex items-center px-4 py-3 min-w-0 text-xs font-medium text-muted-foreground",
            column.align === "right" && "justify-end text-right")}>{column.label}</span>)}
      </div>
      <div>{children}</div>
      {footer && <div className="px-4 py-3">{footer}</div>}
    </div>
  </div>;
}

/** One body row; children are the cell contents in column order. */
export function PenTableRow({ columns, className, children }: {
  columns: PenColumn[];
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("grid border-b border-border/50 bg-card last:border-b-0", className)}
    style={{ gridTemplateColumns: columns.map((column) => column.width).join(" ") }}>
    {children}
  </div>;
}

export function PenTableCell({ column, className, children }: { column: PenColumn; className?: string; children?: ReactNode }) {
  return <div className={cn("flex items-center px-4 py-3 min-w-0",
    column.align === "right" ? "justify-end text-right" : "text-left", className)}>
    {children}
  </div>;
}
