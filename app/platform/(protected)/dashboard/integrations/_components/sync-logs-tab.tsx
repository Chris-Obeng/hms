"use client";

import * as React from "react";
import {
  Activity,
  RefreshCw,
  Download,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  X,
} from "lucide-react";
import {
  Card,
  Button,
  Table,
  Chip,
  Spinner,
  Select,
  Input,
} from "@heroui/react";
import { toast } from "@heroui/react";
import type { SyncLog, ChannelStats, SyncLogFilters } from "@/types/platform-integrations";
import { getSyncLogsForHotel, exportSyncLogsForHotel } from "../_actions";

interface SyncLogsTabProps {
  hotelId: string;
  logs: SyncLog[];
  stats: ChannelStats | null;
  onRefresh: () => Promise<void>;
}

/**
 * SyncLogsTab Component
 * 
 * Displays sync logs with filtering, search, and export capabilities.
 * Shows detailed error messages and sync statistics.
 */
export function SyncLogsTab({
  hotelId,
  logs: initialLogs,
  stats,
  onRefresh,
}: SyncLogsTabProps) {
  // ── State ───────────────────────────────────────────────────
  const [logs, setLogs] = React.useState<SyncLog[]>(initialLogs);
  const [expandedLogId, setExpandedLogId] = React.useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [showFilters, setShowFilters] = React.useState(false);

  // Filter state
  const [directionFilter, setDirectionFilter] = React.useState<string>("");
  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [eventTypeFilter, setEventTypeFilter] = React.useState<string>("");
  const [searchTerm, setSearchTerm] = React.useState("");

  // Update logs when prop changes
  React.useEffect(() => {
    setLogs(initialLogs);
  }, [initialLogs]);

  // ── Handlers ────────────────────────────────────────────────

  async function handleRefresh() {
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
    toast.success("Sync logs refreshed");
  }

  async function handleExport() {
    setIsExporting(true);

    const filters: SyncLogFilters = {
      hotelId,
      direction: directionFilter as "inbound" | "outbound" | undefined,
      status: statusFilter as "success" | "error" | undefined,
      eventType: eventTypeFilter || undefined,
      limit: 1000, // Export more than display limit
    };

    const result = await exportSyncLogsForHotel(filters);
    setIsExporting(false);

    if (result.success && result.data) {
      // Download CSV
      const blob = new Blob([result.data], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sync-logs-${hotelId}-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success("Sync logs exported successfully");
    } else {
      toast.error(result.error ?? "Export failed");
    }
  }

  async function handleApplyFilters() {
    setIsRefreshing(true);

    const filters: SyncLogFilters = {
      hotelId,
      direction: directionFilter as "inbound" | "outbound" | undefined,
      status: statusFilter as "success" | "error" | undefined,
      eventType: eventTypeFilter || undefined,
      limit: 50,
    };

    const result = await getSyncLogsForHotel(filters);
    setIsRefreshing(false);

    if (result.success) {
      setLogs(result.data ?? []);
      toast.success(`Found ${result.data?.length ?? 0} matching logs`);
    } else {
      toast.error(result.error);
    }
  }

  function handleClearFilters() {
    setDirectionFilter("");
    setStatusFilter("");
    setEventTypeFilter("");
    setSearchTerm("");
    setLogs(initialLogs);
  }

  // ── Filtered logs ───────────────────────────────────────────
  const filteredLogs = logs.filter((log) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      log.eventType?.toLowerCase().includes(term) ||
      log.errorMessage?.toLowerCase().includes(term) ||
      log.beds24BookingId?.toLowerCase().includes(term) ||
      log.bookingId?.toLowerCase().includes(term)
    );
  });

  // ── Render ──────────────────────────────────────────────────

  const hasActiveFilters = directionFilter || statusFilter || eventTypeFilter;

  return (
    <div className="space-y-4">
      {/* ── Stats Overview ────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            label="Success Rate"
            value={`${stats.successRate}%`}
            sub={`${stats.successCount}/${stats.total}`}
            color={stats.successRate >= 90 ? "success" : "warning"}
          />
          <StatCard
            label="Last 24h"
            value={stats.last24h}
            sub="sync events"
            color="default"
          />
          <StatCard
            label="Errors"
            value={stats.errorCount}
            sub={stats.errorCount === 0 ? "All clear" : "needs attention"}
            color={stats.errorCount === 0 ? "success" : "danger"}
          />
        </div>
      )}

      {/* ── Logs Card ─────────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <div className="flex items-center justify-between w-full flex-wrap gap-2">
            <div>
              <Card.Title>Sync Event Logs</Card.Title>
              <p className="text-sm text-foreground/70 mt-0.5">
                {filteredLogs.length} event{filteredLogs.length === 1 ? "" : "s"}{" "}
                {hasActiveFilters && "(filtered)"}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onPress={() => setShowFilters(!showFilters)}
                startContent={<Filter className="size-3.5" />}
              >
                Filters
                {hasActiveFilters && (
                  <Chip color="primary" variant="soft" size="sm" className="ml-1">
                    {[directionFilter, statusFilter, eventTypeFilter].filter(Boolean).length}
                  </Chip>
                )}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                isPending={isExporting}
                onPress={handleExport}
                startContent={
                  isExporting ? (
                    <Spinner size="sm" color="current" />
                  ) : (
                    <Download className="size-3.5" />
                  )
                }
              >
                Export CSV
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                isPending={isRefreshing}
                onPress={handleRefresh}
                isIconOnly
                aria-label="Refresh logs"
              >
                {isRefreshing ? (
                  <Spinner size="sm" color="current" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
              </Button>
            </div>
          </div>
        </Card.Header>

        {/* ── Filters Panel ─────────────────────────────────────── */}
        {showFilters && (
          <div className="px-4 py-3 border-b border-border bg-muted/30 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Select
                label="Direction"
                placeholder="All directions"
                selectedKeys={directionFilter ? [directionFilter] : []}
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0];
                  setDirectionFilter(selected ? String(selected) : "");
                }}
                size="sm"
                variant="bordered"
              >
                <Select.Item key="inbound" textValue="Inbound">
                  Inbound (from Bed24)
                </Select.Item>
                <Select.Item key="outbound" textValue="Outbound">
                  Outbound (to Bed24)
                </Select.Item>
              </Select>

              <Select
                label="Status"
                placeholder="All statuses"
                selectedKeys={statusFilter ? [statusFilter] : []}
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0];
                  setStatusFilter(selected ? String(selected) : "");
                }}
                size="sm"
                variant="bordered"
              >
                <Select.Item key="success" textValue="Success">
                  Success
                </Select.Item>
                <Select.Item key="error" textValue="Error">
                  Error
                </Select.Item>
              </Select>

              <Input
                label="Event Type"
                placeholder="e.g. force_sync"
                value={eventTypeFilter}
                onChange={(e) => setEventTypeFilter(e.target.value)}
                size="sm"
                variant="bordered"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                color="primary"
                size="sm"
                onPress={handleApplyFilters}
                isPending={isRefreshing}
              >
                Apply Filters
              </Button>
              
              {hasActiveFilters && (
                <Button
                  variant="light"
                  size="sm"
                  onPress={handleClearFilters}
                  startContent={<X className="size-3.5" />}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── Search Bar ────────────────────────────────────────── */}
        <div className="px-4 pt-3 pb-2">
          <Input
            placeholder="Search logs by event, error message, or booking ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            size="sm"
            variant="bordered"
            startContent={<Filter className="size-3.5 text-foreground/40" />}
          />
        </div>

        <Card.Content className="p-0">
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <Activity className="size-8 text-foreground/25 mb-3" />
              <p className="text-sm font-medium text-foreground/70">
                No sync events found
              </p>
              <p className="text-xs text-foreground/50 mt-1">
                {hasActiveFilters
                  ? "Try adjusting your filters"
                  : "Sync events will appear here once Bed24 is active"}
              </p>
            </div>
          ) : (
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label="Sync event logs">
                  <Table.Header>
                    <Table.Column>Direction</Table.Column>
                    <Table.Column isRowHeader>Event</Table.Column>
                    <Table.Column>Status</Table.Column>
                    <Table.Column>Time</Table.Column>
                    <Table.Column>Details</Table.Column>
                  </Table.Header>
                  <Table.Body items={filteredLogs}>
                    {(log) => (
                      <Table.Row key={log.id} id={log.id}>
                        <Table.Cell>
                          <DirectionBadge direction={log.direction} />
                        </Table.Cell>
                        <Table.Cell>
                          <div>
                            <p className="text-sm font-medium">
                              {formatEventType(log.eventType)}
                            </p>
                            {log.beds24BookingId && (
                              <p className="text-[11px] text-foreground/50 font-mono">
                                B24: {log.beds24BookingId}
                              </p>
                            )}
                          </div>
                        </Table.Cell>
                        <Table.Cell>
                          <StatusChip status={log.status} />
                        </Table.Cell>
                        <Table.Cell>
                          <div>
                            <p className="text-xs font-medium text-foreground">
                              {formatRelative(log.processedAt)}
                            </p>
                            <p className="text-[11px] text-foreground/50">
                              {formatDateTime(log.processedAt)}
                            </p>
                          </div>
                        </Table.Cell>
                        <Table.Cell>
                          {log.errorMessage || log.conflictDetails ? (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedLogId(
                                  expandedLogId === log.id ? null : log.id
                                )
                              }
                              className="text-xs text-danger underline underline-offset-2 hover:text-danger/80 transition-colors"
                            >
                              {expandedLogId === log.id ? "Hide" : "View error"}
                            </button>
                          ) : (
                            <span className="text-xs text-foreground/40">—</span>
                          )}
                        </Table.Cell>
                      </Table.Row>
                    )}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          )}
        </Card.Content>
      </Card>

      {/* ── Error Detail Panel ────────────────────────────────── */}
      {expandedLogId && (() => {
        const log = filteredLogs.find((l) => l.id === expandedLogId);
        if (!log) return null;
        
        return (
          <Card variant="secondary">
            <Card.Content className="pt-4">
              <div className="flex items-start justify-between mb-2">
                <p className="text-sm font-semibold text-danger">
                  Error Details — {formatEventType(log.eventType)}
                </p>
                <button
                  type="button"
                  onClick={() => setExpandedLogId(null)}
                  className="text-xs text-foreground/55 hover:text-foreground transition-colors"
                >
                  Close
                </button>
              </div>
              
              {log.errorMessage && (
                <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words font-mono text-danger mb-2">
                  {log.errorMessage}
                </pre>
              )}
              
              {log.conflictDetails && (
                <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words font-mono text-warning">
                  {JSON.stringify(log.conflictDetails, null, 2)}
                </pre>
              )}
              
              <p className="text-xs text-foreground/55 mt-2">
                {formatDateTime(log.processedAt)}
                {log.bookingId && ` · Booking: ${log.bookingId}`}
              </p>
            </Card.Content>
          </Card>
        );
      })()}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function DirectionBadge({
  direction,
}: {
  direction: "inbound" | "outbound" | null;
}) {
  if (direction === "outbound") {
    return (
      <Chip color="primary" variant="soft" size="sm">
        <span className="flex items-center gap-1">
          <ArrowUpRight className="size-3" />
          Out
        </span>
      </Chip>
    );
  }
  
  return (
    <Chip color="success" variant="soft" size="sm">
      <span className="flex items-center gap-1">
        <ArrowDownLeft className="size-3" />
        In
      </span>
    </Chip>
  );
}

