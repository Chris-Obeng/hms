import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { CalendarClient } from "./calendar-client";
import { getCalendarData, getCurrentStaffRole } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Calendar | RoomLine",
};

export default async function CalendarPage() {
  const { orgId } = await auth();
  const supabase = await createClient();

  if (!orgId) {
    return <NoCalendarState />;
  }

  // Fetch hotel
  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, name, currency, logo_url, timezone")
    .eq("clerk_org_id", orgId)
    .single();

  if (!hotel) {
    return <NoCalendarState />;
  }

  // Fetch room types for filters + new booking sheet
  const { data: roomTypesRaw } = await supabase
    .from("room_types")
    .select("id, name, slug, base_price, sort_order")
    .eq("hotel_id", hotel.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const roomTypes = (roomTypesRaw || []).map((rt) => ({
    id: rt.id,
    name: rt.name,
    // Keep snake_case for NewBookingSheet compatibility
    base_price: rt.base_price,
  }));

  // Fetch initial calendar data (today + 30 days)
  const today = new Date().toISOString().split("T")[0];
  const initialData = await getCalendarData(today, 30);

  // Resolve staff role for permission gating
  const { canEdit, canBlock } = await getCurrentStaffRole();

  return (
    <div className="-mx-4 -mb-4 md:-mx-6 md:-mb-6 lg:-mx-8 lg:-mb-8 overflow-hidden">
      <CalendarClient
        initialData={initialData}
        roomTypes={roomTypes}
        hotelId={hotel.id}
        hotelName={hotel.name}
        currency={hotel.currency || "GHS"}
        canEdit={canEdit}
        canBlock={canBlock}
      />
    </div>
  );
}

function NoCalendarState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="size-12 rounded-full bg-muted/30 flex items-center justify-center mb-4">
        <svg className="size-6 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-foreground">Hotel not found</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        No hotel is associated with this account. Please contact support to set up your property.
      </p>
    </div>
  );
}
