/**
 * Platform Admin Integration Management Types
 * For managing Bed24 and other channel integrations across all hotels
 */

// ── Hotel Selection ───────────────────────────────────────────────

export interface HotelOption {
  id: string;
  name: string;
  slug: string;
  status: string;
  beds24Configured: boolean;
  lastSyncAt: string | null;
}

// ── Bed24 Configuration ───────────────────────────────────────────

export interface Bed24Config {
  hotelId: string;
  hotelName: string;
  propertyId: string | null;
  isConfigured: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: "success" | "error" | null;
}

export interface Bed24ConfigUpdate {
  hotelId: string;
  propertyId: string;
}

// ── Room Mappings ─────────────────────────────────────────────────

export interface RoomMapping {
  id: string;
  hotelId: string;
  beds24PropertyId: string;
  beds24RoomId: string;
  roomTypeId: string;
  roomTypeName: string;
  roomTypeBasePrice: number;
  isRoomTypeActive: boolean;
  createdAt: string;
}

export interface RoomMappingInput {
  hotelId: string;
  beds24PropertyId: string;
  beds24RoomId: string;
  roomTypeId: string;
}

// ── Sync Logs ─────────────────────────────────────────────────────

export interface SyncLog {
  id: string;
  hotelId: string;
  direction: "inbound" | "outbound" | null;
  eventType: string | null;
  status: "success" | "error" | "pending" | null;
  errorMessage: string | null;
  conflictDetails: Record<string, unknown> | null;
  processedAt: string | null;
  beds24BookingId: string | null;
  bookingId: string | null;
}

export interface SyncLogFilters {
  hotelId: string;
  direction?: "inbound" | "outbound";
  status?: "success" | "error";
  eventType?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

// ── Channel Stats ─────────────────────────────────────────────────

export interface ChannelStats {
  hotelId: string;
  total: number;
  successCount: number;
  errorCount: number;
  last24h: number;
  successRate: number;
  lastOutboundSync: string | null;
  lastInboundSync: string | null;
}

// ── Action Results ────────────────────────────────────────────────

export interface ActionSuccess<T = void> {
  success: true;
  data?: T;
  message?: string;
}

export interface ActionError {
  success: false;
  error: string;
  code?: string;
}

export type ActionResult<T = void> = ActionSuccess<T> | ActionError;

// ── Connection Test ───────────────────────────────────────────────

export interface ConnectionTestResult {
  success: boolean;
  propertyCount?: number;
  error?: string;
  details?: string;
}

// ── Sync Result ───────────────────────────────────────────────────

export interface SyncResult {
  success: boolean;
  syncedRooms?: number;
  failedRooms?: number;
  error?: string;
  details?: string;
}

// ── Audit Log Entry ───────────────────────────────────────────────

export interface PlatformAuditLog {
  adminId: string;
  adminEmail: string;
  action: string;
  hotelId: string;
  hotelName: string;
  entityType: string;
  entityId: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  timestamp: string;
}
