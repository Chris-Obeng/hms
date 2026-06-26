import type { CalendarRoom } from "../actions";
import { getRoomStatusColor } from "./calendar-helpers";

export interface CalendarResource {
  id: string;
  name: string;
  html?: string;
  isSectionHeader?: boolean;
  roomTypeId?: string;
  roomTypeName?: string;
  roomTypeBasePrice?: number;
  roomTypeRoomCount?: number;
  roomStatus?: string;
  floor?: string | null;
  eventClickEnabled?: boolean;
  eventMoveEnabled?: boolean;
  timeRangeSelectedEnabled?: boolean;
  height?: number;
}

export function buildResources(
  rooms: CalendarRoom[],
  _currency: string = "GHS"
): CalendarResource[] {
  void _currency;
  const resources: CalendarResource[] = [];
  const groups = new Map<
    string,
    { type: string; price: number; rooms: CalendarRoom[] }
  >();

  for (const room of rooms) {
    if (!groups.has(room.roomTypeId)) {
      groups.set(room.roomTypeId, {
        type: room.roomTypeName,
        price: room.roomTypeBasePrice,
        rooms: [],
      });
    }
    groups.get(room.roomTypeId)!.rooms.push(room);
  }

  for (const [typeId, group] of groups) {
    const availableCount = group.rooms.filter((room) => room.status === "available").length;
    const unavailableCount = group.rooms.length - availableCount;

    resources.push({
      id: `section-${typeId}`,
      name: group.type,
      html: buildSectionHeaderHtml(
        group.type,
        group.rooms.length,
        availableCount,
        unavailableCount
      ),
      isSectionHeader: true,
      roomTypeId: typeId,
      roomTypeName: group.type,
      roomTypeBasePrice: group.price,
      roomTypeRoomCount: group.rooms.length,
      eventClickEnabled: false,
      eventMoveEnabled: false,
      timeRangeSelectedEnabled: false,
      height: 36,
    });

    for (const room of group.rooms) {
      const statusInfo = getRoomStatusColor(room.status);
      resources.push({
        id: room.id,
        name: `Room ${room.roomNumber}`,
        html: buildRoomRowHtml(room.roomNumber, room.floor, room.status, statusInfo),
        roomTypeId: room.roomTypeId,
        roomTypeName: room.roomTypeName,
        roomStatus: room.status,
        floor: room.floor,
        eventClickEnabled: true,
        eventMoveEnabled: true,
        timeRangeSelectedEnabled: true,
      });
    }
  }

  return resources;
}

function buildSectionHeaderHtml(
  name: string,
  count: number,
  availableCount: number,
  _unavailableCount: number
): string {
  return `<div class="cal-section-hdr">
    <span class="cal-section-dot"></span>
    <span class="cal-section-name">${escapeHtml(name)}</span>
    <span class="cal-section-meta"><span class="cal-section-avail">${availableCount} open</span> · ${count} rooms</span>
  </div>`;
}

function buildRoomRowHtml(
  roomNumber: string,
  floor: string | null,
  status: string,
  _statusInfo: { color: string; label: string }
): string {
  // Map status to CSS class
  let statusClass = "available";
  if (status === "occupied" || status === "checked_in") statusClass = "occupied";
  else if (status === "cleaning" || status === "checkout_pending") statusClass = "cleaning";
  else if (status === "maintenance" || status === "out_of_service") statusClass = "blocked";
  
  return `<div class="cal-room-hdr">
    <span class="cal-room-dot ${statusClass}"></span>
    <div class="cal-room-info">
      <span class="cal-room-num">${escapeHtml(roomNumber)}</span>
      <span class="cal-room-status">${_statusInfo.label}</span>
    </div>
    ${floor ? `<span class="cal-room-floor">Floor ${escapeHtml(floor)}</span>` : ""}
  </div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getRoomTypeIdForResource(
  resourceId: string,
  resources: CalendarResource[]
): string | undefined {
  const resource = resources.find((row) => row.id === resourceId);
  return resource?.roomTypeId;
}
