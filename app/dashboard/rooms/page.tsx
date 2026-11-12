import { auth } from "@clerk/nextjs/server";
import { Hotel } from "lucide-react";

import { businessToday } from "@/lib/business-date";
import { asStaffRole, can, roleAtLeast } from "@/lib/roles";
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
  const { orgId, userId } = await auth();

  if (!orgId) {
    return <NoHotelState />;
  }

  const supabase = await createClient();
  const [{ data: hotel }, { data: staffProfile }] = await Promise.all([
    supabase
      .from("hotels")
      .select("id, name, currency, timezone")
      .eq("clerk_org_id", orgId)
      .maybeSingle(),
    userId
      ? supabase
          .from("staff_profiles")
          .select("role, is_active")
          .eq("clerk_user_id", userId)
          .eq("clerk_org_id", orgId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!hotel) {
    return <NoHotelState />;
  }

  const role = staffProfile?.is_active ? asStaffRole(staffProfile.role) : "pending";
  const canEditStatus = roleAtLeast(role, "front_desk");
  const canBlockRooms = can(role, "availability:block");
  const canManageRooms = roleAtLeast(role, "manager");
  const canDeleteRoomTypes = roleAtLeast(role, "super_admin");
  const propertyToday = businessToday(hotel.timezone || "UTC");

  // Independent queries — resolve in one pass. Active check-ins join in so an
  // occupied room can name its guest and departure date.
  const [{ data: roomTypes }, { data: rooms }, { data: activeStays }, resolvedParams] = await Promise.all([
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
    supabase
      .from("bookings")
      .select("room_id, check_out, guests(full_name)")
      .eq("hotel_id", hotel.id)
      .eq("status", "checked_in")
      .not("room_id", "is", "null"),
    searchParams,
  ]);

  // One in-house stay per room; the latest check-out wins if data ever disagrees.
  const stayByRoom = new Map<string, { guestName: string; checkOut: string }>();
  for (const stay of activeStays ?? []) {
    if (!stay.room_id) continue;
    const name = Array.isArray(stay.guests)
      ? stay.guests[0]?.full_name ?? null
      : (stay.guests as { full_name: string | null } | null)?.full_name ?? null;
    const existing = stayByRoom.get(stay.room_id);
    if (!existing || (stay.check_out ?? "") > existing.checkOut) {
      stayByRoom.set(stay.room_id, { guestName: name ?? "Guest", checkOut: stay.check_out ?? "" });
    }
  }

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
      stay: stayByRoom.get(room.id) ?? null,
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
      availableRooms: typeRooms.filter(
        (room) => room.isActive !== false && (room.status ?? "available") === "available"
      ).length,
    };
  });

  const initialSearch =
    typeof resolvedParams.search === "string" ? resolvedParams.search : undefined;

  return (
    <RoomsClient
      roomTypes={groups}
      currency={hotel.currency ?? "GHS"}
      hotelId={hotel.id}
      propertyToday={propertyToday}
      canEditStatus={canEditStatus}
      canBlockRooms={canBlockRooms}
      canManageRooms={canManageRooms}
      canDeleteRoomTypes={canDeleteRoomTypes}
      initialSearch={initialSearch}
    />
  );
}
