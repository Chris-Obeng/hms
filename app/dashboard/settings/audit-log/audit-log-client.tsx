"use client";

/**
 * audit-log-client.tsx
 *
 * Day-segmented audit trail with infinite scroll.
 *
 * - Entries arrive pre-grouped into UTC-day buckets (see lib/audit-feed.ts).
 * - Each day is a collapsible Disclosure section; the newest day starts open.
 * - An IntersectionObserver sentinel near the bottom loads the next day
 *   window via the `fetchAuditLogDays` server action as the user scrolls.
 * - Search filters only the days that have loaded so far — the caption under
 *   the toolbar says so, so nobody mistakes it for a global search.
 */

import * as React from "react";
import { FileClock, Search } from "lucide-react";
import { Button, Chip, Disclosure, DisclosureGroup, Skeleton, Spinner } from "@heroui/react";

import { fetchAuditLogDays } from "@/app/actions/audit-log";
import type { AuditDayGroup, AuditLogRow } from "@/lib/audit-feed";
import { formatDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ChipColor = "success" | "danger" | "warning" | "accent" | "default";

/** Semantic color by action outcome — dark-mode safe via HeroUI soft variants. */
function actionColor(action: string): ChipColor {
  if (/(cancelled|deactivated|refunded|rejected)/.test(action)) return "danger";
  if (/(created|approved|reactivated|confirmed)/.test(action)) return "success";
  if (/(role_changed|block_created|settings_updated|configured|completed)/.test(action)) return "warning";
  if (/(checked_in|checked_out|recorded|notes_updated|status_changed|move|room_type_change)/.test(action)) return "accent";
  return "default";
}

function ActionBadge({ action }: { action: string }) {
  const label = action.replace(".", " · ").replace(/_/g, " ");
  return (
    <Chip size="sm" variant="soft" color={actionColor(action)} className="whitespace-nowrap">
      <Chip.Label>{label}</Chip.Label>
    </Chip>
  );
}

function stateSnippet(state: unknown): string {
  if (!state || typeof state !== "object" || Array.isArray(state)) return "";
  const entries = Object.entries(state as Record<string, unknown>).slice(0, 3);
  return entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(" · ");
}

/** Append newly fetched days, merging a day split across the page boundary. */
function mergeDays(prev: AuditDayGroup[], next: AuditDayGroup[]): AuditDayGroup[] {
  if (next.length === 0) return prev;
  const seen = new Set(prev.flatMap((d) => d.entries.map((e) => e.id)));
  const merged = prev.map((d) => ({ ...d, entries: [...d.entries] }));
  for (const day of next) {
    const fresh = day.entries.filter((e) => !seen.has(e.id));
    if (fresh.length === 0) continue;
    fresh.forEach((e) => seen.add(e.id));
    const last = merged[merged.length - 1];
    if (last && last.date === day.date) {
      last.entries.push(...fresh);
    } else {
      merged.push({ date: day.date, entries: fresh });
    }
  }
  return merged;
}

function matchesSearch(log: AuditLogRow, q: string): boolean {
  return (
    log.action.toLowerCase().includes(q) ||
    (log.staff_name ?? "").toLowerCase().includes(q) ||
    (log.entity_type ?? "").toLowerCase().includes(q) ||
    JSON.stringify(log.after_state ?? {}).toLowerCase().includes(q)
  );
}

/** "Tuesday, 22 September 2026" — date-only strings never shift across timezones. */
function dayTitle(date: string): string {
  return formatDate(date, "EEEE, d MMMM yyyy", date);
}

/** One entry row — flex layout (no table) so it reflows cleanly on phones. */
function AuditEntryRow({ log }: { log: AuditLogRow }) {
  const snippet = stateSnippet(log.after_state);
  return (
    <li className="flex gap-3 px-4 py-3 transition-colors hover:bg-muted/20 sm:px-5">
      <span className="w-10 shrink-0 pt-1 text-caption tabular-nums text-muted-foreground">
        {formatDate(log.created_at, "HH:mm", "")}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <ActionBadge action={log.action} />
          <span className="max-w-40 truncate text-xs font-medium text-foreground">
            {log.staff_name ?? <span className="text-muted-foreground">System</span>}
          </span>
          {log.entity_type && (
            <span className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-caption text-muted-foreground">
              {log.entity_type}
            </span>
          )}
        </div>
        {snippet && (
          <p className="mt-1 truncate font-mono text-caption text-muted-foreground/80">{snippet}</p>
        )}
      </div>
    </li>
  );
}

/** Day-shaped shimmer placeholder shown while the next window loads. */
function DaySkeleton() {
  return (
    <div aria-hidden className="card-default px-4 py-4 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-44 rounded-md" />
          <Skeleton className="h-3 w-20 rounded-md" />
        </div>
        <Skeleton className="h-4 w-4 rounded-full" />
      </div>
    </div>
  );
}

export function AuditLogClient({
  initialDays,
  initialCursor,
  initialHasMore,
}: {
  initialDays: AuditDayGroup[];
  initialCursor: string | null;
  initialHasMore: boolean;
}) {
  const [days, setDays] = React.useState<AuditDayGroup[]>(initialDays);
  const [cursor, setCursor] = React.useState<string | null>(initialCursor);
  const [hasMore, setHasMore] = React.useState(initialHasMore);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  // Relative labels ("Today") depend on the client's clock — gate on mount.
  const [mounted, setMounted] = React.useState(false);
  // Newest day starts open; the rest stay collapsed until tapped.
  const [expandedKeys, setExpandedKeys] = React.useState<Set<string>>(
    () => new Set<string>(initialDays.length > 0 ? [initialDays[0].date] : [])
  );

  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  // Refs mirror state so loadMore stays referentially stable for the observer.
  const cursorRef = React.useRef(cursor);
  const hasMoreRef = React.useRef(hasMore);
  const isLoadingRef = React.useRef(isLoading);
  cursorRef.current = cursor;
  hasMoreRef.current = hasMore;
  isLoadingRef.current = isLoading;

  React.useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(t);
  }, []);

  const loadMore = React.useCallback(async () => {
    if (isLoadingRef.current || !hasMoreRef.current) return;
    isLoadingRef.current = true;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchAuditLogDays(cursorRef.current);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setDays((prev) => mergeDays(prev, res.page.days));
      setCursor(res.page.nextCursor);
      setHasMore(res.page.hasMore);
    } catch {
      setError("Couldn't load older entries. Check your connection and try again.");
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, []);

  // Infinite scroll: the sentinel sits just below the last day card; when it
  // nears the viewport we fetch the next window. rootMargin pre-loads before
  // the user actually hits the bottom, so scrolling feels continuous.
  React.useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, hasMore, error]);

  const query = search.trim().toLowerCase();
  const visibleDays = React.useMemo(() => {
    if (!query) return days;
    return days
      .map((d) => ({ ...d, entries: d.entries.filter((e) => matchesSearch(e, query)) }))
      .filter((d) => d.entries.length > 0);
  }, [days, query]);

  // While searching, expand every day that still has matches.
  React.useEffect(() => {
    if (query) setExpandedKeys(new Set<string>(visibleDays.map((d) => d.date)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const loadedCount = React.useMemo(
    () => days.reduce((sum, d) => sum + d.entries.length, 0),
    [days]
  );

  const todayKey = mounted ? new Date().toISOString().slice(0, 10) : null;
  const yesterdayKey = mounted
    ? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : null;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search loaded entries…"
          className="h-10 w-full rounded-xl pl-9"
          aria-label="Search audit log"
        />
      </div>

      {days.length === 0 && !isLoading ? (
        /* Empty state — hotel has no audit entries yet */
        <div className="card-default flex flex-col items-center justify-center px-6 py-14 text-center">
          <div className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-muted/40">
            <FileClock className="size-5 text-muted-foreground/60" />
          </div>
          <h2 className="text-section text-foreground">No activity yet</h2>
          <p className="mt-1 max-w-xs text-caption text-muted-foreground">
            Staff actions — bookings, payments, rate changes — will appear here, grouped by day.
          </p>
        </div>
      ) : visibleDays.length === 0 ? (
        <div className="card-default px-6 py-10 text-center">
          <p className="text-xs text-muted-foreground">
            No matches in the {loadedCount} loaded entries — keep scrolling to search older days.
          </p>
        </div>
      ) : (
        <DisclosureGroup
          allowsMultipleExpanded
          expandedKeys={expandedKeys}
          onExpandedChange={(keys) => setExpandedKeys(new Set<string>(Array.from(keys, String)))}
          className="space-y-3"
        >
          {visibleDays.map((day) => {
            const relLabel =
              day.date === todayKey ? "Today" : day.date === yesterdayKey ? "Yesterday" : null;
            return (
              <Disclosure key={day.date} id={day.date} className="card-default overflow-hidden">
                <Disclosure.Heading>
                  <Disclosure.Trigger
                    className={cn(
                      "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                      "hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      "sm:px-5"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-section text-foreground">
                          {dayTitle(day.date)}
                        </span>
                        {relLabel && (
                          <Chip size="sm" variant="soft" color="accent" className="shrink-0">
                            <Chip.Label>{relLabel}</Chip.Label>
                          </Chip>
                        )}
                      </div>
                      <span className="mt-0.5 block text-caption text-muted-foreground">
                        {day.entries.length} {day.entries.length === 1 ? "entry" : "entries"}
                      </span>
                    </div>
                    <Disclosure.Indicator className="shrink-0 text-muted-foreground/70" />
                  </Disclosure.Trigger>
                </Disclosure.Heading>
                <Disclosure.Content>
                  <Disclosure.Body className="border-t border-border/40 p-0">
                    <ul className="divide-y divide-border/40">
                      {day.entries.map((log) => (
                        <AuditEntryRow key={log.id} log={log} />
                      ))}
                    </ul>
                  </Disclosure.Body>
                </Disclosure.Content>
              </Disclosure>
            );
          })}
        </DisclosureGroup>
      )}

      {/* Infinite-scroll sentinel + load states */}
      {hasMore && !error && <div ref={sentinelRef} className="h-px w-full" aria-hidden />}

      {isLoading && (
        <div className="space-y-3">
          <DaySkeleton />
          <div className="flex items-center justify-center gap-2 py-1 text-muted-foreground">
            <Spinner size="sm" color="current" />
            <span className="text-caption">Loading older days…</span>
          </div>
        </div>
      )}

      {error && (
        <div className="card-default flex flex-col items-center gap-3 px-6 py-8 text-center">
          <p className="text-xs text-danger">{error}</p>
          <Button size="sm" variant="secondary" onPress={() => void loadMore()}>
            Try again
          </Button>
        </div>
      )}

      <p className="text-caption text-muted-foreground/70">
        {hasMore
          ? `${loadedCount} entries loaded — scroll for older days.`
          : loadedCount > 0
            ? `Beginning of the audit trail — ${loadedCount} ${loadedCount === 1 ? "entry" : "entries"} total.`
            : ""}{" "}
        Audit logs are append-only and cannot be modified.
      </p>
    </div>
  );
}

