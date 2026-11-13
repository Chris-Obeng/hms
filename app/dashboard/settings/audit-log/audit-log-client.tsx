"use client";

/**
 * Audit trail as a day-grouped, append-only record: a search + filter toolbar,
 * entries grouped by day, and numbered pagination with an exact page count.
 */

import * as React from "react";
import type { Selection } from "@heroui/react";
import { Alert, Button, Card, Dropdown, Label, SearchField, Separator, Skeleton } from "@heroui/react";
import { ChevronLeft, ChevronRight, FileClock, ListFilter, SearchX } from "lucide-react";

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

function AuditEntryRow({ row }: { row: AuditLogRow }) {
  const { actor, verb, ref } = auditSummary(row);
  const meta = auditMeta(row);
  const time = auditTime(row.created_at);

  return (
    <li className="flex items-start gap-4 px-4 py-3 sm:px-6">
      <time className="w-12 shrink-0 pt-px text-xs tabular-nums text-muted-foreground">{time}</time>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">
          <span className="font-semibold">{actor}</span> {verb}
          {ref && <span className="ml-1 font-mono text-xs text-muted-foreground">{ref}</span>}
        </p>
        {meta && <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{meta}</p>}
      </div>
    </li>
  );
}

// ── Day group ──────────────────────────────────────────────────────────

function DayGroup({ date, entries }: { date: string; entries: AuditLogRow[] }) {
  return (
    <section>
      <h3 className="sticky top-14 z-10 border-y border-border/50 bg-secondary/80 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur sm:px-6">
        {formatDate(date, "EEEE, d MMMM yyyy", date)}
      </h3>
      <ul className="divide-y divide-border/50">
        {entries.map((row) => (
          <AuditEntryRow key={row.id} row={row} />
        ))}
      </ul>
    </section>
  );
}

// ── States ─────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div aria-busy="true" className="divide-y divide-border/50">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4 sm:px-6">
          <Skeleton className="h-3 w-10 rounded" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-64 max-w-full rounded" />
            <Skeleton className="h-3 w-40 max-w-full rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, icon }: { title: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-muted-foreground">{icon}</span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
    </div>
  );
}

// ── Pagination ─────────────────────────────────────────────────────────

/** 1…count when short; otherwise first/last + current±1 with gaps. */
function pagerItems(current: number, count: number): (number | "gap")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const wanted = new Set([1, count, current - 1, current, current + 1].filter((p) => p >= 1 && p <= count));
  const items: (number | "gap")[] = [];
  let prev = 0;
  for (const p of [...wanted].sort((a, b) => a - b)) {
    if (p - prev > 1) items.push("gap");
    items.push(p);
    prev = p;
  }
  return items;
}

function Pagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Audit log pages" className="flex items-center justify-center gap-1 border-t border-border/50 px-4 py-3">
      <Button isIconOnly variant="ghost" aria-label="Previous page" isDisabled={page <= 1} onPress={() => onChange(page - 1)} className="rounded-lg">
        <ChevronLeft className="size-4" />
      </Button>
      {pagerItems(page, pageCount).map((item, i) =>
        item === "gap" ? (
          <span key={`gap-${i}`} aria-hidden className="w-8 text-center text-sm text-muted-foreground">
            …
          </span>
        ) : (
          <Button
            key={item}
            isIconOnly
            variant={item === page ? "secondary" : "ghost"}
            aria-current={item === page ? "page" : undefined}
            aria-label={`Page ${item}`}
            onPress={() => onChange(item)}
            className={cn("rounded-lg tabular-nums", item === page && "font-semibold")}
          >
            {item}
          </Button>
        )
      )}
      <Button isIconOnly variant="ghost" aria-label="Next page" isDisabled={page >= pageCount} onPress={() => onChange(page + 1)} className="rounded-lg">
        <ChevronRight className="size-4" />
      </Button>
    </nav>
  );
}

// ── Toolbar ────────────────────────────────────────────────────────────

function Toolbar({
  input,
  onInputChange,
  category,
  onCategoryChange,
  counts,
  total,
}: {
  input: string;
  onInputChange: (value: string) => void;
  category: AuditCategoryId;
  onCategoryChange: (id: AuditCategoryId) => void;
  counts: Record<AuditCategoryId, number | null>;
  total: number;
}) {
  function handleSelection(keys: Selection) {
    const key = keys === "all" ? null : [...keys][0];
    if (!key) return; // ignore deselect of the active filter
    onCategoryChange(String(key) as AuditCategoryId);
  }
  const activeLabel = AUDIT_CATEGORIES.find((c) => c.id === category)?.label ?? "All actions";

  return (
    <div className="flex items-center gap-2 px-4 py-4 sm:px-6">
      <SearchField aria-label="Search audit log" value={input} onChange={onInputChange} className="min-w-0 flex-1 sm:max-w-80">
        <SearchField.Group className="rounded-xl">
          <SearchField.SearchIcon />
          <SearchField.Input placeholder="Search staff, actions or references" />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>

      <Dropdown>
        <Button variant="secondary" aria-label={`Filter: ${activeLabel}`} className="shrink-0 rounded-xl max-sm:w-10 max-sm:px-0">
          <ListFilter className="size-4" />
          <span className="hidden sm:inline">{activeLabel}</span>
        </Button>
        <Dropdown.Popover placement="bottom end" className="min-w-56">
          <Dropdown.Menu
            aria-label="Filter by action"
            selectionMode="single"
            selectedKeys={new Set([category])}
            onSelectionChange={handleSelection}
          >
            {AUDIT_CATEGORIES.map((c, i) => (
              <React.Fragment key={c.id}>
                {i === 1 && <Separator className="my-1" />}
                <Dropdown.Item id={c.id} textValue={c.label}>
                  <Dropdown.ItemIndicator />
                  <Label>{c.label}</Label>
                  {counts[c.id] !== null && (
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">{counts[c.id]}</span>
                  )}
                </Dropdown.Item>
              </React.Fragment>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>

      <span className="ml-auto hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
        {total.toLocaleString("en")} {total === 1 ? "entry" : "entries"}
      </span>
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
    <section ref={panelRef} className="scroll-mt-20">
      <Card className="gap-0 overflow-hidden rounded-3xl border border-border/60 p-0 shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
        <Toolbar
          input={input}
          onInputChange={setInput}
          category={category}
          onCategoryChange={changeCategory}
          counts={counts}
          total={total}
        />

        {isLoading ? (
          <LoadingState />
        ) : showEmptySearch ? (
          <EmptyState
            icon={<SearchX className="size-5" aria-hidden />}
            title={<>No entries match &ldquo;{query}&rdquo;</>}
          />
        ) : rows.length === 0 ? (
          <EmptyState icon={<FileClock className="size-5" aria-hidden />} title="No activity yet" />
        ) : (
          <div>
            {days.map((day) => (
              <DayGroup key={day.date} date={day.date} entries={day.entries} />
            ))}
          </div>
        )}

        {errorPage !== null && !isLoading && (
          <div className="border-t border-border/50 p-4">
            <Alert status="danger" className="rounded-2xl">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Couldn&apos;t load page {errorPage}</Alert.Title>
              </Alert.Content>
              <Button size="sm" variant="secondary" className="rounded-lg" onPress={() => goToPage(errorPage)}>
                Try again
              </Button>
            </Alert>
          </div>
        )}

        <Pagination page={page} pageCount={pageCount} onChange={goToPage} />
      </Card>
    </section>
  );
}
