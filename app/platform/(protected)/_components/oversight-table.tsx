"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  Pagination,
  Table,
  Tooltip,
} from "@heroui/react";
import { RotateCw, Search, ExternalLink, X } from "lucide-react";
import { formatCurrencyCompact, formatDate } from "@/lib/format";
import { HOTEL_STATUSES, type CurrencyTotal, type HotelRow } from "./types";
import { StatusChip } from "./status-chip";

// ── Money cell ───────────────────────────────────────────────────
/** Primary currency amount; extra currencies shown as a muted "+X" suffix. */
function MoneyCell({ totals }: { totals: CurrencyTotal[] }) {
  if (totals.length === 0) {
    return <span className="text-muted-foreground tabular-nums">0</span>;
  }
  const primary = totals[0];
  const restSum = totals.slice(1).reduce((s, t) => s + t.amount, 0);
  return (
    <span className="tabular-nums whitespace-nowrap">
      {formatCurrencyCompact(primary.amount, primary.currency)}
      {restSum > 0 && totals.length > 1 && (
        <span className="text-muted-foreground text-xs">
          {" "}+{formatCurrencyCompact(restSum, totals[1].currency)}
        </span>
      )}
    </span>
  );
}

// ── Occupancy ────────────────────────────────────────────────────

function OccupancyCell({ row }: { row: HotelRow }) {
  if (row.totalRooms == null || row.totalRooms === 0) return <span>—</span>;
  const pct = Math.round(((row.occupiedToday ?? 0) / row.totalRooms) * 100);
  return (
    <Tooltip>
      <Tooltip.Trigger>
        <span tabIndex={0} className="inline-flex items-center gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="hidden xl:block h-2 w-14 rounded-full bg-muted overflow-hidden" aria-hidden>
            <span
              className="block h-full rounded-full bg-foreground/70"
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </span>
          <span className="tabular-nums">
            {pct}%
            <span className="text-muted-foreground text-xs">
              {" "}· {row.occupiedToday}/{row.totalRooms}
            </span>
          </span>
        </span>
      </Tooltip.Trigger>
      <Tooltip.Content>Rooms occupied now vs sellable rooms</Tooltip.Content>
    </Tooltip>
  );
}

// ── URL helpers ──────────────────────────────────────────────────

