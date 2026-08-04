import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { Building2 } from "lucide-react";
import { PricingClient } from "./pricing-client";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const { orgId, userId } = await auth();

  if (!orgId || !userId) {
    return <NoHotelState />;
  }

  const supabase = await createClient();

  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, name, currency")
    .eq("clerk_org_id", orgId)
    .single();

  const hotelId = hotel?.id;

  if (!hotelId) {
    return <NoHotelState />;
  }

  // Get active room types for pricing
  const { data: roomTypes } = await supabase
    .from("room_types")
    .select("id, name, base_price, weekend_price, is_active")
    .eq("hotel_id", hotelId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  return (
    <PricingClient
      hotelId={hotelId}
      orgId={orgId}
      currency={hotel.currency || "GHS"}
      roomTypes={roomTypes || []}
    />
  );
}

function NoHotelState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <Building2 className="size-12 text-muted-foreground/30 mb-4" />
      <h2 className="text-lg font-semibold text-foreground">Hotel not found</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        No hotel is associated with this account.
      </p>
    </div>
  );
}
