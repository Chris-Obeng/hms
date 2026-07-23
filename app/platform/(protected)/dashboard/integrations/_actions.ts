"use server";

/**
 * Platform Admin Integration Management Server Actions
 * 
 * This module contains all server actions for managing Bed24 integrations
 * across hotels from the platform admin dashboard.
 * 
 * @module app/platform/(protected)/dashboard/integrations/_actions
 * 
 * ## Security
 * - All actions require platform admin authentication via `assertPlatformAdmin()`
 * - Uses `supabaseAdmin` (service role) for cross-hotel access
 * - All configuration changes are logged to `platform_admin_audit_logs`
 * 
 * ## Key Features
 * - Hotel selection and configuration management
 * - Bed24 property ID configuration per hotel
 * - Room mapping CRUD operations
 * - Sync log queries and filtering
 * - Channel statistics aggregation
 * - CSV export functionality
 * 
 * ## Usage
 * These actions are called exclusively from the platform admin dashboard at:
 * `/platform/dashboard/integrations`
 * 
 * Hotel users do not have access to these actions - they use separate
 * read-only actions in `app/actions/integrations.ts`
 * 
 * @see {@link app/actions/integrations.ts} for hotel-scoped actions
 * @see {@link types/platform-integrations.ts} for type definitions
 * 
 * @author HotelOS Platform Team
 * @since 2026-07-21
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createPlatformClient } from "@/lib/supabase/platform-server";
import { revalidatePath } from "next/cache";
import {
  testBeds24Connection,
  getMasterToken,
  isBeds24Configured,
  pushAvailability,
} from "@/lib/beds24";
import type {
  ActionResult,
  HotelOption,
  Bed24Config,
  Bed24ConfigUpdate,
  RoomMapping,
  RoomMappingInput,
  SyncLog,
  SyncLogFilters,
  ChannelStats,
  ConnectionTestResult,
  SyncResult,
} from "@/types/platform-integrations";

// ── Auth Guard ────────────────────────────────────────────────────

/**
 * Verify that the current user is an active platform admin.
 * Throws an error if not authenticated or not a platform admin.
 */
async function assertPlatformAdmin(): Promise<{
  adminId: string;
  adminEmail: string;
  role: string;
}> {
  const supabase = await createPlatformClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Not authenticated");
  }

  const { data: admin } = await supabaseAdmin
    .from("platform_admins")
    .select("id, role, is_active, email")
    .eq("supabase_user_id", user.id)
    .single();

  if (!admin || !admin.is_active) {
    throw new Error("Platform admin access required");
  }

  return {
    adminId: admin.id,
    adminEmail: admin.email ?? user.email ?? "unknown",
    role: admin.role ?? "viewer",
  };
}

/**
 * Log platform admin action to audit trail.
 */
async function logPlatformAction(
  adminId: string,
  adminEmail: string,
  action: string,
  hotelId: string,
  entityType: string,
  entityId: string | null,
  beforeState: Record<string, unknown> | null,
  afterState: Record<string, unknown> | null
): Promise<void> {
  try {
    await supabaseAdmin.from("platform_admin_audit_logs").insert({
      admin_id: adminId,
      admin_email: adminEmail,
      action,
      hotel_id: hotelId,
      entity_type: entityType,
      entity_id: entityId,
      before_state: beforeState as import("@/types/database.types").Json | null,
      after_state: afterState as import("@/types/database.types").Json | null,
    });
  } catch (err) {
    console.error("Failed to log platform admin action:", err);
    // Don't throw - audit logging failure shouldn't block the operation
  }
}

// ── Hotel Selection ───────────────────────────────────────────────

/**
 * Get all hotels with their Bed24 configuration status.
 * Used for the hotel selector dropdown.
 */
export async function getAllHotelsForSelection(): Promise<
  ActionResult<HotelOption[]>
