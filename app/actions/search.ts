"use server";

import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export interface SearchResult {
  id: string;
  type: "guest" | "booking" | "room";
  label: string;
  subLabel: string;
  url: string;
}

export async function searchGlobal(
  query: string
): Promise<{ success: true; data: SearchResult[] } | { success: false; error: string }> {
  try {
    const ctx = await requireAuth();
    const supabase = await createClient();
    const q = query.trim();

    if (!q) {
      return { success: true, data: [] };
    }

    const hotelId = ctx.hotelId;
    const results: SearchResult[] = [];

    // 1. Search guests (by name, email, phone)
    const { data: guests, error: guestsError } = await supabase
      .from("guests")
      .select("id, full_name, email, phone")
      .eq("hotel_id", hotelId)
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(5);

    if (guestsError) {
      console.error("Guest search error:", guestsError);
    } else if (guests) {
      for (const guest of guests) {
        results.push({
          id: `guest-${guest.id}`,
          type: "guest",
          label: guest.full_name,
          subLabel: guest.email || guest.phone || "Guest Profile",
          url: `/dashboard/customers?guestId=${guest.id}`,
        });
      }
    }

    // 2. Search bookings by reference and matching guests
    const allBookingsMap = new Map<string, SearchResult>();

    // 2a. Search by reference
    const { data: bookingsByRef, error: bookingsByRefError } = await supabase
      .from("bookings")
      .select(`
        id, 
        reference,
        guests:guest_id (
          full_name
        )
      `)
      .eq("hotel_id", hotelId)
      .ilike("reference", `%${q}%`)
      .limit(5);

    if (bookingsByRefError) {
      console.error("Booking reference search error:", bookingsByRefError);
    } else if (bookingsByRef) {
      for (const b of bookingsByRef) {
        const guestName = b.guests ? (b.guests as any).full_name : "";
        allBookingsMap.set(b.id, {
          id: `booking-${b.id}`,
          type: "booking",
          label: `Booking ${b.reference}`,
          subLabel: guestName ? `Guest: ${guestName}` : "Booking",
          url: `/dashboard/bookings/${b.id}`,
        });
      }
    }

    // 2b. Search by guest ID matches
    if (guests && guests.length > 0) {
      const guestIds = guests.map((g) => g.id);
      const { data: bookingsByGuest, error: bookingsByGuestError } = await supabase
        .from("bookings")
        .select(`
          id, 
          reference,
          guests:guest_id (
            full_name
          )
        `)
        .eq("hotel_id", hotelId)
        .in("guest_id", guestIds)
        .limit(5);

      if (bookingsByGuestError) {
        console.error("Booking guest ID search error:", bookingsByGuestError);
      } else if (bookingsByGuest) {
        for (const b of bookingsByGuest) {
          if (!allBookingsMap.has(b.id)) {
            const guestName = b.guests ? (b.guests as any).full_name : "";
            allBookingsMap.set(b.id, {
              id: `booking-${b.id}`,
              type: "booking",
              label: `Booking ${b.reference}`,
              subLabel: guestName ? `Guest: ${guestName}` : "Booking",
              url: `/dashboard/bookings/${b.id}`,
            });
          }
        }
      }
    }

    // Merge bookings into final results
    results.push(...Array.from(allBookingsMap.values()));

    // 3. Search rooms
    const { data: rooms, error: roomsError } = await supabase
      .from("rooms")
      .select("id, room_number, status")
      .eq("hotel_id", hotelId)
      .ilike("room_number", `%${q}%`)
      .limit(5);

    if (roomsError) {
      console.error("Room search error:", roomsError);
    } else if (rooms) {
      for (const room of rooms) {
        const statusLabel = room.status 
          ? room.status.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
          : "Unknown";
        results.push({
          id: `room-${room.id}`,
          type: "room",
          label: `Room ${room.room_number}`,
          subLabel: `Status: ${statusLabel}`,
          url: `/dashboard/rooms/directory?search=${room.room_number}`,
        });
      }
    }

    return { success: true, data: results };
  } catch (error: any) {
    console.error("Global search server action error:", error);
    return { success: false, error: error.message || "Search failed" };
  }
}