function buildUrl(q: string, status: string | null, page: number): string {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (status) params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/platform?${qs}` : "/platform";
}

// ── Main component ───────────────────────────────────────────────

export interface OversightTableProps {
  rows: HotelRow[];
  total: number;
  page: number;
  pageSize: number;
  q: string;
  status: string | null;
  error?: string;
}

export function OversightTable({
  rows,
  total,
  page,
  pageSize,
  q,
  status,
  error,
}: OversightTableProps) {
  const router = useRouter();
  const [searchDraft, setSearchDraft] = React.useState(q);
  const isPending = React.useTransition()[0];

  // Debounced sync of the search draft into the URL (server refetch).
  React.useEffect(() => {
    const current = searchDraft.trim();
    if (current === q) return;
    const t = setTimeout(() => {
      router.replace(buildUrl(current, status, 1), { scroll: false });
    }, 350);
    return () => clearTimeout(t);
  }, [searchDraft, q, status, router]);

  function setStatus(next: string | null) {
    router.replace(buildUrl(searchDraft, next, 1), { scroll: false });
  }

  function goToPage(next: number) {
    router.replace(buildUrl(searchDraft, status, next), { scroll: false });
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = Boolean(q.trim() || status);

  // ── Error state ──
  if (error) {
    return (
      <div className="card-default py-14 flex flex-col items-center gap-3 text-center px-6">
        <p className="text-body text-foreground font-medium">
          Could not load hotels
        </p>
        <p className="text-caption text-muted-foreground max-w-sm">{error}</p>
        <Button variant="outline" size="sm" onPress={() => router.refresh()} className="mt-1 gap-2 min-h-11">
          <RotateCw className="size-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <section aria-label="Hotels" className={"space-y-3 transition-opacity" + (isPending ? " opacity-60" : "")}>
        {/* Controls */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" aria-hidden />
            <Input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search name or city…"
              aria-label="Search hotels by name or city"
              className="pl-9 pr-8 min-h-11"
            />
            {searchDraft && (
              <button
                type="button"
                onClick={() => setSearchDraft("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
            <FilterChip label="All" isActive={!status} onPress={() => setStatus(null)} />
            {HOTEL_STATUSES.map((s) => (
              <FilterChip
                key={s}
                label={
                  s === "active"
                    ? "Active"
                    : s.charAt(0).toUpperCase() + s.slice(1)
                }
                isActive={status === s}
                onPress={() => setStatus(status === s ? null : s)}
              />
            ))}
          </div>

          <p className="text-caption text-muted-foreground tabular-nums sm:ml-auto shrink-0">
            {total.toLocaleString()} hotel{total !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block card-default overflow-hidden">
          <Table variant="secondary" className="rounded-none">
            <Table.ScrollContainer>
              <Table.Content aria-label="Hotels overview">
                <Table.Header>
                  <Table.Column isRowHeader>Hotel</Table.Column>
                  <Table.Column>Status</Table.Column>
                  <Table.Column>Occupancy today</Table.Column>
                  <Table.Column>GMV · 30 days</Table.Column>
                  <Table.Column>Outstanding</Table.Column>
                  <Table.Column>Created</Table.Column>
                  <Table.Column><span className="sr-only">Open booking page</span></Table.Column>
                </Table.Header>
                <Table.Body
                  items={rows}
                  renderEmptyState={() => <EmptyState filtered={hasFilters} />}
                >
                  {(row) => (
                    <Table.Row id={row.id} className="relative hover:bg-muted/30 transition-colors">
                      <Table.Cell>
                        <RowLink row={row} />
                      </Table.Cell>
                      <Table.Cell><StatusChip status={row.status} /></Table.Cell>
                      <Table.Cell><OccupancyCell row={row} /></Table.Cell>
                      <Table.Cell>
                        <MoneyCell totals={row.gmv} />
                      </Table.Cell>
                      <Table.Cell>
                        <span className={row.outstanding.some((t) => t.amount > 0) ? "text-warning" : "text-muted-foreground"}>
                          <MoneyCell totals={row.outstanding} />
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                          {formatDate(row.created_at, "dd MMM yyyy")}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <ExternalLinkCell row={row} />
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden space-y-2">
          {rows.length === 0 ? (
            <div className="card-default">
              <EmptyState filtered={hasFilters} />
            </div>
          ) : (
            rows.map((row) => (
              <Link
                key={row.id}
                href={`/platform/hotels/${row.id}`}
                className="block w-full text-left card-default p-4 space-y-3 outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">{row.name}</p>
                    <p className="text-caption text-muted-foreground truncate mt-1">
                      {[row.city, row.country].filter(Boolean).join(", ") || row.slug}
                    </p>
                  </div>
                  <StatusChip status={row.status} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">GMV 30d</p>
                    <p className="font-medium tabular-nums mt-1">
                      <MoneyCell totals={row.gmv} />
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Outstanding</p>
                    <p className={"font-medium tabular-nums mt-1" + (row.outstanding.some((t) => t.amount > 0) ? " text-warning" : "")}>
                      <MoneyCell totals={row.outstanding} />
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Occ. today</p>
                    <p className="font-medium tabular-nums mt-1">
                      {row.totalRooms ? `${Math.round(((row.occupiedToday ?? 0) / row.totalRooms) * 100)}%` : "—"}
                    </p>
                  </div>
                </div>
                <p className="text-2xs text-muted-foreground tabular-nums">
                  Created {formatDate(row.created_at, "dd MMM yyyy")}
                </p>
              </Link>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination className="justify-between gap-4">
            <Pagination.Summary className="text-caption text-muted-foreground tabular-nums order-2 sm:order-1">
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString()}
            </Pagination.Summary>
            <Pagination.Content className="order-1 sm:order-2">
              <Pagination.Item>
                <Pagination.Previous
                  onPress={() => goToPage(page - 1)}
                  isDisabled={page <= 1}
                  aria-label="Previous page"
                  className="min-h-11"
                >
                  <Pagination.PreviousIcon />
                </Pagination.Previous>
              </Pagination.Item>
              <Pagination.Item>
                <Pagination.Link
                  isActive={true}
                  aria-label={`Page ${page} of ${totalPages}`}
                  aria-current="page"
                  className="min-h-11 min-w-11"
                >
                  {page}
                </Pagination.Link>
              </Pagination.Item>
              {totalPages > 1 && (
                <Pagination.Item>
                  <span className="text-xs text-muted-foreground px-1 tabular-nums">of {totalPages}</span>
                </Pagination.Item>
              )}
              <Pagination.Item>
                <Pagination.Next
                  onPress={() => goToPage(page + 1)}
                  isDisabled={page >= totalPages}
                  aria-label="Next page"
                  className="min-h-11"
                >
                  <Pagination.NextIcon />
                </Pagination.Next>
              </Pagination.Item>
            </Pagination.Content>
          </Pagination>
        )}
      </section>
  );
}

// ── Bits ─────────────────────────────────────────────────────────

function FilterChip({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      size="sm"
      variant={isActive ? "primary" : "outline"}
      onPress={onPress}
      aria-pressed={isActive}
      className="min-h-11 rounded-lg capitalize text-xs sm:text-sm"
    >
      {label}
    </Button>
  );
}

/** Whole-row activation: a Link stretched over the row via ::after. */
function RowLink({ row }: { row: HotelRow }) {
  return (
    <Link
      href={`/platform/hotels/${row.id}`}
      className="text-left after:absolute after:inset-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring group"
    >
      <span className="font-medium text-foreground group-hover:text-accent transition-colors">
        {row.name}
      </span>
      <span className="block text-2xs text-muted-foreground mt-1">
        {[row.city, row.country].filter(Boolean).join(", ") || "—"}
      </span>
    </Link>
  );
}

function ExternalLinkCell({ row }: { row: HotelRow }) {
  return (
    <span className="relative z-10 inline-flex" onClick={(e) => e.stopPropagation()}>
      <Tooltip>
        <Tooltip.Trigger>
          <a
            href={`/${row.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${row.name} booking page in new tab`}
            className="inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ExternalLink className="size-4" />
          </a>
        </Tooltip.Trigger>
        <Tooltip.Content>Open booking page</Tooltip.Content>
      </Tooltip>
    </span>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="py-14 px-6 text-center space-y-2">
      <p className="text-body text-foreground font-medium">
        {filtered ? "No hotels match" : "No hotels yet"}
      </p>
      <p className="text-caption text-muted-foreground max-w-sm mx-auto">
        {filtered
          ? "Try a different search term or clear the status filter."
          : "New properties appear here once their owners complete onboarding."}
      </p>
    </div>
  );
}
