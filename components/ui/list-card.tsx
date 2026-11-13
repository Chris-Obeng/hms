"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@heroui/react";

import { cn } from "@/lib/utils";


/**
 * Header-band label that sorts its column. Clicking cycles the TanStack sort
 * (asc → desc → off); the arrow only appears for the sorted column.
 */
export function SortLabel({
  label,
  sorted,
  onToggle,
  align = "start",
}: {
  label: string;
  sorted: false | "asc" | "desc";
  onToggle: ((event: unknown) => void) | undefined;
  align?: "start" | "end";
}) {
  const Icon = sorted === "desc" ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Sort by ${label.toLowerCase()}${sorted ? `, ${sorted === "asc" ? "ascending" : "descending"}` : ""}`}
      className={cn(
        "-mx-1 inline-flex items-center gap-1 rounded-md px-1 py-1 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground",
        sorted && "text-foreground",
        align === "end" && "justify-self-end"
      )}
    >
      {label}
      {sorted && <Icon className="size-3" aria-hidden="true" />}
    </button>
  );
}

/** Minimal surface of a TanStack table the pager needs. */
interface PagedTable {
  getState(): { pagination: { pageIndex: number; pageSize: number } };
  getPageCount(): number;
  getCanPreviousPage(): boolean;
  getCanNextPage(): boolean;
  previousPage(): void;
  nextPage(): void;
}

/** List footer: "1–15 of 37" and previous/next. Hidden when there is nothing to page. */
export function ListPager({ table, total, noun }: { table: PagedTable; total: number; noun: string }) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();
  if (total === 0) return null;
  const start = pageIndex * pageSize + 1;
  const end = Math.min((pageIndex + 1) * pageSize, total);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border/50 px-4 py-3 sm:px-6">
      <span className="text-xs tabular-nums text-muted-foreground">
        {pageCount > 1 ? `${start}–${end} of ${total}` : `${total} ${noun}${total === 1 ? "" : "s"}`}
      </span>
      {pageCount > 1 && (
        <div className="flex gap-2">
          <Button
            isIconOnly
            variant="secondary"
            aria-label="Previous page"
            className="rounded-xl max-md:size-11"
            isDisabled={!table.getCanPreviousPage()}
            onPress={() => table.previousPage()}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            isIconOnly
            variant="secondary"
            aria-label="Next page"
            className="rounded-xl max-md:size-11"
            isDisabled={!table.getCanNextPage()}
            onPress={() => table.nextPage()}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

/** Empty list body: icon tile, one line, optional action. */
export function ListEmpty({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 border-t border-border/50 px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
