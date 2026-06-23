import { auth } from "@clerk/nextjs/server";
import { addDays, format, isValid, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { AvailabilityMatrixClient, type AvailabilityMatrixData } from "./availability-matrix-client";
import "./availability.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Availability | HotelOS",
};

type PageProps = {
  searchParams?: Promise<{
    start?: string;
    days?: string;
  }>;
};

const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed", "checked_in"] as const;
const UNSALEABLE_ROOM_STATUSES = new Set(["maintenance", "out_of_service"]);

export default async function AvailabilityPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const startDate = parseStartDate(params.start);
  const days = parseDayCount(params.days);
  const data = await getAvailabilityMatrixData(startDate, days);

  if (!data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted/40">
          <span className="text-lg font-semibold text-muted-foreground">A</span>
        </div>
        <h1 className="text-lg font-semibold text-foreground">Hotel not found</h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          No active hotel is linked to this staff account.
        </p>
      </div>
    );
  }

  return <AvailabilityMatrixClient data={data} />;
}

function parseStartDate(value?: string) {
  if (!value) return new Date();
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : new Date();
}

function parseDayCount(value?: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 14;
  return Math.min(Math.max(Math.trunc(parsed), 7), 45);
}

async function getAvailabilityMatrixData(
  startDate: Date,
  days: number
): Promise<AvailabilityMatrixData | null> {
  const { orgId } = await auth();
  if (!orgId) return null;

  const supabase = await createClient();
  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, name, currency")
    .eq("clerk_org_id", orgId)
    .single();

  if (!hotel) return null;

  const start = format(startDate, "yyyy-MM-dd");
  const end = format(addDays(startDate, days), "yyyy-MM-dd");
  const dateKeys = Array.from({ length: days }, (_, index) =>
    format(addDays(startDate, index), "yyyy-MM-dd")
  );

  const [roomTypesResult, roomsResult, bookingsResult, blocksResult] = await Promise.all([
    supabase
      .from("room_types")
      .select("id, name, slug, base_price, sort_order")
      .eq("hotel_id", hotel.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("rooms")
      .select("id, room_number, floor, status, room_type_id")
      .eq("hotel_id", hotel.id)
      .eq("is_active", true)
      .order("room_number", { ascending: true }),
    supabase
      .from("bookings")
      .select(`
        id, reference, room_id, room_type_id,
        check_in, check_out, status, source, payment_status,
        guests(full_name)
      `)
      .eq("hotel_id", hotel.id)
      .in("status", [...ACTIVE_BOOKING_STATUSES])
      .lt("check_in", end)
      .gt("check_out", start)
      .order("check_in", { ascending: true }),
    supabase
      .from("availability_blocks")
      .select("id, room_id, start_date, end_date, reason, notes")
      .eq("hotel_id", hotel.id)
      .lt("start_date", end)
      .gt("end_date", start)
      .order("start_date", { ascending: true }),
  ]);

  const roomTypes = (roomTypesResult.data ?? []).map((roomType) => ({
    id: roomType.id,
    name: roomType.name,
    slug: roomType.slug,
    basePrice: Number(roomType.base_price ?? 0),
    sortOrder: roomType.sort_order ?? 0,
  }));

  const roomTypeById = new Map(roomTypes.map((roomType) => [roomType.id, roomType]));
  const rooms = (roomsResult.data ?? [])
    .filter((room) => roomTypeById.has(room.room_type_id))
    .map((room) => ({
      id: room.id,
      roomNumber: room.room_number,
      floor: room.floor,
      status: room.status ?? "available",
      roomTypeId: room.room_type_id,
      roomTypeName: roomTypeById.get(room.room_type_id)?.name ?? "Room type",
    }))
    .sort((a, b) => {
      const typeSort =
        (roomTypeById.get(a.roomTypeId)?.sortOrder ?? 0) -
          (roomTypeById.get(b.roomTypeId)?.sortOrder ?? 0) ||
        a.roomTypeName.localeCompare(b.roomTypeName);
      if (typeSort !== 0) return typeSort;
      return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
    });

  const bookings = (bookingsResult.data ?? []).map((booking) => ({
    id: booking.id,
    reference: booking.reference,
    roomId: booking.room_id,
    roomTypeId: booking.room_type_id,
    checkIn: booking.check_in,
    checkOut: booking.check_out,
    status: booking.status,
    source: booking.source,
    paymentStatus: booking.payment_status,
    guestName:
      ((booking.guests as { full_name?: string | null } | null)?.full_name as string | null) ??
      null,
  }));

  const blocks = (blocksResult.data ?? []).map((block) => ({
    id: block.id,
    roomId: block.room_id,
    startDate: block.start_date,
    endDate: block.end_date,
    reason: block.reason,
    notes: block.notes,
  }));

  const roomTypeRows: AvailabilityMatrixData["roomTypeRows"] = roomTypes.map((roomType) => {
    const typeRooms = rooms.filter((room) => room.roomTypeId === roomType.id);
    const cells = dateKeys.map((date) => {
      const assignedRoomIds = new Set(
        bookings
          .filter(
            (booking) =>
              booking.roomTypeId === roomType.id &&
              booking.roomId &&
              date >= booking.checkIn &&
              date < booking.checkOut
          )
          .map((booking) => booking.roomId as string)
      );
      const blockedRoomIds = new Set(
        blocks
          .filter((block) => {
            const room = rooms.find((item) => item.id === block.roomId);
            return room?.roomTypeId === roomType.id && date >= block.startDate && date < block.endDate;
          })
          .map((block) => block.roomId)
      );
      const unsaleableRoomIds = new Set(
        typeRooms
          .filter((room) => UNSALEABLE_ROOM_STATUSES.has(room.status))
          .map((room) => room.id)
      );
      const committedPhysicalRooms = new Set([
        ...assignedRoomIds,
        ...blockedRoomIds,
        ...unsaleableRoomIds,
      ]);
      const unassignedDemand = bookings.filter(
        (booking) =>
          booking.roomTypeId === roomType.id &&
          !booking.roomId &&
          date >= booking.checkIn &&
          date < booking.checkOut
      ).length;
      const arrivals = bookings.filter(
        (booking) => booking.roomTypeId === roomType.id && booking.checkIn === date
      ).length;
      const departures = bookings.filter(
        (booking) => booking.roomTypeId === roomType.id && booking.checkOut === date
      ).length;
      const available = Math.max(typeRooms.length - committedPhysicalRooms.size - unassignedDemand, 0);
      const occupancy = typeRooms.length > 0
        ? Math.round(((typeRooms.length - available) / typeRooms.length) * 100)
        : 0;

      return {
        date,
        totalRooms: typeRooms.length,
        available,
        assigned: assignedRoomIds.size,
        blocked: blockedRoomIds.size,
        unsaleable: unsaleableRoomIds.size,
        unassignedDemand,
        arrivals,
        departures,
        occupancy,
      };
    });

    return {
      id: roomType.id,
      name: roomType.name,
      basePrice: roomType.basePrice,
      roomCount: typeRooms.length,
      cells,
    };
  });

  const roomRows: AvailabilityMatrixData["roomRows"] = rooms.map((room) => {
    const cells: AvailabilityMatrixData["roomRows"][number]["cells"] = dateKeys.map((date) => {
      const booking = bookings.find(
        (item) => item.roomId === room.id && date >= item.checkIn && date < item.checkOut
      );
      const block = blocks.find(
        (item) => item.roomId === room.id && date >= item.startDate && date < item.endDate
      );
      const arrival = bookings.some((item) => item.roomId === room.id && item.checkIn === date);
      const departure = bookings.some((item) => item.roomId === room.id && item.checkOut === date);

      if (booking) {
        return {
          date,
          state: booking.status === "checked_in" ? "in_house" : "reserved",
          label: booking.guestName || booking.reference,
          reference: booking.reference,
          arrival,
          departure,
        };
      }
      if (block) {
        return {
          date,
          state: "blocked",
          label: titleCase(block.reason?.replace(/_/g, " ") || "Blocked"),
          reference: null,
          arrival,
          departure,
        };
      }
      if (UNSALEABLE_ROOM_STATUSES.has(room.status)) {
        return {
          date,
          state: "unsaleable",
          label: room.status.replace(/_/g, " "),
          reference: null,
          arrival,
          departure,
        };
      }
      return {
        date,
        state: "open",
        label: "Open",
        reference: null,
        arrival,
        departure,
      };
    });

    return {
      id: room.id,
      roomNumber: room.roomNumber,
      floor: room.floor,
      status: room.status,
      roomTypeId: room.roomTypeId,
      roomTypeName: room.roomTypeName,
      cells,
    };
  });

  const totals = dateKeys.map((date) => {
    const totalRooms = rooms.length;
    const available = roomTypeRows.reduce(
      (sum, row) => sum + (row.cells.find((cell) => cell.date === date)?.available ?? 0),
      0
    );
    return {
      date,
      totalRooms,
      available,
      sold: Math.max(totalRooms - available, 0),
      occupancy: totalRooms > 0 ? Math.round(((totalRooms - available) / totalRooms) * 100) : 0,
    };
  });

  return {
    hotelName: hotel.name,
    currency: hotel.currency || "GHS",
    startDate: start,
    days,
    dates: dateKeys,
    roomTypes,
    totals,
    roomTypeRows,
    roomRows,
    generatedAt: new Date().toISOString(),
  };
}

function titleCase(value: string) {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}
