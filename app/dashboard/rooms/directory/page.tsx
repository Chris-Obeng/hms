import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { Building2 } from "lucide-react";
import { RoomsDirectory } from "./rooms-directory-client";
export default async function RoomsDirectoryPage() {
  const { orgId } = await auth();

  if (!orgId) {
    return <NoHotelState />;
  }

  const supabase = await createClient();

  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, name")
    .eq("clerk_org_id", orgId)
    .single();

  const hotelId = hotel?.id;

  if (!hotelId) {
    return <NoHotelState />;
  }

  const { data: rooms } = await supabase
    .from("rooms")
    .select(`
      id, room_number, floor, status, is_active, notes, created_at,
      room_types!inner(id, name, slug)
    `)
    .eq("hotel_id", hotelId)
    .order("room_number", { ascending: true });

  const { data: roomTypes } = await supabase
    .from("room_types")
    .select("id, name")
    .eq("hotel_id", hotelId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  const roomList = (rooms || []).map((r) => ({
    id: r.id,
    roomNumber: r.room_number,
    floor: r.floor,
    status: r.status,
    isActive: r.is_active,
    notes: r.notes,
    roomTypeId: r.room_types.id,
    roomTypeName: r.room_types.name,
    roomTypeSlug: r.room_types.slug,
    createdAt: r.created_at,
  }));

  const types = (roomTypes || []).map((rt) => ({
    id: rt.id,
    name: rt.name,
  }));

  const totalRooms = roomList.length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-page-title text-foreground">
          Room Directory
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {totalRooms} room{totalRooms !== 1 ? "s" : ""} · Manage room status and availability
        </p>
      </div>

      <RoomsDirectory data={roomList} roomTypes={types} hotelId={hotelId} />
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
