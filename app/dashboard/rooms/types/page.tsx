import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { Building2, DoorOpen, Plus } from "lucide-react";
import Link from "next/link";
import { RoomTypesTable } from "./room-types-table";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function RoomTypesPage() {
  const { orgId } = await auth();

  if (!orgId) {
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

  const { data: roomTypes } = await supabase
    .from("room_types")
    .select(`
      id, name, slug, short_description, bed_configuration,
      max_adults, max_children, base_price, weekend_price, amenities,
      is_active, sort_order, created_at,
      rooms:rooms(count)
    `)
    .eq("hotel_id", hotelId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const { data: rooms } = await supabase
    .from("rooms")
    .select("id, room_type_id, status")
    .eq("hotel_id", hotelId);

  const roomTypeList = (roomTypes || []).map((rt) => {
    const roomCount = (rt.rooms as unknown as { count: number }[])?.[0]?.count ?? 0;
    const roomStatuses = (rooms || [])
      .filter((r) => r.room_type_id === rt.id)
      .map((r) => r.status);

    const availableRooms = roomStatuses.filter((s) => s === "available").length;
    const occupiedRooms = roomStatuses.filter((s) => s === "occupied").length;

    return {
      id: rt.id,
      name: rt.name,
      slug: rt.slug,
      shortDescription: rt.short_description,
      bedConfiguration: rt.bed_configuration,
      maxAdults: rt.max_adults,
      maxChildren: rt.max_children,
      basePrice: rt.base_price,
      weekendPrice: rt.weekend_price,
      amenities: rt.amenities as { icon: string; label: string }[] | null,
      isActive: rt.is_active,
      sortOrder: rt.sort_order,
      roomCount,
      availableRooms,
      occupiedRooms,
      createdAt: rt.created_at,
    };
  });

  const totalRoomTypes = roomTypeList.length;
  const totalRooms = rooms?.length || 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
            Room Types
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalRoomTypes} room type{totalRoomTypes !== 1 ? "s" : ""} · {totalRooms} total room{totalRooms !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/dashboard/rooms/types/new">
          <Button
            size="sm"
            className="h-9 text-sm rounded-xl bg-foreground text-background hover:bg-foreground/90"
          >
            <Plus className="size-3.5 mr-1.5" />
            Add Room Type
          </Button>
        </Link>
      </div>

      <RoomTypesTable data={roomTypeList} currency={hotel?.currency || "GHS"} />
    </div>
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
