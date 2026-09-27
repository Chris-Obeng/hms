"use client";

import { Pagination } from "@heroui/react";

/**
 * Minimal surface of the TanStack Table instance that the pagination
 * controls need. Keeps the component decoupled from Table generics.
 */
interface PaginatedTableInstance {
  getState(): { pagination: { pageIndex: number; pageSize: number } };
  getPageCount(): number;
  getCanPreviousPage(): boolean;
  getCanNextPage(): boolean;
  previousPage(): void;
  nextPage(): void;
  setPageIndex(index: number): void;
}

function getPageNumbers(page: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | "ellipsis")[] = [1];
  if (page > 3) pages.push("ellipsis");

  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  if (page < totalPages - 2) pages.push("ellipsis");
  pages.push(totalPages);
  return pages;
}

/**
 * HeroUI pagination footer bound to a TanStack Table instance.
 * Render inside `<Table>` so it sits in the table footer slot.
 */
export function HeroTablePagination({
  table,
  totalRows,
  filteredRows,
  showSummary = true,
}: {
  table: PaginatedTableInstance;
  /** Rows before filtering — used for the summary label. */
  totalRows: number;
  filteredRows: number;
  /** Hide the "N–M of T" range label; page controls still render. */
  showSummary?: boolean;
}) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const pageCount = table.getPageCount();

  const start = filteredRows === 0 ? 0 : pageIndex * pageSize + 1;
  const end = Math.min((pageIndex + 1) * pageSize, filteredRows);

  const summary =
    filteredRows === 0
      ? "No results"
      : filteredRows !== totalRows
        ? `${start}–${end} of ${filteredRows} (filtered from ${totalRows})`
        : `${start}–${end} of ${filteredRows}`;

  if (pageCount <= 1) {
    if (!showSummary) return null;
    return (
      <div className="flex w-full justify-center sm:justify-start">
        <p className="text-caption text-muted-foreground">{summary}</p>
      </div>
    );
  }

  const controls = (
    <Pagination size="sm">
      <Pagination.Content>
        <Pagination.Item>
          <Pagination.Previous
            isDisabled={!table.getCanPreviousPage()}
            onPress={() => table.previousPage()}
            aria-label="Previous page"
          >
            <Pagination.PreviousIcon />
          </Pagination.Previous>
        </Pagination.Item>
        {getPageNumbers(pageIndex + 1, pageCount).map((p, i) =>
          p === "ellipsis" ? (
            <Pagination.Item key={`ellipsis-${i}`}>
              <Pagination.Ellipsis />
            </Pagination.Item>
          ) : (
            <Pagination.Item key={p}>
              <Pagination.Link
                isActive={p === pageIndex + 1}
                onPress={() => table.setPageIndex(p - 1)}
                aria-label={`Page ${p}`}
              >
                {p}
              </Pagination.Link>
            </Pagination.Item>
          )
        )}
        <Pagination.Item>
          <Pagination.Next
            isDisabled={!table.getCanNextPage()}
            onPress={() => table.nextPage()}
            aria-label="Next page"
          >
            <Pagination.NextIcon />
          </Pagination.Next>
        </Pagination.Item>
      </Pagination.Content>
    </Pagination>
  );

  // Count hidden: page controls alone, right-aligned on desktop.
  if (!showSummary) {
    return <div className="flex w-full justify-center sm:justify-end">{controls}</div>;
  }

  return (
    <div className="flex w-full flex-col-reverse items-center gap-3 sm:flex-row sm:justify-between">
      <p className="text-caption text-muted-foreground">{summary}</p>
      {controls}
    </div>
  );
}
