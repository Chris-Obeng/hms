"use client";

import * as React from "react";
import { 
  CheckCircle2, 
  XCircle, 
  Wifi, 
  RefreshCw, 
  AlertTriangle,
  Clock,
  Activity,
  ArrowUpRight,
} from "lucide-react";
import { Card, Button, Input, Chip, Alert, Spinner } from "@heroui/react";
import { toast } from "@heroui/react";
import type { Bed24Config, ChannelStats } from "@/types/platform-integrations";
import {
  updateBed24ConfigForHotel,
  testBed24ConnectionForHotel,
  forceSyncForHotel,
} from "../_actions";
import { formatDateTime24, formatRelativeTime } from "@/lib/format";

interface ConnectionTabProps {
  config: Bed24Config;
  stats: ChannelStats | null;
  onRefresh: () => Promise<void>;
}

/**
 * ConnectionTab Component
 * 
 * Allows platform admins to configure Bed24 property ID,
 * test connection, and force availability sync for a hotel.
 */
export function ConnectionTab({ config, stats, onRefresh }: ConnectionTabProps) {
  // ── State ───────────────────────────────────────────────────
  const [propertyId, setPropertyId] = React.useState(config.propertyId ?? "");
  const [isSaving, setIsSaving] = React.useState(false);
  const [isTesting, setIsTesting] = React.useState(false);
  const [isSyncing, setIsSyncing] = React.useState(false);

  // Update property ID when config changes (hotel selection)
  React.useEffect(() => {
    setPropertyId(config.propertyId ?? "");
  }, [config.propertyId]);

  // ── Handlers ────────────────────────────────────────────────

  async function handleSave() {
    if (!propertyId.trim()) {
      toast.danger("Property ID cannot be empty");
      return;
    }

    setIsSaving(true);
    const result = await updateBed24ConfigForHotel({
      hotelId: config.hotelId,
      propertyId: propertyId.trim(),
    });
    setIsSaving(false);

    if (result.success) {
      toast.success(result.message ?? "Property ID saved successfully");
      await onRefresh();
    } else {
      toast.danger(result.error);
    }
  }

  async function handleTest() {
    setIsTesting(true);
    const result = await testBed24ConnectionForHotel();
    setIsTesting(false);

    if (result.success && result.data?.success) {
      const count = result.data.propertyCount ?? 0;
      toast.success(
        `✓ Connected — ${count} propert${count === 1 ? "y" : "ies"} found`
      );
    } else {
      const errMsg =
        (result.success ? result.data?.error : result.error) ??
        "Connection test failed";
      toast.danger(errMsg);
    }
  }

  async function handleForceSync() {
    setIsSyncing(true);
    const result = await forceSyncForHotel(config.hotelId);
    setIsSyncing(false);

    if (result.success && result.data?.success) {
      toast.success(
        result.data.details ?? "Availability sync completed successfully"
      );
      await onRefresh();
    } else {
      toast.danger(
        (result.success ? result.data?.error : result.error) ?? "Sync failed"
      );
    }
  }

  // ── Render ──────────────────────────────────────────────────

  const hasChanges = propertyId.trim() !== (config.propertyId ?? "");

  return (
    <div className="space-y-4">
      {/* ── Health Stats ──────────────────────────────────────── */}
      {config.isConfigured && stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Success Rate"
            value={`${stats.successRate}%`}
            sub={`${stats.successCount} successful`}
            icon={Activity}
            color={
              stats.successRate >= 90
                ? "success"
                : stats.successRate >= 70
                ? "warning"
                : "danger"
            }
          />
          <StatCard
            label="Total Syncs"
            value={stats.total}
            sub={`${stats.last24h} in last 24h`}
            icon={RefreshCw}
            color="default"
          />
          <StatCard
            label="Errors"
            value={stats.errorCount}
            sub={stats.errorCount === 0 ? "All clear" : "Check logs tab"}
            icon={XCircle}
            color={stats.errorCount === 0 ? "success" : "danger"}
          />
          <StatCard
            label="Last Outbound"
            value={formatRelativeTime(stats.lastOutboundSync)}
            sub={formatDateTime24(stats.lastOutboundSync)}
            icon={ArrowUpRight}
            color="default"
          />
        </div>
      )}

      {/* ── Configuration Not Set Warning ─────────────────────── */}
      {!config.isConfigured && (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Bed24 Not Configured</Alert.Title>
            <Alert.Description>
              Enter the Bed24 Property ID for <strong>{config.hotelName}</strong> below
              to enable OTA channel sync. The property ID can be found in the hotel's
              Beds24 account under Settings → Properties.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {/* ── Configuration Card ────────────────────────────────── */}
      <Card>
        <Card.Header>
          <div className="flex items-center justify-between w-full">
            <div>
              <Card.Title>Bed24 Property Configuration</Card.Title>
              <p className="text-sm text-foreground/70 mt-0.5">
                Configure Bed24 property ID for {config.hotelName}
              </p>
            </div>
            <ConnectionBadge isConfigured={config.isConfigured} />
          </div>
        </Card.Header>

        <Card.Content className="space-y-5">
          {/* Master token status (read-only) */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                Master API Token
              </p>
              <p className="text-xs text-foreground/55 mt-0.5">
                Shared across all hotels · managed in environment variables
              </p>
            </div>
            <Chip color="success" variant="soft" size="sm">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="size-3" />
                Configured
              </span>
            </Chip>
          </div>

          {/* Property ID input */}
          <div className="space-y-1.5">
            <label htmlFor="property-id" className="text-sm font-medium text-foreground">
              Property ID
              <span className="ml-2 text-xs text-foreground/50 font-normal">
                unique per hotel
              </span>
            </label>
            <Input
              id="property-id"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              placeholder="e.g. 123456"
              variant="secondary"
              className="max-w-xs"
            />
            <p className="text-xs text-foreground/55">
              {`Find this ID in ${config.hotelName}'s Beds24 account → Settings → Properties`}
            </p>
          </div>

          {/* Last sync info */}
          {config.lastSyncAt && (
            <div className="flex items-center gap-1.5 text-xs text-foreground/55">
              <Clock className="size-3" />
              <span>
                Last successful sync: {formatDateTime24(config.lastSyncAt)}
              </span>
            </div>
          )}

          {/* Unsaved changes warning */}
          {hasChanges && (
            <Alert status="default">
              <Alert.Indicator>
                <AlertTriangle className="size-4" />
              </Alert.Indicator>
              <Alert.Content>
                <Alert.Description>
                  You have unsaved changes. Click "Save Property ID" to apply them.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}
        </Card.Content>

        <Card.Footer className="flex flex-wrap gap-2 pt-2">
          <Button
            variant="primary"
            size="sm"
            isPending={isSaving}
            onPress={handleSave}
            isDisabled={!hasChanges || !propertyId.trim()}
          >
            {isSaving && <Spinner size="sm" color="current" />}
            Save Property ID
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            isPending={isTesting}
            onPress={handleTest}
          >
            {isTesting ? (
              <Spinner size="sm" color="current" />
            ) : (
              <Wifi className="size-3.5" />
            )}
            Test Connection
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            isPending={isSyncing}
            isDisabled={!config.isConfigured}
            onPress={handleForceSync}
          >
            {isSyncing ? (
              <Spinner size="sm" color="current" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Force Full Sync
          </Button>
        </Card.Footer>
      </Card>

      {/* ── Important Notes ───────────────────────────────────── */}
      <Alert status="default">
        <Alert.Indicator>
          <AlertTriangle className="size-4" />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Title>Platform Admin Only</Alert.Title>
          <Alert.Description>
            This configuration is only visible to platform admins. Hotel users will see
            a simplified integration status view without access to technical details.
            Room mappings should be configured during onboarding in the "Room Mappings" tab.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function ConnectionBadge({ isConfigured }: { isConfigured: boolean }) {
  return (
    <Chip
      color={isConfigured ? "success" : "default"}
      variant="soft"
      size="sm"
    >
      {isConfigured ? "Connected" : "Not configured"}
    </Chip>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color: "success" | "danger" | "warning" | "default";
}

function StatCard({ label, value, sub, icon: Icon, color }: StatCardProps) {
  const colorClasses = {
    success: "text-success",
    danger: "text-danger",
    warning: "text-warning",
    default: "text-foreground",
  };

  return (
    <Card variant="secondary">
      <Card.Content className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="text-xs text-foreground/55 font-medium">{label}</p>
            <p
              className={`text-2xl font-bold tabular-nums ${colorClasses[color]}`}
            >
              {value}
            </p>
            {sub && <p className="text-[11px] text-foreground/50">{sub}</p>}
          </div>
          <span className={`mt-0.5 opacity-70 ${colorClasses[color]}`}>
            <Icon className="size-5" />
          </span>
        </div>
      </Card.Content>
    </Card>
  );
}

