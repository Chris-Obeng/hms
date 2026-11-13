"use client";

/**
 * audit-log-client.tsx
 *
 * Audit trail as a day-grouped legal record, matching the design in
 * pencil-audit-log.pen:
 *
 * - A toolbar (search + category filter) that lives inside the panel card on
 *   desktop and floats above it on phones — one DOM tree, the card chrome
 *   swaps via responsive classes.
 * - Entries grouped under sticky-free day bands ("Sunday, 8 November 2026"),
 *   each row an append-only record: actor, verb, booking reference, and a
 *   mono meta line (see lib/audit-format.ts).
 * - Numbered pagination with an exact page count from the server action.
 * - The three designed states: loading skeletons, empty search, load failed.
 */

import * as React from "react";
import type { Selection } from "@heroui/react";
import { Dropdown, Separator, Skeleton, Spinner } from "@heroui/react";
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleX,
  FileClock,
  Funnel,
  Search,
  SearchX,
} from "lucide-react";

import { fetchAuditLogEntries } from "@/app/actions/audit-log";
import {
  AUDIT_CATEGORIES,
  AUDIT_PAGE_SIZE,
  auditMeta,
  auditSummary,
  auditTime,
  groupRowsByUtcDay,
  isAuditCategoryId,
  type AuditCategoryId,
  type AuditLogRow,
} from "@/lib/audit-format";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

// ── Entry row ──────────────────────────────────────────────────────────

function AuditEntryRow({ row, isLast }: { row: AuditLogRow; isLast: boolean }) {
  const { actor, verb, ref } = auditSummary(row);
  const meta = auditMeta(row);
  const time = auditTime(row.created_at);

  return (
    <li
      className={cn(
        "flex items-start gap-3 px-4 py-3 sm:px-6 sm:py-[12px]",
        !isLast && "border-b border-border"
      )}
    >
      <time className="hidden w-11 shrink-0 pt-[2px] text-right font-mono text-xs font-medium tabular-nums text-foreground sm:block">
        {time}
      </time>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[4px]">
          <span className="shrink-0 text-xs font-semibold text-foreground sm:text-sm">
            {actor}
          </span>
          <span className="min-w-0 truncate text-xs text-foreground sm:text-sm">
            {verb}
          </span>
          {ref && (
            <span className="hidden shrink-0 font-mono text-xs font-medium text-foreground sm:inline">
              {ref}
            </span>
          )}
          <span className="flex-1" />
          <time className="shrink-0 font-mono text-2xs font-medium tabular-nums text-foreground sm:hidden">
            {time}
          </time>
        </div>
        {(ref || meta) && (
          <p className="mt-[4px] truncate font-mono text-2xs text-muted-foreground sm:mt-1 sm:text-xs">
            {/* Phones move the reference here — on a 390px row the long
                numeric codes would crowd the verb off the first line. */}
            {ref && (
              <span className="font-medium text-foreground sm:hidden">
                {ref}
                {meta ? " · " : ""}
              </span>
            )}
            {meta}
          </p>
        )}
      </div>
    </li>
  );
}

// ── Day group ──────────────────────────────────────────────────────────

function DayGroup({
  date,
  entries,
  isLastGroup,
}: {
  date: string;
  entries: AuditLogRow[];
  isLastGroup: boolean;
}) {
  return (
    <section>
      <div className="flex h-[36px] items-center gap-2 bg-muted px-4 sm:h-10 sm:px-4">
        <span className="text-xs font-semibold text-foreground sm:text-sm">
          {formatDate(date, "EEEE, d MMMM yyyy", date)}
        </span>
        <span className="flex-1" />
        <span className="font-mono text-2xs font-medium text-foreground/60 sm:text-2xs">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
      </div>
      <ul>
        {entries.map((row, i) => (
          <AuditEntryRow key={row.id} row={row} isLast={isLastGroup && i === entries.length - 1} />
        ))}
      </ul>
    </section>
  );
}