function StatusChip({
  status,
}: {
  status: "success" | "error" | "pending" | null;
}) {
  if (status === "success") {
    return (
      <Chip color="success" variant="soft" size="sm">
        <span className="flex items-center gap-1">
          <CheckCircle2 className="size-3" />
          Success
        </span>
      </Chip>
    );
  }
  
  if (status === "error") {
    return (
      <Chip color="danger" variant="soft" size="sm">
        <span className="flex items-center gap-1">
          <XCircle className="size-3" />
          Error
        </span>
      </Chip>
    );
  }
  
  return (
    <Chip color="warning" variant="soft" size="sm">
      <span className="flex items-center gap-1">
        <Clock className="size-3" />
        {status ?? "Unknown"}
      </span>
    </Chip>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color: "success" | "danger" | "warning" | "default";
}

function StatCard({ label, value, sub, color }: StatCardProps) {
  const colorClasses = {
    success: "text-success",
    danger: "text-danger",
    warning: "text-warning",
    default: "text-foreground",
  };

  return (
    <Card variant="secondary">
      <Card.Content className="pt-4 pb-4">
        <div className="space-y-1">
          <p className="text-xs text-foreground/55 font-medium">{label}</p>
          <p className={`text-2xl font-bold tabular-nums ${colorClasses[color]}`}>
            {value}
          </p>
          {sub && <p className="text-[11px] text-foreground/50">{sub}</p>}
        </div>
      </Card.Content>
    </Card>
  );
}

// ── Helpers ───────────────────────────────────────────────────────

function formatEventType(eventType: string | null): string {
  const map: Record<string, string> = {
    force_sync: "Force Sync",
    booking_created: "Booking Created",
    booking_cancelled: "Booking Cancelled",
    availability_push: "Availability Push",
    webhook_received: "Webhook Received",
  };
  return eventType ? (map[eventType] ?? eventType) : "—";
}

function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
