import { auth } from "@clerk/nextjs/server";
import { Hotel } from "lucide-react";

import { businessToday } from "@/lib/business-date";
import { asStaffRole, can, roleAtLeast } from "@/lib/roles";
import { countAvailableRooms } from "@/lib/rooms/room-state";
import { createClient } from "@/lib/supabase/server";

import { RoomsClient, type RoomTypeGroup } from "./rooms-client";

function NoHotelState() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-muted-foreground">
        <Hotel className="size-5" aria-hidden="true" />
      </span>
      <h2 className="text-sm font-semibold text-foreground">No hotel on this account</h2>
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
  const canBlockRooms = can(role, "availability:block");
  const canManageRooms = roleAtLeast(role, "manager");
  const canDeleteRoomTypes = roleAtLeast(role, "super_admin");
  const propertyToday = businessToday(hotel.timezone || "UTC");

  // Independent queries — resolve in one pass. Active check-ins join in so an
  // occupied room can name its guest and departure date; blocks covering today
  // mark a room blocked. A block's end_date is exclusive (the day it frees up).
  const [{ data: roomTypes }, { data: rooms }, { data: activeStays }, { data: blocksToday }, resolvedParams] =
    await Promise.all([
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
      supabase
        .from("availability_blocks")
        .select("room_id, reason, end_date")
        .eq("hotel_id", hotel.id)
        .lte("start_date", propertyToday)
        .gt("end_date", propertyToday),
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

  // One block per room; the one that ends last says when the room frees up.
  const blockByRoom = new Map<string, { reason: string | null; endDate: string }>();
  for (const block of blocksToday ?? []) {
    const existing = blockByRoom.get(block.room_id);
    if (!existing || block.end_date > existing.endDate) {
      blockByRoom.set(block.room_id, { reason: block.reason, endDate: block.end_date });
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
      block: blockByRoom.get(room.id) ?? null,
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
      availableRooms: countAvailableRooms(typeRooms),
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
      timeZone={hotel.timezone || "UTC"}
      canBlockRooms={canBlockRooms}
      canManageRooms={canManageRooms}
      canDeleteRoomTypes={canDeleteRoomTypes}
      initialSearch={initialSearch}
    />
  );
}