// ── States ─────────────────────────────────────────────────────────────

/** Shimmer placeholders for the whole page, per the "Loading" state design. */
function LoadingState({ page }: { page: number }) {
  return (
    <div aria-live="polite" aria-busy="true">
      <div className="flex h-[36px] items-center justify-between gap-2 bg-muted px-4 sm:h-10 sm:px-4">
        <Skeleton className="h-[12px] w-40 rounded-md bg-foreground/15" />
        <Skeleton className="h-3 w-24 rounded bg-foreground/15" />
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-6 sm:py-[12px]"
        >
          <Skeleton className="hidden h-3 w-9 rounded sm:block" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-[252px] max-w-full rounded-md" />
            <Skeleton className="h-3 w-[332px] max-w-full rounded" />
          </div>
        </div>
      ))}
      <div className="flex items-center justify-center gap-2 px-6 py-3">
        <Spinner size="sm" className="text-primary" />
        <span className="text-xs text-muted-foreground">Loading page {page}…</span>
      </div>
    </div>
  );
}

function EmptyState({
  title,
  caption,
  icon,
}: {
  title: React.ReactNode;
  caption: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 sm:py-16">
      <div className="flex size-11 items-center justify-center rounded-2xl bg-secondary">
        {icon}
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}

function ErrorBand({ page, onRetry }: { page: number; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 border-t border-border px-6 pb-6 pt-6">
      <div className="flex items-center gap-2">
        <CircleAlert className="size-[16px] shrink-0 text-destructive" aria-hidden />
        <p className="text-xs font-medium text-destructive">
          Couldn&apos;t load page {page}. Check your connection and try again.
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="flex h-8 items-center rounded-full bg-secondary px-4 text-sm font-medium text-primary transition-colors hover:bg-secondary/70"
      >
        Try again
      </button>
    </div>
  );
}

// ── Pagination ─────────────────────────────────────────────────────────

/** 1…count when short; otherwise first/last + current±1 with gaps. */
function pagerItems(current: number, count: number): (number | "gap")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const wanted = new Set(
    [1, count, current - 1, current, current + 1].filter((p) => p >= 1 && p <= count)
  );
  const items: (number | "gap")[] = [];
  let prev = 0;
  for (const p of [...wanted].sort((a, b) => a - b)) {
    if (p - prev > 1) items.push("gap");
    items.push(p);
    prev = p;
  }
  return items;
}

function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  return (
    <nav
      aria-label="Audit log pages"
      className="flex items-center justify-center gap-2 border-t border-border px-4 pb-4 pt-4 sm:gap-2 sm:px-6 sm:pb-[16px] sm:pt-4"
    >
      <button
        type="button"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="flex h-8 w-8 items-center justify-center gap-2 rounded-full text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:text-muted-foreground/50 sm:h-10 sm:w-auto sm:px-3 sm:text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        <span className="hidden lg:inline">Previous</span>
      </button>

      {pagerItems(page, pageCount).map((item, i) =>
        item === "gap" ? (
          <span key={`gap-${i}`} aria-hidden className="px-1 text-sm text-muted-foreground">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            aria-current={item === page ? "page" : undefined}
            aria-label={`Page ${item}`}
            onClick={() => onChange(item)}
            className={cn(
              "flex size-8 items-center justify-center rounded-full text-sm font-medium transition-colors sm:size-10 sm:text-sm",
              item === page
                ? "bg-secondary text-secondary-foreground"
                : "text-foreground hover:bg-muted"
            )}
          >
            {item}
          </button>
        )
      )}

      <button
        type="button"
        aria-label="Next page"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
        className="flex h-8 w-8 items-center justify-center gap-2 rounded-full text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:text-muted-foreground/50 sm:h-10 sm:w-auto sm:px-3 sm:text-sm"
      >
        <span className="hidden lg:inline">Next</span>
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </nav>
  );
}

// ── Toolbar ────────────────────────────────────────────────────────────

