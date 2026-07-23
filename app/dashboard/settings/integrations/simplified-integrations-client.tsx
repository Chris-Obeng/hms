"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  RefreshCw,
  Mail,
  ChevronDown,
  ChevronUp,
  Activity,
} from "lucide-react";
import {
  Card,
  Button,
  Chip,
  Alert,
  Accordion,
  Spinner,
  Surface,
} from "@heroui/react";

interface IntegrationMetrics {
  connectionStatus: "active" | "inactive" | "syncing";
  lastSync: string | null;
  successRate: number;
  recentActivity?: Array<{
    id: string;
    timestamp: string;
    message: string;
    status: "success" | "error";
  }>;
}

interface SimplifiedIntegrationsClientProps {
  hotelName: string;
  bed24Configured: boolean;
  bed24Metrics: IntegrationMetrics | null;
}

/**
 * SimplifiedIntegrationsClient Component
 * 
 * Clean, user-friendly view of integration status for hotel users.
 * No technical configuration - just status and support.
 */
export function SimplifiedIntegrationsClient({
  hotelName,
  bed24Configured,
  bed24Metrics,
}: SimplifiedIntegrationsClientProps) {
  const [expandedCard, setExpandedCard] = React.useState<string | null>(null);

  function toggleCard(cardId: string) {
    setExpandedCard(expandedCard === cardId ? null : cardId);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* ── Page Header ──────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Back to settings"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Connected Services
          </h1>
          <p className="text-sm text-foreground/60 mt-0.5">
            Your hotel is connected to these services
          </p>
        </div>
      </div>

      {/* ── Integrations Grid ────────────────────────────────── */}
      <div className="grid gap-4">
        {/* Bed24 Integration Card */}
        <IntegrationStatusCard
          integration={{
            name: "Bed24 Channel Manager",
            icon: <Building2 className="size-5" />,
            description: bed24Configured
              ? "Your rooms are automatically synced with Booking.com, Airbnb, and other OTAs"
              : "Connect your property to sync with major OTAs like Booking.com and Airbnb",
            status: getBed24Status(bed24Configured, bed24Metrics),
            statusLabel: getBed24StatusLabel(bed24Configured, bed24Metrics),
          }}
          metrics={bed24Metrics}
          isExpanded={expandedCard === "bed24"}
          onToggle={() => toggleCard("bed24")}
          onContactSupport={() => {
            window.location.href = `mailto:support@hotelosprp.com?subject=Integration Support - ${encodeURIComponent(hotelName)}`;
          }}
        />

        {/* Future integrations placeholder */}
        <Card variant="secondary">
          <Card.Content className="py-8 text-center">
            <Activity className="size-6 text-foreground/25 mx-auto mb-2" />
            <p className="text-sm text-foreground/60">
              More integrations coming soon
            </p>
          </Card.Content>
        </Card>
      </div>

      {/* ── Help Section ──────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <Card.Title>Need Help?</Card.Title>
          <p className="text-sm text-foreground/70 mt-0.5">
            Common questions about integrations
          </p>
        </Card.Header>
        <Card.Content>
          <Accordion>
            <Accordion.Item value="how-sync-works">
              <Accordion.Heading>
                <Accordion.Trigger>
                  <span className="text-sm font-medium">
                    How does channel sync work?
                  </span>
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body>
                  <p className="text-sm text-foreground/70">
                    Your room availability is automatically synced with Bed24 multiple
                    times per day. When a booking is made through any OTA channel, it's
                    instantly reflected in your HotelOS dashboard. All sync operations are
                    managed by our team - no action required from you.
                  </p>
                </Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="what-if-error">
              <Accordion.Heading>
                <Accordion.Trigger>
                  <span className="text-sm font-medium">
                    What if I see sync errors?
                  </span>
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body>
                  <p className="text-sm text-foreground/70">
                    Our monitoring system automatically detects and alerts our team to any
                    sync issues. In most cases, temporary errors resolve themselves within
                    minutes. If you notice persistent issues, please contact support and
                    we'll investigate immediately.
                  </p>
                </Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="setup-new-integration">
              <Accordion.Heading>
                <Accordion.Trigger>
                  <span className="text-sm font-medium">
                    How do I set up a new integration?
                  </span>
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body>
                  <p className="text-sm text-foreground/70">
                    All integrations are set up by our onboarding team to ensure proper
                    configuration. If you need to add a new OTA channel or integration,
                    please contact support at{" "}
                    <a
                      href="mailto:support@hotelosprp.com"
                      className="text-primary hover:underline"
                    >
                      support@hotelosprp.com
                    </a>{" "}
                    and we'll assist you.
                  </p>
                </Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Card.Content>
      </Card>

      {/* ── Support Contact Card ──────────────────────────────── */}
      <Surface variant="secondary" className="p-6">
        <div className="flex items-start gap-4">
          <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Mail className="size-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">
              Still have questions?
            </h3>
            <p className="text-sm text-foreground/70 mt-1">
              Our support team is here to help. Reach out anytime.
            </p>
            <Button
              as={Link}
              href={`mailto:support@hotelosprp.com?subject=Integration Support - ${encodeURIComponent(hotelName)}`}
              color="primary"
              size="sm"
              className="mt-3"
              startContent={<Mail className="size-3.5" />}
            >
              Contact Support
            </Button>
          </div>
        </div>
      </Surface>
    </div>
  );
}

