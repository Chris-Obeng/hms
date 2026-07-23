"use client";

import * as React from "react";
import { ArrowLeft, Settings2, Activity, Layers, Database } from "lucide-react";
import Link from "next/link";
import { Card, Tabs, Spinner } from "@heroui/react";
import { toast } from "@heroui/react";
import { HotelSelector } from "./_components/hotel-selector";
import { ConnectionTab } from "./_components/connection-tab";
import { RoomMappingsTab } from "./_components/room-mappings-tab";
import { SyncLogsTab } from "./_components/sync-logs-tab";
import type {
  HotelOption,
  Bed24Config,
  RoomMapping,
  ChannelStats,
  SyncLog,
} from "@/types/platform-integrations";
import {
  getAllHotelsForSelection,
  getBed24ConfigForHotel,
  getRoomMappingsForHotel,
  getChannelStatsForHotel,
  getSyncLogsForHotel,
} from "./_actions";

/**
 * PlatformIntegrationsClient Component
 * 
 * Main interface for platform admins to manage Bed24 integrations
 * across all hotels. Handles hotel selection and tab navigation.
 */
export function PlatformIntegrationsClient({
  initialHotels,
  initialSelectedHotelId,
}: {
  initialHotels: HotelOption[];
  initialSelectedHotelId: string | null;
}) {
  // ── State ───────────────────────────────────────────────────
  const [hotels] = React.useState<HotelOption[]>(initialHotels);
  const [selectedHotelId, setSelectedHotelId] = React.useState<string>(
    initialSelectedHotelId ?? initialHotels[0]?.id ?? ""
  );
  
  const [bed24Config, setBed24Config] = React.useState<Bed24Config | null>(null);
  const [roomMappings, setRoomMappings] = React.useState<RoomMapping[]>([]);
  const [syncLogs, setSyncLogs] = React.useState<SyncLog[]>([]);
  const [channelStats, setChannelStats] = React.useState<ChannelStats | null>(null);
  
  const [isLoadingData, setIsLoadingData] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<string>("connection");

  // ── Effects ─────────────────────────────────────────────────
  
  /**
   * Load all data for the selected hotel when it changes
   */
  React.useEffect(() => {
    if (!selectedHotelId) return;
    
    loadHotelData(selectedHotelId);
  }, [selectedHotelId]);

  // ── Data Loading ────────────────────────────────────────────
  
  async function loadHotelData(hotelId: string) {
    setIsLoadingData(true);
    
    try {
      const [configRes, mappingsRes, statsRes, logsRes] = await Promise.all([
        getBed24ConfigForHotel(hotelId),
        getRoomMappingsForHotel(hotelId),
        getChannelStatsForHotel(hotelId),
        getSyncLogsForHotel({ hotelId, limit: 50 }),
      ]);

      if (configRes.success) {
        setBed24Config(configRes.data ?? null);
      } else {
        toast.error(`Failed to load config: ${configRes.error}`);
      }

      if (mappingsRes.success) {
        setRoomMappings(mappingsRes.data ?? []);
      }

      if (statsRes.success) {
        setChannelStats(statsRes.data ?? null);
      }

      if (logsRes.success) {
        setSyncLogs(logsRes.data ?? []);
      }
    } catch (err) {
      toast.error("Failed to load hotel data");
      console.error(err);
    } finally {
      setIsLoadingData(false);
    }
  }

  /**
   * Refresh only the sync logs and stats (after a sync or config change)
   */
  async function refreshSyncData() {
    if (!selectedHotelId) return;
    
    const [statsRes, logsRes] = await Promise.all([
      getChannelStatsForHotel(selectedHotelId),
      getSyncLogsForHotel({ hotelId: selectedHotelId, limit: 50 }),
    ]);

    if (statsRes.success) {
      setChannelStats(statsRes.data ?? null);
    }

    if (logsRes.success) {
      setSyncLogs(logsRes.data ?? []);
    }
  }

  /**
   * Refresh room mappings after CRUD operations
   */
  async function refreshMappings() {
    if (!selectedHotelId) return;
    
    const result = await getRoomMappingsForHotel(selectedHotelId);
    if (result.success) {
      setRoomMappings(result.data ?? []);
    }
  }

  // ── Render ──────────────────────────────────────────────────

  const selectedHotel = hotels.find((h) => h.id === selectedHotelId);

  return (
    <div className="space-y-6 max-w-7xl">
      {/* ── Page Header ──────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Link
          href="/platform/dashboard"
          className="inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Back to platform dashboard"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Integration Management
          </h1>
          <p className="text-sm text-foreground/60 mt-0.5">
            Configure Bed24 channel sync for each hotel
          </p>
        </div>
      </div>

      {/* ── Hotel Selector ───────────────────────────────────── */}
      <HotelSelector
        hotels={hotels}
        value={selectedHotelId}
        onChange={setSelectedHotelId}
        isLoading={isLoadingData}
      />

      {/* ── Loading State ────────────────────────────────────── */}
      {isLoadingData && (
        <Card>
          <Card.Content className="py-12 flex flex-col items-center justify-center">
            <Spinner size="lg" color="primary" />
            <p className="text-sm text-foreground/60 mt-3">
              Loading {selectedHotel?.name ?? "hotel"} data...
            </p>
          </Card.Content>
        </Card>
      )}

      {/* ── Tabs ─────────────────────────────────────────────── */}
      {!isLoadingData && bed24Config && (
        <Tabs selectedKey={activeTab} onSelectionChange={(key) => setActiveTab(String(key))}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="Integration management tabs">
              <Tabs.Tab id="connection">
                <span className="flex items-center gap-1.5">
                  <Settings2 className="size-3.5" />
                  Connection
                </span>
                <Tabs.Indicator />
              </Tabs.Tab>
              
              <Tabs.Tab id="mappings">
                <Tabs.Separator />
                <span className="flex items-center gap-1.5">
                  <Layers className="size-3.5" />
                  Room Mappings
                  {roomMappings.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-md bg-accent/20 text-accent-foreground">
                      {roomMappings.length}
                    </span>
                  )}
                </span>
                <Tabs.Indicator />
              </Tabs.Tab>
              
              <Tabs.Tab id="logs">
                <Tabs.Separator />
                <span className="flex items-center gap-1.5">
                  <Activity className="size-3.5" />
                  Sync Logs
                  {channelStats && channelStats.errorCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-md bg-danger/20 text-danger-foreground">
                      {channelStats.errorCount}
                    </span>
                  )}
                </span>
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>

          {/* ── Connection Tab ─────────────────────────────────── */}
          <Tabs.Panel id="connection" className="mt-4">
            <ConnectionTab
              config={bed24Config}
              stats={channelStats}
              onRefresh={refreshSyncData}
            />
          </Tabs.Panel>

          {/* ── Room Mappings Tab ──────────────────────────────── */}
          <Tabs.Panel id="mappings" className="mt-4">
            <RoomMappingsTab
              hotelId={selectedHotelId}
              mappings={roomMappings}
              onRefresh={refreshMappings}
            />
          </Tabs.Panel>

          {/* ── Sync Logs Tab ──────────────────────────────────── */}
          <Tabs.Panel id="logs" className="mt-4">
            <SyncLogsTab
              hotelId={selectedHotelId}
              logs={syncLogs}
              stats={channelStats}
              onRefresh={refreshSyncData}
            />
          </Tabs.Panel>
        </Tabs>
      )}

      {/* ── No Hotel Selected ────────────────────────────────── */}
      {!isLoadingData && !bed24Config && (
        <Card variant="secondary">
          <Card.Content className="py-12 flex flex-col items-center justify-center text-center">
            <Database className="size-8 text-foreground/25 mb-3" />
            <p className="text-sm font-medium text-foreground/70">
              Select a hotel to manage integrations
            </p>
            <p className="text-xs text-foreground/50 mt-1 max-w-xs">
              Choose a hotel from the dropdown above to configure Bed24 and view sync status
            </p>
          </Card.Content>
        </Card>
      )}
    </div>
  );
}
