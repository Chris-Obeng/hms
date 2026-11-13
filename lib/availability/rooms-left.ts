// Rooms left to sell per room type per night, for the rates grid.
//
// Moved unchanged from the retired /dashboard/availability page so the
// numbers staff saw there are the numbers the rates grid shows now:
// a room is taken for a night when it holds a pending, confirmed or in-house
// booking, has an availability block, or is in maintenance / out of service;
// bookings with no room assigned yet also take one room of their type.

export const ROOMS_LEFT_BOOKING_STATUSES = ["pending", "confirmed", "checked_in"] as const;

const UNSALEABLE_ROOM_STATUSES = new Set(["maintenance", "out_of_service"]);

export interface RoomsLeftInput {
  /** Active room types. */
  roomTypeIds: string[];
  /** Active rooms; rooms whose type is not in `roomTypeIds` are ignored. */
  rooms: { id: string; roomTypeId: string; status: string | null }[];
  /** Bookings in ROOMS_LEFT_BOOKING_STATUSES that overlap the dates. */
  bookings: { roomId: string | null; roomTypeId: string; checkIn: string; checkOut: string }[];
  blocks: { roomId: string; startDate: string; endDate: string }[];
  /** Nights, YYYY-MM-DD. */
  dates: string[];
}

export interface RoomsLeftResult {
  types: { roomTypeId: string; roomCount: number; cells: { date: string; available: number }[] }[];
  totals: { date: string; totalRooms: number; available: number; occupancy: number }[];
}

export function computeRoomsLeft({ roomTypeIds, rooms: allRooms, bookings, blocks, dates }: RoomsLeftInput): RoomsLeftResult {
  const typeIds = new Set(roomTypeIds);
  const rooms = allRooms
    .filter((room) => typeIds.has(room.roomTypeId))
    .map((room) => ({ ...room, status: room.status ?? "available" }));

  const types = roomTypeIds.map((roomTypeId) => {
    const typeRooms = rooms.filter((room) => room.roomTypeId === roomTypeId);
    const cells = dates.map((date) => {
      const assignedRoomIds = new Set(
        bookings
          .filter(
            (booking) =>
              booking.roomTypeId === roomTypeId &&
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
            return room?.roomTypeId === roomTypeId && date >= block.startDate && date < block.endDate;
          })
          .map((block) => block.roomId)
      );
      const unsaleableRoomIds = new Set(
        typeRooms.filter((room) => UNSALEABLE_ROOM_STATUSES.has(room.status)).map((room) => room.id)
      );
      const committedPhysicalRooms = new Set([...assignedRoomIds, ...blockedRoomIds, ...unsaleableRoomIds]);
      const unassignedDemand = bookings.filter(
        (booking) =>
          booking.roomTypeId === roomTypeId && !booking.roomId && date >= booking.checkIn && date < booking.checkOut
      ).length;
      const available = Math.max(typeRooms.length - committedPhysicalRooms.size - unassignedDemand, 0);
      return { date, available };
    });
    return { roomTypeId, roomCount: typeRooms.length, cells };
  });

  const totals = dates.map((date, index) => {
    const totalRooms = rooms.length;
    const available = types.reduce((sum, type) => sum + (type.cells[index]?.available ?? 0), 0);
    return {
      date,
      totalRooms,
      available,
      occupancy: totalRooms > 0 ? Math.round(((totalRooms - available) / totalRooms) * 100) : 0,
    };
  });

  return { types, totals };
}