// ── IntegrationStatusCard Sub-component ───────────────────────────

interface IntegrationStatusCardProps {
  integration: {
    name: string;
    icon: React.ReactNode;
    description: string;
    status: "connected" | "warning" | "error" | "not_configured" | "syncing";
    statusLabel: string;
  };
  metrics: IntegrationMetrics | null;
  isExpanded: boolean;
  onToggle: () => void;
  onContactSupport: () => void;
}

function IntegrationStatusCard({
  integration,
  metrics,
  isExpanded,
  onToggle,
  onContactSupport,
}: IntegrationStatusCardProps) {
  const { status, statusLabel, name, icon, description } = integration;

  const statusConfig = {
    connected: {
      color: "success" as const,
      icon: CheckCircle2,
      bgClass: "bg-success/5 border-success/20",
    },
    warning: {
      color: "warning" as const,
      icon: AlertTriangle,
      bgClass: "bg-warning/5 border-warning/20",
    },
    error: {
      color: "danger" as const,
      icon: XCircle,
      bgClass: "bg-danger/5 border-danger/20",
    },
    not_configured: {
      color: "default" as const,
      icon: Clock,
      bgClass: "bg-muted/30 border-border",
    },
    syncing: {
      color: "primary" as const,
      icon: RefreshCw,
      bgClass: "bg-primary/5 border-primary/20",
    },
  };

  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <Card className={config.bgClass}>
      <Card.Header>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2.5">
            <div className="size-10 rounded-lg bg-background flex items-center justify-center">
              {icon}
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">{name}</h3>
            </div>
          </div>
          <Chip color={config.color} variant="soft" size="sm">
            <span className="flex items-center gap-1">
              <StatusIcon className="size-3" />
              {statusLabel}
            </span>
          </Chip>
        </div>
      </Card.Header>

      <Card.Content className="space-y-4">
        <p className="text-sm text-foreground/70">{description}</p>

        {/* Show warning/error messages */}
        {status === "warning" && (
          <Alert status="warning" size="sm">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>
                Some sync errors detected. Our team has been notified and is investigating.
              </Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {status === "error" && (
          <Alert status="danger" size="sm">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>
                Connection issues detected. Support has been notified. Your bookings are
                safe and will sync once restored.
              </Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {status === "syncing" && (
          <Alert status="default" size="sm">
            <Alert.Indicator>
              <Spinner size="sm" color="current" />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Description>
                Syncing availability with channels. This usually takes a few seconds.
              </Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {/* Metrics Cards */}
        {metrics && status !== "not_configured" && (
          <div className="grid grid-cols-3 gap-3">
            <MetricCard
              icon={
                metrics.connectionStatus === "active" ? (
                  <CheckCircle2 className="size-4" />
                ) : metrics.connectionStatus === "syncing" ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <XCircle className="size-4" />
                )
              }
              label="Status"
              value={
                metrics.connectionStatus === "active"
                  ? "Active"
                  : metrics.connectionStatus === "syncing"
                  ? "Syncing"
                  : "Inactive"
              }
              status={
                metrics.connectionStatus === "active"
                  ? "success"
                  : metrics.connectionStatus === "syncing"
                  ? "info"
                  : "error"
              }
            />
            <MetricCard
              icon={<Clock className="size-4" />}
              label="Last Sync"
              value={metrics.lastSync ? formatRelative(metrics.lastSync) : "Never"}
              status="info"
            />
            <MetricCard
              icon={<Activity className="size-4" />}
              label="Success"
              value={`${metrics.successRate}%`}
              status={
                metrics.successRate >= 95
                  ? "success"
                  : metrics.successRate >= 80
                  ? "warning"
                  : "error"
              }
            />
          </div>
        )}

        {/* Expanded Details */}
        {isExpanded && metrics?.recentActivity && (
          <div className="pt-3 border-t border-border">
            <h4 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider mb-2">
              Recent Activity
            </h4>
            <div className="space-y-2">
              {metrics.recentActivity.slice(0, 5).map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-2 text-xs text-foreground/70"
                >
                  {activity.status === "success" ? (
                    <CheckCircle2 className="size-3 text-success shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="size-3 text-danger shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p>{activity.message}</p>
                    <p className="text-[11px] text-foreground/50">
                      {formatDateTime(activity.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-foreground/50 mt-3">
              All sync operations are managed by the HotelOS team
            </p>
          </div>
        )}
      </Card.Content>

      <Card.Footer className="flex flex-wrap items-center justify-between gap-2 pt-2">
        {status !== "not_configured" && metrics?.recentActivity && (
          <Button
            variant="light"
            size="sm"
            onPress={onToggle}
            endContent={
              isExpanded ? (
                <ChevronUp className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )
            }
          >
            {isExpanded ? "Hide" : "View"} Sync Details
          </Button>
        )}

        <Button
          as={Link}
          href="#"
          variant="light"
          size="sm"
          color={status === "error" || status === "warning" ? "danger" : "default"}
          onPress={onContactSupport}
          startContent={<Mail className="size-3.5" />}
        >
          {status === "not_configured" ? "Contact Support to Setup" : "Need Help?"}
        </Button>
      </Card.Footer>
    </Card>
  );
}

// ── MetricCard Sub-component ──────────────────────────────────────

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  status: "success" | "warning" | "error" | "info";
}

function MetricCard({ icon, label, value, status }: MetricCardProps) {
  const statusColors = {
    success: "text-success",
    warning: "text-warning",
    error: "text-danger",
    info: "text-foreground",
  };

  return (
    <Surface variant="secondary" className="p-3">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`${statusColors[status]} opacity-70`}>{icon}</span>
          <p className="text-[10px] text-foreground/55 uppercase tracking-wider font-medium">
            {label}
          </p>
        </div>
        <p className={`text-lg font-bold tabular-nums ${statusColors[status]}`}>
          {value}
        </p>
      </div>
    </Surface>
  );
}

// ── Helper Functions ──────────────────────────────────────────────

function getBed24Status(
  configured: boolean,
  metrics: IntegrationMetrics | null
): "connected" | "warning" | "error" | "not_configured" | "syncing" {
  if (!configured) return "not_configured";
  if (!metrics) return "error";
  if (metrics.connectionStatus === "syncing") return "syncing";
  if (metrics.connectionStatus === "inactive") return "error";
  if (metrics.successRate < 80) return "warning";
  return "connected";
}

function getBed24StatusLabel(
  configured: boolean,
  metrics: IntegrationMetrics | null
): string {
  if (!configured) return "Not Setup";
  if (!metrics) return "Error";
  if (metrics.connectionStatus === "syncing") return "Syncing";
  if (metrics.connectionStatus === "inactive") return "Disconnected";
  if (metrics.successRate < 80) return "Warning";
  return "Connected";
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
