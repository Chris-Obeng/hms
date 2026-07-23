"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  RefreshCw,
  Wifi,
  Bell,
  BellOff,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Layers,
  Activity,
} from "lucide-react";
import {
  Card,
  Button,
  Chip,
  Alert,
  Spinner,
  Tabs,
  Table,
} from "@heroui/react";
import {
  saveBeds24Config,
  testBeds24,
  forceBeds24Sync,
  testArkeselSms,
  toggleHotelNotifications,
  refreshBeds24Token,
  getSyncLogs,
  getChannelStats,
} from "@/app/actions/integrations";


// ── Types ─────────────────────────────────────────────────────────

type SyncLog = {
  id: string;
  direction: string | null;
  event_type: string | null;
  status: string | null;
  error_message: string | null;
  conflict_details: string | null;
  processed_at: string | null;
  beds24_booking_id: string | null;
  booking_id: string | null;
};

type RoomMapping = {
  id: string;
  beds24_property_id: string;
  beds24_room_id: string;
  room_type_id: string;
  created_at: string | null;
  room_types: { name: string; base_price: number; is_active: boolean | null } | null;
};

type ChannelStats = {
  total: number;
  successCount: number;
  errorCount: number;
  last24h: number;
  successRate: number;
  lastOutboundSync: string | null;
  lastInboundSync: string | null;
};

export interface IntegrationsClientProps {
  initialData: {
    beds24PropertyId: string;
    beds24Configured: boolean;
    paystackSubaccountCode: string | null;
    lastSyncAt: string | null;
    notificationsEnabled: boolean;
  };
  staffPhone: string | null;
  hotelName: string;
  initialStats: ChannelStats | null;
  initialLogs: SyncLog[];
  initialMappings: RoomMapping[];
}


// ── Helpers ───────────────────────────────────────────────────────

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

function eventLabel(eventType: string | null): string {
  switch (eventType) {
    case "force_sync": return "Force Sync";
    case "booking_created": return "Booking Created";
    case "booking_cancelled": return "Booking Cancelled";
    case "availability_push": return "Availability Push";
    case "webhook_received": return "Webhook Received";
    default: return eventType ?? "—";
  }
}


// ── Sub-components ────────────────────────────────────────────────

function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <Chip
      color={connected ? "success" : "default"}
      variant="soft"
      size="sm"
    >
      {connected ? "Connected" : "Not configured"}
    </Chip>
  );
}

function StatusChip({ status }: { status: string | null }) {
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

function DirectionIcon({ direction }: { direction: string | null }) {
  if (direction === "outbound") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-accent-foreground bg-accent/10 px-2 py-0.5 rounded-full font-medium">
        <ArrowUpRight className="size-3" />
        Out
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-success-foreground bg-success/10 px-2 py-0.5 rounded-full font-medium">
      <ArrowDownLeft className="size-3" />
      In
    </span>
  );
}


// ── Stat card ─────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: "success" | "danger" | "warning" | "accent" | "default";
}) {
  const colorMap: Record<typeof color, string> = {
    success: "text-success",
    danger: "text-danger",
    warning: "text-warning",
    accent: "text-accent",
    default: "text-foreground",
  };
  return (
    <Card variant="secondary">
      <Card.Content className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="text-xs text-foreground/55 font-medium">{label}</p>
            <p className={`text-2xl font-bold tabular-nums ${colorMap[color]}`}>{value}</p>
            {sub && <p className="text-[11px] text-foreground/50">{sub}</p>}
          </div>
          <span className={`mt-0.5 opacity-70 ${colorMap[color]}`}>
            <Icon className="size-5" />
          </span>
        </div>
      </Card.Content>
    </Card>
  );
}


// ── Main component ────────────────────────────────────────────────