> {
  try {
    await assertPlatformAdmin();

    const { data: hotels, error } = await supabaseAdmin
      .from("hotels")
      .select("id, name, slug, status, beds24_property_id")
      .order("name", { ascending: true });

    if (error) throw error;

    // Get last sync time for each hotel
    const hotelsWithSync = await Promise.all(
      (hotels ?? []).map(async (hotel) => {
        const { data: lastSync } = await supabaseAdmin
          .from("beds24_sync_log")
          .select("processed_at")
          .eq("hotel_id", hotel.id)
          .eq("status", "success")
          .order("processed_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        return {
          id: hotel.id,
          name: hotel.name,
          slug: hotel.slug ?? "",
          status: hotel.status ?? "pending",
          beds24Configured: !!hotel.beds24_property_id,
          lastSyncAt: lastSync?.processed_at ?? null,
        };
      })
    );

    return { success: true, data: hotelsWithSync };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ── Bed24 Configuration ───────────────────────────────────────────

/**
 * Get Bed24 configuration for a specific hotel.
 */
export async function getBed24ConfigForHotel(
  hotelId: string
): Promise<ActionResult<Bed24Config>> {
  try {
    await assertPlatformAdmin();

    const { data: hotel, error } = await supabaseAdmin
      .from("hotels")
      .select("id, name, beds24_property_id")
      .eq("id", hotelId)
      .single();

    if (error) throw error;
    if (!hotel) throw new Error("Hotel not found");

    // Get last sync status
    const { data: lastSync } = await supabaseAdmin
      .from("beds24_sync_log")
      .select("processed_at, status")
      .eq("hotel_id", hotelId)
      .order("processed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      success: true,
      data: {
        hotelId: hotel.id,
        hotelName: hotel.name,
        propertyId: hotel.beds24_property_id ?? null,
        isConfigured: !!hotel.beds24_property_id,
        lastSyncAt: lastSync?.processed_at ?? null,
        lastSyncStatus: (lastSync?.status as "success" | "error") ?? null,
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Update Bed24 property ID for a hotel.
 */
export async function updateBed24ConfigForHotel(
  input: Bed24ConfigUpdate
): Promise<ActionResult> {
  try {
    const { adminId, adminEmail } = await assertPlatformAdmin();

    // Get current config for audit log
    const { data: currentHotel } = await supabaseAdmin
      .from("hotels")
      .select("beds24_property_id, name")
      .eq("id", input.hotelId)
      .single();

    // Update property ID
    const { error } = await supabaseAdmin
      .from("hotels")
      .update({ beds24_property_id: input.propertyId || null })
      .eq("id", input.hotelId);

    if (error) throw error;

    // Audit log
    await logPlatformAction(
      adminId,
      adminEmail,
      "update_bed24_config",
      input.hotelId,
      "bed24_config",
      null,
      { propertyId: currentHotel?.beds24_property_id },
      { propertyId: input.propertyId }
    );

    revalidatePath("/platform/dashboard/integrations");

    return {
      success: true,
      message: "Bed24 property ID updated successfully",
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Test Bed24 connection using the master token.
 */
export async function testBed24ConnectionForHotel(): Promise<
  ActionResult<ConnectionTestResult>
> {
  try {
    await assertPlatformAdmin();

    if (!isBeds24Configured()) {
      return {
        success: false,
        error: "Bed24 master credentials not configured in environment",
      };
    }

    const token = await getMasterToken();
    const result = await testBeds24Connection(token);

    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Force full availability sync for a hotel.
 */
export async function forceSyncForHotel(
  hotelId: string
): Promise<ActionResult<SyncResult>> {
  try {
    const { adminId, adminEmail } = await assertPlatformAdmin();

    // Get hotel config
    const { data: hotel } = await supabaseAdmin
      .from("hotels")
      .select("beds24_property_id, name")
      .eq("id", hotelId)
      .single();

    if (!hotel?.beds24_property_id) {
      return {
        success: false,
        error: "Bed24 property ID not configured for this hotel",
      };
    }

    if (!isBeds24Configured()) {
      return {
        success: false,
        error: "Bed24 master credentials not configured",
      };
    }

    // Get room mappings
    const { data: mappings } = await supabaseAdmin
      .from("beds24_property_mappings")
      .select("beds24_room_id, room_type_id")
      .eq("hotel_id", hotelId);

    if (!mappings?.length) {
      return {
        success: false,
        error: "No room mappings configured for this hotel",
      };
    }

    // Calculate availability for next 6 months
    const today = new Date().toISOString().split("T")[0];
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 6);
    const endDate = futureDate.toISOString().split("T")[0];

    const token = await getMasterToken();

    // Build availability blocks
    const blocks = await Promise.all(
      mappings.map(async (m) => {
        const { count: roomCount } = await supabaseAdmin
          .from("rooms")
          .select("*", { count: "exact", head: true })
          .eq("room_type_id", m.room_type_id)
          .eq("hotel_id", hotelId)
          .eq("is_active", true);

        return {
          roomId: m.beds24_room_id,
          from: today,
          to: endDate,
          availability: roomCount ?? 0,
        };
      })
    );

    // Push to Bed24
    const result = await pushAvailability({ token }, blocks);

    // Log sync attempt
    await supabaseAdmin.from("beds24_sync_log").insert({
      hotel_id: hotelId,
      direction: "outbound",
      event_type: "force_sync",
      status: result.success ? "success" : "error",
      error_message: result.error ?? null,
    });

    // Audit log
    await logPlatformAction(
      adminId,
      adminEmail,
      "force_sync",
      hotelId,
      "bed24_sync",
      null,
      null,
      {
        syncedRooms: result.success ? blocks.length : 0,
        result,
      }
    );

    revalidatePath("/platform/dashboard/integrations");

    if (result.success) {
      return {
        success: true,
        data: {
          success: true,
          syncedRooms: blocks.length,
          details: `Synced ${blocks.length} room type${blocks.length === 1 ? "" : "s"}`,
        },
      };
    } else {
      return {
        success: false,
        error: result.error ?? "Sync failed",
      };
    }
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ── Room Mappings ─────────────────────────────────────────────────

/**
 * Get all room mappings for a hotel.
 */
export async function getRoomMappingsForHotel(
  hotelId: string
): Promise<ActionResult<RoomMapping[]>> {
  try {
    await assertPlatformAdmin();

    const { data, error } = await supabaseAdmin
      .from("beds24_property_mappings")
      .select(
        `
        id,
        hotel_id,
        beds24_property_id,
        beds24_room_id,
        room_type_id,
        created_at,
        room_types (
          name,
          base_price,
          is_active
        )
      `
      )
      .eq("hotel_id", hotelId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const mappings: RoomMapping[] = (data ?? []).map((m) => ({
      id: m.id,
      hotelId: m.hotel_id,
      beds24PropertyId: m.beds24_property_id,
      beds24RoomId: m.beds24_room_id,
      roomTypeId: m.room_type_id,
      roomTypeName: (m.room_types as { name: string })?.name ?? "Unknown",
      roomTypeBasePrice:
        (m.room_types as { base_price: number })?.base_price ?? 0,
      isRoomTypeActive:
        (m.room_types as { is_active: boolean })?.is_active ?? false,
      createdAt: m.created_at ?? new Date().toISOString(),
    }));

    return { success: true, data: mappings };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Create a new room mapping.
 */
export async function createRoomMapping(
  input: RoomMappingInput
): Promise<ActionResult> {
  try {
    const { adminId, adminEmail } = await assertPlatformAdmin();

    // Check for duplicate mapping
    const { data: existing } = await supabaseAdmin
      .from("beds24_property_mappings")
      .select("id")
      .eq("hotel_id", input.hotelId)
      .eq("room_type_id", input.roomTypeId)
      .maybeSingle();

    if (existing) {
      return {
        success: false,
        error: "This room type is already mapped to a Bed24 room",
      };
    }

    // Create mapping
    const { error } = await supabaseAdmin
      .from("beds24_property_mappings")
      .insert({
        hotel_id: input.hotelId,
        beds24_property_id: input.beds24PropertyId,
        beds24_room_id: input.beds24RoomId,
        room_type_id: input.roomTypeId,
      });

    if (error) throw error;

    // Audit log
    await logPlatformAction(
      adminId,
      adminEmail,
      "create_room_mapping",
      input.hotelId,
      "room_mapping",
      input.roomTypeId,
      null,
      { ...input } as Record<string, unknown>
    );

    revalidatePath("/platform/dashboard/integrations");

    return { success: true, message: "Room mapping created successfully" };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Update an existing room mapping.
 */
export async function updateRoomMapping(
  id: string,
  input: Partial<RoomMappingInput>
): Promise<ActionResult> {
  try {
    const { adminId, adminEmail } = await assertPlatformAdmin();

    // Get current mapping for audit log
    const { data: current } = await supabaseAdmin
      .from("beds24_property_mappings")
      .select("*")
      .eq("id", id)
      .single();

    if (!current) {
      return { success: false, error: "Room mapping not found" };
    }

    // Update mapping
    const { error } = await supabaseAdmin
      .from("beds24_property_mappings")
      .update({
        beds24_property_id:
          input.beds24PropertyId ?? current.beds24_property_id,
        beds24_room_id: input.beds24RoomId ?? current.beds24_room_id,
        room_type_id: input.roomTypeId ?? current.room_type_id,
      })
      .eq("id", id);

    if (error) throw error;

    // Audit log
    await logPlatformAction(
      adminId,
      adminEmail,
      "update_room_mapping",
      current.hotel_id,
      "room_mapping",
      id,
      current,
      input
    );

    revalidatePath("/platform/dashboard/integrations");

    return { success: true, message: "Room mapping updated successfully" };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Delete a room mapping.
 */
export async function deleteRoomMapping(id: string): Promise<ActionResult> {
  try {
    const { adminId, adminEmail } = await assertPlatformAdmin();

    // Get mapping for audit log
    const { data: mapping } = await supabaseAdmin
      .from("beds24_property_mappings")
      .select("*")
      .eq("id", id)
      .single();

    if (!mapping) {
      return { success: false, error: "Room mapping not found" };
    }

    // Delete mapping
    const { error } = await supabaseAdmin
      .from("beds24_property_mappings")
      .delete()
      .eq("id", id);

    if (error) throw error;

    // Audit log
    await logPlatformAction(
      adminId,
      adminEmail,
      "delete_room_mapping",
      mapping.hotel_id,
      "room_mapping",
      id,
      mapping,
      null
    );

    revalidatePath("/platform/dashboard/integrations");

    return { success: true, message: "Room mapping deleted successfully" };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ── Sync Logs & Monitoring ────────────────────────────────────────

/**
 * Get sync logs for a hotel with optional filters.
 */
export async function getSyncLogsForHotel(
  filters: SyncLogFilters
): Promise<ActionResult<SyncLog[]>> {
  try {
    await assertPlatformAdmin();

    let query = supabaseAdmin
      .from("beds24_sync_log")
      .select(
        "id, hotel_id, direction, event_type, status, error_message, conflict_details, processed_at, beds24_booking_id, booking_id"
      )
      .eq("hotel_id", filters.hotelId)
      .order("processed_at", { ascending: false });

    if (filters.direction) {
      query = query.eq("direction", filters.direction);
    }

    if (filters.status) {
      query = query.eq("status", filters.status);
    }

    if (filters.eventType) {
      query = query.eq("event_type", filters.eventType);
    }

    if (filters.startDate) {
      query = query.gte("processed_at", filters.startDate);
    }

    if (filters.endDate) {
      query = query.lte("processed_at", filters.endDate);
    }

    query = query.limit(filters.limit ?? 50);

    const { data, error } = await query;

    if (error) throw error;

    const logs: SyncLog[] = (data ?? []).map((log) => ({
      id: log.id,
      hotelId: log.hotel_id,
      direction: log.direction as "inbound" | "outbound" | null,
      eventType: log.event_type,
      status: log.status as "success" | "error" | "pending" | null,
      errorMessage: log.error_message,
      conflictDetails: log.conflict_details as Record<string, unknown> | null,
      processedAt: log.processed_at,
      beds24BookingId: log.beds24_booking_id,
      bookingId: log.booking_id,
    }));

    return { success: true, data: logs };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Get channel statistics for a hotel.
 */
export async function getChannelStatsForHotel(
  hotelId: string
): Promise<ActionResult<ChannelStats>> {
  try {
    await assertPlatformAdmin();

    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [totalRes, successRes, errorRes, last24hRes, lastOutRes, lastInRes] =
      await Promise.all([
        supabaseAdmin
          .from("beds24_sync_log")
          .select("*", { count: "exact", head: true })
          .eq("hotel_id", hotelId),
        supabaseAdmin
          .from("beds24_sync_log")
          .select("*", { count: "exact", head: true })
          .eq("hotel_id", hotelId)
          .eq("status", "success"),
        supabaseAdmin
          .from("beds24_sync_log")
          .select("*", { count: "exact", head: true })
          .eq("hotel_id", hotelId)
          .eq("status", "error"),
        supabaseAdmin
          .from("beds24_sync_log")
          .select("*", { count: "exact", head: true })
          .eq("hotel_id", hotelId)
          .gte("processed_at", cutoff24h),
        supabaseAdmin
          .from("beds24_sync_log")
          .select("processed_at")
          .eq("hotel_id", hotelId)
          .eq("direction", "outbound")
          .eq("status", "success")
          .order("processed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from("beds24_sync_log")
          .select("processed_at")
          .eq("hotel_id", hotelId)
          .eq("direction", "inbound")
          .eq("status", "success")
          .order("processed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    const total = totalRes.count ?? 0;
    const successCount = successRes.count ?? 0;
    const errorCount = errorRes.count ?? 0;
    const last24h = last24hRes.count ?? 0;
    const successRate = total > 0 ? Math.round((successCount / total) * 100) : 100;

    return {
      success: true,
      data: {
        hotelId,
        total,
        successCount,
        errorCount,
        last24h,
        successRate,
        lastOutboundSync: lastOutRes.data?.processed_at ?? null,
        lastInboundSync: lastInRes.data?.processed_at ?? null,
      },
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Export sync logs to CSV format.
 */
export async function exportSyncLogsForHotel(
  filters: SyncLogFilters
): Promise<ActionResult<string>> {
  try {
    await assertPlatformAdmin();

    const logsResult = await getSyncLogsForHotel(filters);
    if (!logsResult.success) {
      return logsResult;
    }

    const logs = logsResult.data ?? [];

    // Build CSV
    const headers = [
      "Timestamp",
      "Direction",
      "Event Type",
      "Status",
      "Bed24 Booking ID",
      "Booking ID",
      "Error Message",
    ];

    const rows = logs.map((log) => [
      log.processedAt ?? "",
      log.direction ?? "",
      log.eventType ?? "",
      log.status ?? "",
      log.beds24BookingId ?? "",
      log.bookingId ?? "",
      log.errorMessage ?? "",
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    return { success: true, data: csv };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
