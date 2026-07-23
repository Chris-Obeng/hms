import { redirect } from "next/navigation";
import { createPlatformClient } from "@/lib/supabase/platform-server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PlatformIntegrationsClient } from "./integrations-client";
import type { HotelOption } from "@/types/platform-integrations";

export const dynamic = "force-dynamic";

/**
 * Platform Admin Integrations Management Page
 * 
 * Allows platform admins to configure Bed24 integrations for all hotels.
 * Hotels cannot access this page - they have a simplified read-only view.
 */
export default async function PlatformIntegrationsPage() {
  // ── Auth Check ──────────────────────────────────────────────
  const supabase = await createPlatformClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/platform/sign-in");
  }

  // Verify platform admin role
  const { data: admin } = await supabaseAdmin
    .from("platform_admins")
    .select("id, role, is_active")
    .eq("supabase_user_id", user.id)
    .single();

  if (!admin || !admin.is_active) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <p className="text-sm font-medium text-foreground/70">
          Platform Admin Access Required
        </p>
        <p className="text-xs text-foreground/50 mt-1 max-w-md">
          This page is only accessible to platform administrators. If you believe
          you should have access, please contact the system administrator.
        </p>
      </div>
    );
  }

  // ── Load Hotels ─────────────────────────────────────────────
  const { data: hotels, error: hotelsError } = await supabaseAdmin
    .from("hotels")
    .select("id, name, slug, status, beds24_property_id")
    .order("name", { ascending: true });

  if (hotelsError || !hotels) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <p className="text-sm font-medium text-foreground/70">
          Failed to load hotels
        </p>
        <p className="text-xs text-foreground/50 mt-1 max-w-md">
          {hotelsError?.message ?? "An unexpected error occurred"}
        </p>
      </div>
    );
  }

  // Get last sync time for each hotel (in parallel, but limit to first 20)
  const hotelsWithSync = await Promise.all(
    hotels.slice(0, 20).map(async (hotel) => {
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
      } as HotelOption;
    })
  );

  // For remaining hotels (if any), add without sync time to avoid slow page load
  const remainingHotels = hotels.slice(20).map((hotel) => ({
    id: hotel.id,
    name: hotel.name,
    slug: hotel.slug ?? "",
    status: hotel.status ?? "pending",
    beds24Configured: !!hotel.beds24_property_id,
    lastSyncAt: null,
  } as HotelOption));

  const allHotels = [...hotelsWithSync, ...remainingHotels];

  // Pre-select first active hotel with Bed24 configured, or just first hotel
  const initialSelectedHotelId =
    allHotels.find((h) => h.status === "active" && h.beds24Configured)?.id ??
    allHotels[0]?.id ??
    null;

  return (
    <PlatformIntegrationsClient
      initialHotels={allHotels}
      initialSelectedHotelId={initialSelectedHotelId}
    />
  );
}