export function IntegrationsClient({
  initialData,
  staffPhone,
  hotelName,
  initialStats,
  initialLogs,
  initialMappings,
}: IntegrationsClientProps) {
  // ── Beds24 config state ───────────────────────────────────────
  const [b24PropertyId, setB24PropertyId] = React.useState(initialData.beds24PropertyId);
  const [savingB24, setSavingB24] = React.useState(false);
  const [testingB24, setTestingB24] = React.useState(false);
  const [syncingB24, setSyncingB24] = React.useState(false);
  const [refreshingToken, setRefreshingToken] = React.useState(false);

  // ── Dashboard data state ──────────────────────────────────────
  const [stats, setStats] = React.useState<ChannelStats | null>(initialStats);
  const [logs, setLogs] = React.useState<SyncLog[]>(initialLogs);
  const [mappings] = React.useState<RoomMapping[]>(initialMappings);
  const [loadingLogs, setLoadingLogs] = React.useState(false);
  const [expandedLog, setExpandedLog] = React.useState<string | null>(null);

  // ── Notifications state ───────────────────────────────────────
  const [notificationsOn, setNotificationsOn] = React.useState(initialData.notificationsEnabled);
  const [togglingNotif, setTogglingNotif] = React.useState(false);
  const [testPhone, setTestPhone] = React.useState(staffPhone ?? "");
  const [testingNotif, setTestingNotif] = React.useState(false);

  const isConfigured = !!b24PropertyId.trim() && initialData.beds24Configured;


  // ── Handlers ─────────────────────────────────────────────────

  async function handleSaveBeds24() {
    setSavingB24(true);
    const r = await saveBeds24Config(b24PropertyId.trim());
    setSavingB24(false);
    r.success ? toast.success("Property ID saved") : toast.error(r.error ?? "Failed to save");
  }

  async function handleTestBeds24() {
    setTestingB24(true);
    const r = await testBeds24();
    setTestingB24(false);
    if (r.success) {
      toast.success(`Connected — ${r.propertyCount} propert${r.propertyCount === 1 ? "y" : "ies"} found`);
    } else {
      toast.error(`Connection failed: ${r.error}`);
    }
  }

  async function handleForceSync() {
    setSyncingB24(true);
    const r = await forceBeds24Sync();
    setSyncingB24(false);
    if (r.success) {
      toast.success("message" in r ? r.message : "Sync complete");
      await refreshDashboardData();
    } else {
      toast.error(r.error ?? "Sync failed");
    }
  }

  async function handleRefreshToken() {
    setRefreshingToken(true);
    const r = await refreshBeds24Token();
    setRefreshingToken(false);
    if (r.success) {
      toast.success(`Token refreshed — expires in ${Math.round((r.expiresIn ?? 86400) / 3600)}h`);
    } else {
      toast.error(r.error ?? "Refresh failed");
    }
  }

  async function handleToggleNotifications(val: boolean) {
    setTogglingNotif(true);
    const r = await toggleHotelNotifications(val);
    setTogglingNotif(false);
    if (r.success) {
      setNotificationsOn(val);
      toast.success(val ? "Guest notifications enabled" : "Guest notifications disabled");
    } else {
      toast.error(r.error ?? "Failed to update");
    }
  }

  async function handleTestNotification() {
    if (!testPhone) { toast.error("Enter a phone number"); return; }
    setTestingNotif(true);
    const r = await testArkeselSms(testPhone, hotelName);
    setTestingNotif(false);
    r.success ? toast.success("Test SMS sent!") : toast.error(`Failed: ${r.error}`);
  }

  async function refreshDashboardData() {
    setLoadingLogs(true);
    setExpandedLog(null);
    const [statsRes, logsRes] = await Promise.all([getChannelStats(), getSyncLogs(50)]);
    if (statsRes.success) setStats(statsRes.stats);
    if (logsRes.success) setLogs(logsRes.logs);
    setLoadingLogs(false);
  }


  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Back to settings"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Channel Sync Dashboard</h1>
          <p className="text-sm text-foreground/60 mt-0.5">
            Beds24 OTA integration · channel mapping · sync health
          </p>
        </div>
      </div>

      {/* ── Stats overview ─────────────────────────────────────── */}
      {isConfigured && stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Success Rate"
            value={`${stats.successRate}%`}
            sub={`${stats.successCount} successful`}
            icon={Activity}
            color={stats.successRate >= 90 ? "success" : stats.successRate >= 70 ? "warning" : "danger"}
          />
          <StatCard
            label="Total Syncs"
            value={stats.total}
            sub={`${stats.last24h} in last 24h`}
            icon={RefreshCw}
            color="accent"
          />
          <StatCard
            label="Errors"
            value={stats.errorCount}
            sub={stats.errorCount === 0 ? "All clear" : "Check logs below"}
            icon={XCircle}
            color={stats.errorCount === 0 ? "success" : "danger"}
          />
          <StatCard
            label="Last Outbound"
            value={formatRelative(stats.lastOutboundSync)}
            sub={formatDateTime(stats.lastOutboundSync)}
            icon={ArrowUpRight}
            color="default"
          />
        </div>
      )}

      {/* No stats yet — unconfigured */}
      {!isConfigured && (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Beds24 not configured</Alert.Title>
            <Alert.Description>
              Enter this hotel's Beds24 Property ID below to activate OTA channel sync.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}


      {/* ── Tabs ───────────────────────────────────────────────── */}
      <Tabs>
        <Tabs.ListContainer>
          <Tabs.List aria-label="Channel sync sections">
            <Tabs.Tab id="connection">
              <span className="flex items-center gap-1.5">
                <KeyRound className="size-3.5" />
                Connection
              </span>
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="mappings">
              <Tabs.Separator />
              <span className="flex items-center gap-1.5">
                <Layers className="size-3.5" />
                Room Mapping
                {mappings.length > 0 && (
                  <Chip color="accent" variant="soft" size="sm" className="ml-1">
                    {mappings.length}
                  </Chip>
                )}
              </span>
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="logs">
              <Tabs.Separator />
              <span className="flex items-center gap-1.5">
                <Activity className="size-3.5" />
                Sync Logs
                {stats && stats.errorCount > 0 && (
                  <Chip color="danger" variant="soft" size="sm" className="ml-1">
                    {stats.errorCount}
                  </Chip>
                )}
              </span>
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="notifications">
              <Tabs.Separator />
              <span className="flex items-center gap-1.5">
                <Bell className="size-3.5" />
                Notifications
              </span>
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>


        {/* ── TAB: Connection ──────────────────────────────────── */}
        <Tabs.Panel id="connection" className="mt-4">
          <Card>
            <Card.Header>
              <div className="flex items-center justify-between w-full">
                <div>
                  <Card.Title>Beds24 — OTA Channel Manager</Card.Title>
                  <p className="text-sm text-foreground/70 mt-0.5">
                    Syncs availability with Booking.com, Airbnb, and other OTAs via Beds24 · Growth &amp; Pro plans
                  </p>
                </div>
                <ConnectionBadge connected={isConfigured} />
              </div>
            </Card.Header>

            <Card.Content className="space-y-5">
              {/* Master token status — read-only, set in env */}
              <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Master API Token</p>
                  <p className="text-xs text-foreground/55 mt-0.5">
                    Shared across all hotels · managed in server environment variables
                  </p>
                </div>
                {initialData.beds24Configured ? (
                  <Chip color="success" variant="soft" size="sm">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="size-3" />
                      Configured
                    </span>
                  </Chip>
                ) : (
                  <Chip color="danger" variant="soft" size="sm">
                    <span className="flex items-center gap-1">
                      <XCircle className="size-3" />
                      Not set
                    </span>
                  </Chip>
                )}
              </div>

              {!initialData.beds24Configured && (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Platform credentials missing</Alert.Title>
                    <Alert.Description>
                      Set <code className="font-mono text-xs bg-background/60 px-1 rounded">BEDS24_REFRESH_TOKEN</code> and{" "}
                      <code className="font-mono text-xs bg-background/60 px-1 rounded">BEDS24_API_TOKEN</code>{" "}
                      in your server environment variables. Contact your platform administrator.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              )}

              {/* Property ID — per-hotel */}
              <div className="space-y-1.5">
                <label htmlFor="b24-property" className="text-sm font-medium text-foreground">
                  Property ID
                  <span className="ml-2 text-xs text-foreground/50 font-normal">per hotel</span>
                </label>
                <input
                  id="b24-property"
                  type="text"
                  value={b24PropertyId}
                  onChange={(e) => setB24PropertyId(e.target.value)}
                  placeholder="e.g. 123456"
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40 max-w-xs"
                />
                <p className="text-xs text-foreground/55">
                  This hotel's property ID in your Beds24 account → Settings → Properties.
                </p>
              </div>

              {initialData.lastSyncAt && (
                <p className="text-xs text-foreground/55 flex items-center gap-1.5">
                  <Clock className="size-3" />
                  Last successful sync: {formatDateTime(initialData.lastSyncAt)}
                </p>
              )}
            </Card.Content>

            <Card.Footer className="flex flex-wrap gap-2 pt-2">
              <Button
                variant="primary"
                size="sm"
                isPending={savingB24}
                onPress={handleSaveBeds24}
              >
                {savingB24 ? <Spinner size="sm" color="current" /> : null}
                Save Property ID
              </Button>
              <Button
                variant="outline"
                size="sm"
                isPending={testingB24}
                onPress={handleTestBeds24}
              >
                {testingB24 ? <Spinner size="sm" color="current" /> : <Wifi className="size-3.5" />}
                Test Connection
              </Button>
              <Button
                variant="outline"
                size="sm"
                isPending={syncingB24}
                isDisabled={!isConfigured}
                onPress={handleForceSync}
              >
                {syncingB24 ? <Spinner size="sm" color="current" /> : <RefreshCw className="size-3.5" />}
                Force Full Sync
              </Button>
            </Card.Footer>
          </Card>

          {/* Info note */}
          <Alert status="default" className="mt-3">
            <Alert.Indicator>
              <AlertTriangle className="size-4" />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Description>
                Room mapping to OTA channels is configured by HotelOS staff during onboarding.{" "}
                <a href="mailto:support@hotelosprp.com" className="underline font-medium">
                  Contact support
                </a>{" "}
                to set up or update your channel mapping.
              </Alert.Description>
            </Alert.Content>
          </Alert>
        </Tabs.Panel>


        {/* ── TAB: Room Mapping ────────────────────────────────── */}
        <Tabs.Panel id="mappings" className="mt-4">
          <Card>
            <Card.Header>
              <Card.Title>Channel Room Mapping</Card.Title>
              <p className="text-sm text-foreground/70 mt-0.5">
                Your local room types mapped to their Beds24 channel IDs
              </p>
            </Card.Header>
            <Card.Content className="p-0">
              {mappings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                  <Layers className="size-8 text-foreground/25 mb-3" />
                  <p className="text-sm font-medium text-foreground/70">No room mappings configured</p>
                  <p className="text-xs text-foreground/50 mt-1 max-w-xs">
                    Contact HotelOS support to map your room types to Beds24 channel IDs.
                  </p>
                </div>
              ) : (
                <Table>
                  <Table.ScrollContainer>
                    <Table.Content aria-label="Room channel mappings">
                      <Table.Header>
                        <Table.Column isRowHeader>Room Type</Table.Column>
                        <Table.Column>Beds24 Property ID</Table.Column>
                        <Table.Column>Beds24 Room ID</Table.Column>
                        <Table.Column>Status</Table.Column>
                        <Table.Column>Mapped</Table.Column>
                      </Table.Header>
                      <Table.Body items={mappings}>
                        {(m) => (
                          <Table.Row key={m.id} id={m.id}>
                            <Table.Cell>
                              <div>
                                <p className="text-sm font-medium">
                                  {m.room_types?.name ?? "Unknown room type"}
                                </p>
                                {m.room_types?.base_price != null && (
                                  <p className="text-[11px] text-foreground/50">
                                    GHS {m.room_types.base_price.toLocaleString()}/night
                                  </p>
                                )}
                              </div>
                            </Table.Cell>
                            <Table.Cell>
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                                {m.beds24_property_id}
                              </code>
                            </Table.Cell>
                            <Table.Cell>
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                                {m.beds24_room_id}
                              </code>
                            </Table.Cell>
                            <Table.Cell>
                              <Chip
                                color={m.room_types?.is_active ? "success" : "warning"}
                                variant="soft"
                                size="sm"
                              >
                                {m.room_types?.is_active ? "Active" : "Inactive"}
                              </Chip>
                            </Table.Cell>
                            <Table.Cell>
                              <span className="text-xs text-foreground/55">
                                {m.created_at ? new Date(m.created_at).toLocaleDateString("en-GB") : "—"}
                              </span>
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
        </Tabs.Panel>


        {/* ── TAB: Sync Logs ───────────────────────────────────── */}
        <Tabs.Panel id="logs" className="mt-4">
          <Card>
            <Card.Header>
              <div className="flex items-center justify-between w-full">
                <div>
                  <Card.Title>Sync Logs</Card.Title>
                  <p className="text-sm text-foreground/70 mt-0.5">Last 50 sync events between HotelOS and Beds24</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  isPending={loadingLogs}
                  onPress={refreshDashboardData}
                  aria-label="Refresh logs"
                >
                  {loadingLogs ? (
                    <Spinner size="sm" color="current" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  Refresh
                </Button>
              </div>
            </Card.Header>
            <Card.Content className="p-0">
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                  <Activity className="size-8 text-foreground/25 mb-3" />
                  <p className="text-sm font-medium text-foreground/70">No sync events yet</p>
                  <p className="text-xs text-foreground/50 mt-1">
                    Sync events will appear here once Beds24 is configured and active.
                  </p>
                </div>
              ) : (
                <Table>
                  <Table.ScrollContainer>
                    <Table.Content aria-label="Beds24 sync logs">
                      <Table.Header>
                        <Table.Column>Direction</Table.Column>
                        <Table.Column isRowHeader>Event</Table.Column>
                        <Table.Column>Status</Table.Column>
                        <Table.Column>Time</Table.Column>
                        <Table.Column>Details</Table.Column>
                      </Table.Header>
                      <Table.Body items={logs}>
                        {(log) => (
                          <Table.Row key={log.id} id={log.id}>
                            <Table.Cell>
                              <DirectionIcon direction={log.direction} />
                            </Table.Cell>
                            <Table.Cell>
                              <div>
                                <p className="text-sm font-medium">{eventLabel(log.event_type)}</p>
                                {log.beds24_booking_id && (
                                  <p className="text-[11px] text-foreground/50 font-mono">
                                    B24: {log.beds24_booking_id}
                                  </p>
                                )}
                              </div>
                            </Table.Cell>
                            <Table.Cell>
                              <StatusChip status={log.status} />
                            </Table.Cell>
                            <Table.Cell>
                              <div>
                                <p className="text-xs font-medium text-foreground">{formatRelative(log.processed_at)}</p>
                                <p className="text-[11px] text-foreground/50">
                                  {formatDateTime(log.processed_at)}
                                </p>
                              </div>
                            </Table.Cell>
                            <Table.Cell>
                              {(log.error_message || log.conflict_details) ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedLog(expandedLog === log.id ? null : log.id)
                                  }
                                  className="text-xs text-danger underline underline-offset-2 hover:text-danger/80 transition-colors"
                                >
                                  {expandedLog === log.id ? "Hide" : "View error"}
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

          {/* Expanded error detail panel */}
          {expandedLog && (() => {
            const log = logs.find((l) => l.id === expandedLog);
            if (!log) return null;
            return (
              <Card variant="secondary" className="mt-3">
                <Card.Content className="pt-4">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-sm font-semibold text-danger">
                      Error detail — {eventLabel(log.event_type)}
                    </p>
                    <button
                      type="button"
                      onClick={() => setExpandedLog(null)}
                      className="text-xs text-foreground/55 hover:text-foreground transition-colors"
                    >
                      Close
                    </button>
                  </div>
                  {log.error_message && (
                    <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words font-mono text-danger">
                      {log.error_message}
                    </pre>
                  )}
                  {log.conflict_details && (
                    <pre className="mt-2 text-xs bg-muted rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words font-mono text-warning">
                      {log.conflict_details}
                    </pre>
                  )}
                  <p className="text-xs text-foreground/55 mt-2">
                    {formatDateTime(log.processed_at)}
                    {log.booking_id && ` · Booking: ${log.booking_id}`}
                  </p>
                </Card.Content>
              </Card>
            );
          })()}
        </Tabs.Panel>


        {/* ── TAB: Notifications ───────────────────────────────── */}
        <Tabs.Panel id="notifications" className="mt-4 space-y-4">
          <Card>
            <Card.Header>
              <div className="flex items-center justify-between w-full">
                <div>
                  <Card.Title>Guest SMS &amp; Email Notifications</Card.Title>
                  <p className="text-sm text-foreground/70 mt-0.5">
                    Booking confirmations, reminders, and payment receipts sent to guests
                  </p>
                </div>
                {togglingNotif ? (
                  <Spinner size="sm" color="current" />
                ) : (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={notificationsOn}
                    onClick={() => handleToggleNotifications(!notificationsOn)}
                    className={[
                      "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                      notificationsOn ? "bg-accent" : "bg-muted-foreground/30",
                    ].join(" ")}
                    aria-label="Toggle guest notifications"
                  >
                    <span
                      className={[
                        "pointer-events-none inline-block size-5 rounded-full bg-white shadow ring-0 transition-transform duration-200",
                        notificationsOn ? "translate-x-5" : "translate-x-0",
                      ].join(" ")}
                    />
                  </button>
                )}
              </div>
            </Card.Header>

            {notificationsOn ? (
              <Card.Content className="space-y-4">
                <Alert status="accent">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>
                      <span className="font-semibold">Powered by HotelOS.</span>{" "}
                      SMS and email are sent from our shared account. Guests see{" "}
                      <code className="bg-accent/10 px-1 py-0.5 rounded text-[11px] font-mono">
                        {hotelName.slice(0, 11)}
                      </code>{" "}
                      as the sender.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>

                <div className="space-y-1.5">
                  <label htmlFor="test-phone" className="text-sm font-medium">
                    Test phone number
                  </label>
                  <div className="flex gap-2 max-w-sm">
                    <input
                      id="test-phone"
                      type="tel"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      placeholder="+233XXXXXXXXX"
                      className="flex-1 h-9 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      isPending={testingNotif}
                      onPress={handleTestNotification}
                    >
                      {testingNotif ? <Spinner size="sm" color="current" /> : <Bell className="size-3.5" />}
                      Send Test
                    </Button>
                  </div>
                  <p className="text-xs text-foreground/55">
                    Include country code, e.g. +233201234567 for Ghana.
                  </p>
                </div>
              </Card.Content>
            ) : (
              <Card.Content>
                <Alert status="warning">
                  <Alert.Indicator>
                    <BellOff className="size-4" />
                  </Alert.Indicator>
                  <Alert.Content>
                    <Alert.Description>
                      Guest notifications are off. Guests will not receive booking confirmations, reminders, or payment receipts.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              </Card.Content>
            )}
          </Card>
        </Tabs.Panel>

      </Tabs>
    </div>
  );
}