function Toolbar({
  input,
  onInputChange,
  onClear,
  category,
  onCategoryChange,
  counts,
}: {
  input: string;
  onInputChange: (value: string) => void;
  onClear: () => void;
  category: AuditCategoryId;
  onCategoryChange: (id: AuditCategoryId) => void;
  counts: Record<AuditCategoryId, number | null>;
}) {
  function handleSelection(keys: Selection) {
    const key = keys === "all" ? null : [...keys][0];
    if (!key) return; // ignore deselect of the active filter
    onCategoryChange(String(key) as AuditCategoryId);
  }

  return (
    <div className="mb-4 flex items-center gap-2 lg:mb-0 lg:border-b lg:border-border lg:px-6 lg:py-4">
      <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl bg-card px-3 shadow-sm lg:w-[360px] lg:flex-none">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          type="text"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="Search actions, staff, or references"
          aria-label="Search audit log"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        {input && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={onClear}
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            <CircleX className="size-4" aria-hidden />
          </button>
        )}
      </div>

      <Dropdown>
        <Dropdown.Trigger
          className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card shadow-sm transition-colors hover:bg-muted/50 lg:w-auto lg:gap-2 lg:border lg:border-border lg:bg-transparent lg:px-4 lg:shadow-none"
          aria-label="Filter by action"
        >
          <Funnel className="size-4 text-foreground" aria-hidden />
          <span className="hidden text-sm font-medium text-foreground lg:inline">Filters</span>
        </Dropdown.Trigger>
        <Dropdown.Popover placement="bottom end" className="w-[260px] rounded-3xl p-1 shadow-lg">
          <Dropdown.Menu
            aria-label="Filter by action"
            selectionMode="single"
            selectedKeys={new Set([category])}
            onSelectionChange={handleSelection}
          >
            <Dropdown.Item id="all" textValue="All actions" className="h-10 rounded-2xl px-3">
              <Dropdown.ItemIndicator />
              <span className="text-sm text-foreground">All actions</span>
              <span className="flex-1" />
              {counts.all !== null && (
                <span className="font-mono text-xs text-foreground/60">{counts.all}</span>
              )}
            </Dropdown.Item>
            <Separator className="mx-2 my-1" />
            {AUDIT_CATEGORIES.filter((c) => c.id !== "all").map((c) => (
              <Dropdown.Item
                key={c.id}
                id={c.id}
                textValue={c.label}
                className="h-10 rounded-2xl px-3"
              >
                <Dropdown.ItemIndicator />
                <span className="text-sm text-foreground">{c.label}</span>
                <span className="flex-1" />
                {counts[c.id] !== null && (
                  <span className="font-mono text-xs text-muted-foreground">{counts[c.id]}</span>
                )}
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────

/** One page/filter request; `null` means "whatever the server rendered". */
interface AuditRequest {
  page: number;
  category: AuditCategoryId;
  query: string;
}

export function AuditLogClient({
  initialRows,
  initialTotal,
}: {
  initialRows: AuditLogRow[];
  initialTotal: number;
}) {
  // `request` is what the user asked for, `loaded` is the last answer that
  // came back. Before the first request the server-rendered props are the
  // truth, so the first paint never refetches page 1.
  const [request, setRequest] = React.useState<AuditRequest | null>(null);
  const [loaded, setLoaded] = React.useState<{
    page: number;
    rows: AuditLogRow[];
    total: number;
  } | null>(null);
  const [input, setInput] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  // Set when a request fails; the pager then keeps pointing at the rows that
  // are still on screen (and "Try again" retries this page).
  const [errorPage, setErrorPage] = React.useState<number | null>(null);
  // Bumped so an identical request (retry, re-click) still re-runs.
  const [reloadKey, setReloadKey] = React.useState(0);

  const panelRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!request) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setErrorPage(null);
      const res = await fetchAuditLogEntries(request);
      if (cancelled) return;
      if (res.success) {
        setLoaded({ page: request.page, rows: res.page.rows, total: res.page.total });
      } else {
        setErrorPage(request.page);
      }
      setIsLoading(false);
      if (request.page > 1) {
        panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [request, reloadKey]);

  // Debounce the search box into a committed request, skipping the initial
  // empty mount so SSR page 1 is never refetched automatically.
  React.useEffect(() => {
    const nextQuery = input.trim();
    if (!request && nextQuery === "") return;
    if (request && nextQuery === request.query) return;
    const t = window.setTimeout(() => {
      setRequest((prev) => ({ page: 1, category: prev?.category ?? "all", query: nextQuery }));
    }, 300);
    return () => window.clearTimeout(t);
  }, [input, request]);

  const category = request?.category ?? "all";
  const query = request?.query ?? "";
  const page = loaded?.page ?? 1;
  const rows = loaded?.rows ?? initialRows;
  const total = loaded?.total ?? initialTotal;

  function changeCategory(next: AuditCategoryId) {
    setRequest({ page: 1, category: next, query });
  }

  /** Pagination and retry both land here, so a repeat click still refetches. */
  function goToPage(next: number) {
    setRequest({ page: next, category, query });
    setReloadKey((k) => k + 1);
  }

  const days = React.useMemo(() => groupRowsByUtcDay(rows), [rows]);

  // Exact filter counts: only show per-bucket tallies when they are exact
  // (either all matching rows fit on page 1, or for the currently active bucket).
  const counts = React.useMemo(() => {
    const completeWindow = category === "all" && total <= rows.length;
    const tally = Object.fromEntries(
      AUDIT_CATEGORIES.map((c) => [c.id, completeWindow ? 0 : null])
    ) as Record<AuditCategoryId, number | null>;

    if (completeWindow) {
      for (const row of rows) {
        const bucket = isAuditCategoryId(row.category) ? row.category : "settings";
        tally[bucket] = (tally[bucket] ?? 0) + 1;
      }
      tally.all = total;
    } else {
      tally.all = category === "all" ? total : query === "" ? initialTotal : null;
      if (category !== "all") {
        tally[category] = total;
      }
    }
    return tally;
  }, [rows, category, total, query, initialTotal]);

  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const showEmptySearch = !isLoading && rows.length === 0 && query !== "";

  return (
    <section
      ref={panelRef}
      className="scroll-mt-6 lg:overflow-hidden lg:rounded-3xl lg:bg-card lg:shadow-sm"
    >
      <Toolbar
        input={input}
        onInputChange={setInput}
        onClear={() => setInput("")}
        category={category}
        onCategoryChange={changeCategory}
        counts={counts}
      />

      {/* Card chrome: a full card on phones (the toolbar floats above it); on
          desktop the toolbar is the panel's first row instead. */}
      <div className="overflow-hidden rounded-3xl bg-card shadow-sm lg:rounded-none lg:bg-transparent lg:shadow-none">
        {isLoading ? (
          <LoadingState page={request?.page ?? 1} />
        ) : showEmptySearch ? (
          <EmptyState
            icon={<SearchX className="size-5 text-muted-foreground/70" aria-hidden />}
            title={<>No entries match &ldquo;{query}&rdquo;</>}
            caption={`No matches on page ${request?.page ?? 1} — try a different search term.`}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<FileClock className="size-5 text-muted-foreground/70" aria-hidden />}
            title="No activity yet"
            caption="Staff actions — bookings, payments, rate changes — will appear here, grouped by day."
          />
        ) : (
          <div>
            {days.map((day, i) => (
              <DayGroup
                key={day.date}
                date={day.date}
                entries={day.entries}
                isLastGroup={i === days.length - 1}
              />
            ))}
          </div>
        )}

        {errorPage !== null && !isLoading && (
          <ErrorBand page={errorPage} onRetry={() => goToPage(errorPage)} />
        )}

        <Pagination page={page} pageCount={pageCount} onChange={goToPage} />
      </div>
    </section>
  );
}
