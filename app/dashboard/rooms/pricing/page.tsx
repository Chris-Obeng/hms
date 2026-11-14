import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";

import { businessToday } from "@/lib/business-date";
import { asStaffRole, can } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

import { PricingClient } from "./pricing-client";

export const metadata = {
  title: "Rates | Oriel",
};

export default async function PricingPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const [{ orgId, userId }, params] = await Promise.all([
    auth(),
    searchParams ?? Promise.resolve({} as { tab?: string }),
  ]);

  // Seasons were removed; old ?tab=seasons links land on the rates grid.
  if (params?.tab) redirect("/dashboard/rooms/pricing");

  if (!orgId || !userId) {
    return <NoHotelState />;
  }

  const supabase = await createClient();

  const [{ data: hotel }, { data: staffProfile }] = await Promise.all([
    supabase
      .from("hotels")
      .select("id, name, currency, timezone")
      .eq("clerk_org_id", orgId)
      .maybeSingle(),
    supabase
      .from("staff_profiles")
      .select("role, is_active")
      .eq("clerk_user_id", userId)
      .eq("clerk_org_id", orgId)
      .maybeSingle(),
  ]);

  if (!hotel) {
    return <NoHotelState />;
  }

  const { data: roomTypes } = await supabase
    .from("room_types")
    .select("id, name, base_price, weekend_price, is_active")
    .eq("hotel_id", hotel.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const role = staffProfile?.is_active ? asStaffRole(staffProfile.role) : "pending";
  const canManagePricing = can(role, "pricing:manage");
  const timezone = hotel.timezone || "UTC";
  const propertyToday = businessToday(timezone);

  return (
    <PricingClient
      hotelId={hotel.id}
      orgId={orgId}
      currency={hotel.currency || "GHS"}
      hotelTimezone={timezone}
      propertyToday={propertyToday}
      canManagePricing={canManagePricing}
      roomTypes={roomTypes || []}
    />
  );
}

function NoHotelState() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <Building2 className="mb-4 size-12 text-muted-foreground/30" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-foreground">Hotel not found</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        No hotel is associated with this account.
      </p>
    </div>
  );
}
