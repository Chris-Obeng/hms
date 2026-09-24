import { auth } from "@clerk/nextjs/server";
import { Hotel } from "lucide-react";

import { createClient } from "@/lib/supabase/server";

import { RoomsClient, type RoomTypeGroup } from "./rooms-client";

function NoHotelState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Hotel className="mb-4 h-12 w-12 text-muted-foreground" />
      <h2 className="mb-2 text-lg font-semibold">No Hotel Found</h2>
      <p className="text-muted-foreground">
        Please set up your hotel profile to manage rooms.
      </p>
    </div>
  );
}

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgId } = await auth();

  if (!orgId) {
    return <NoHotelState />;
  }

  const supabase = await createClient();
  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, name, currency")
    .eq("clerk_org_id", orgId)
    .maybeSingle();

  if (!hotel) {
    return <NoHotelState />;
  }

  // Independent queries — resolve in one pass.
  const [{ data: roomTypes }, { data: rooms }, resolvedParams] = await Promise.all([
    supabase
      .from("room_types")
      .select("id, name, bed_configuration, max_adults, max_children, base_price, is_active, sort_order")
      .eq("hotel_id", hotel.id)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("rooms")
      .select("id, room_type_id, room_number, floor, status, is_active, notes")
      .eq("hotel_id", hotel.id)
      .order("room_number", { ascending: true }),
    searchParams,
  ]);

  const roomsByType = new Map<string, NonNullable<typeof rooms>>();
  for (const room of rooms ?? []) {
    if (!room.room_type_id) continue;
    const list = roomsByType.get(room.room_type_id) ?? [];
    list.push(room);
    roomsByType.set(room.room_type_id, list);
  }

  const groups: RoomTypeGroup[] = (roomTypes ?? []).map((roomType) => {
    const typeRooms = (roomsByType.get(roomType.id) ?? []).map((room) => ({
      id: room.id,
      roomNumber: room.room_number,
      floor: room.floor,
      status: room.status,
      isActive: room.is_active,
      notes: room.notes,
    }));

    return {
      id: roomType.id,
      name: roomType.name,
      bedConfiguration: roomType.bed_configuration,
      maxAdults: roomType.max_adults,
      maxChildren: roomType.max_children,
      basePrice: roomType.base_price ?? 0,
      isActive: roomType.is_active,
      rooms: typeRooms,
      availableRooms: typeRooms.filter((room) => room.status === "available").length,
    };
  });

  const initialSearch =
    typeof resolvedParams.search === "string" ? resolvedParams.search : undefined;

  return (
    <RoomsClient
      roomTypes={groups}
      currency={hotel.currency ?? "GHS"}
      hotelId={hotel.id}
      initialSearch={initialSearch}
    />
  );
}
