import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SimplifiedIntegrationsClient } from "./simplified-integrations-client";

export const dynamic = "force-dynamic";

/**
 * Hotel Integrations Page
 * 
 * Simplified, read-only view of integration status for hotel users.
 * No technical configuration - shows only status and support options.
 */
export default async function IntegrationsPage() {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) redirect("/sign-in");

  const supabase = await createClient();

  // Fetch hotel and verify access
  const { data: hotel, error: hotelError } = await supabase
    .from("hotels")
    .select("id, name, beds24_property_id")
    .eq("clerk_org_id", orgId)
    .single();

  if (hotelError || !hotel) {
    redirect("/dashboard");
  }

  // Check staff role
  const { data: staff } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("clerk_user_id", userId)
    .eq("clerk_org_id", orgId)
    .single();

  // Only admin and super_admin can view integrations
  const canView = staff?.role === "super_admin" || staff?.role === "admin";
  
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <p className="text-sm font-medium text-foreground/70">
          Admin Access Required
        </p>
        <p className="text-xs text-foreground/50 mt-1 max-w-md">
          Only hotel administrators can view integration settings.
        </p>
      </div>
    );
  }

  // Get Bed24 integration status
  const bed24Configured = !!hotel.beds24_property_id;

  // Get recent sync metrics (last 24 hours)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const [
    { data: lastSync },
    { count: totalSyncs },
    { count: successSyncs },
    { data: recentLogs },
  ] = await Promise.all([
    supabase
      .from("beds24_sync_log")
      .select("processed_at, direction")
      .eq("hotel_id", hotel.id)
      .eq("status", "success")
      .order("processed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("beds24_sync_log")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotel.id)
      .gte("processed_at", cutoff),
    supabase
      .from("beds24_sync_log")
      .select("*", { count: "exact", head: true })
      .eq("hotel_id", hotel.id)
      .eq("status", "success")
      .gte("processed_at", cutoff),
    supabase
      .from("beds24_sync_log")
      .select("id, processed_at, event_type, status")
      .eq("hotel_id", hotel.id)
      .order("processed_at", { ascending: false })
      .limit(10),
  ]);

  const total = totalSyncs ?? 0;
  const success = successSyncs ?? 0;
  const successRate = total > 0 ? Math.round((success / total) * 100) : 100;

  // Determine connection status
  let connectionStatus: "active" | "inactive" | "syncing" = "active";
  if (!bed24Configured) {
    connectionStatus = "inactive";
  } else if (lastSync) {
    const lastSyncTime = new Date(lastSync.processed_at).getTime();
    const hoursSinceSync = (Date.now() - lastSyncTime) / (1000 * 60 * 60);
    // If no sync in 2 hours, consider inactive
    if (hoursSinceSync > 2) {
      connectionStatus = "inactive";
    }
  }

  const bed24Metrics = bed24Configured
    ? {
        connectionStatus,
        lastSync: lastSync?.processed_at ?? null,
        successRate,
        recentActivity: (recentLogs ?? []).map((log) => ({
          id: log.id,
          timestamp: log.processed_at,
          message: getActivityMessage(log.event_type, log.status),
          status: log.status as "success" | "error",
        })),
      }
    : null;

  return (
    <SimplifiedIntegrationsClient
      hotelName={hotel.name}
      bed24Configured={bed24Configured}
      bed24Metrics={bed24Metrics}
    />
  );
}

// ── Helper Functions ──────────────────────────────────────────────

function getActivityMessage(eventType: string | null, status: string | null): string {
  const eventMessages: Record<string, string> = {
    force_sync: "Full availability sync",
    booking_created: "Booking received from channel",
    booking_cancelled: "Booking cancellation synced",
    availability_push: "Availability updated",
    webhook_received: "Channel notification received",
  };

  const message = eventType ? (eventMessages[eventType] ?? "Sync event") : "Sync event";
  return status === "success" ? message : `${message} (failed)`;
}
