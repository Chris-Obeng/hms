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
  unavailableCount: number
): string {
  return `<div class="section-header-content">
    <span class="section-header-name">${escapeHtml(name)}</span>
    <div class="section-header-meta-row">
      <span>${count} rooms</span>
      <span class="section-header-sep">/</span>
      <span class="section-header-avail"><span class="status-dot dot-available"></span>${availableCount} open</span>
      ${unavailableCount > 0 ? `<span class="section-header-sep">/</span><span>${unavailableCount} busy</span>` : ""}
    </div>
  </div>`;
}

function buildRoomRowHtml(
  roomNumber: string,
  floor: string | null,
  status: string,
  statusInfo: { color: string; label: string }
): string {
  const floorText = floor ? `<span class="room-floor">Floor ${escapeHtml(floor)}</span>` : "";
  return `<div class="room-header-content">
    <div class="room-header-name-row">
      <span class="room-status-dot" style="background:${statusInfo.color}" title="${escapeHtml(statusInfo.label)}"></span>
      <span class="room-header-number">${escapeHtml(roomNumber)}</span>
      <span class="room-status-label">${escapeHtml(statusInfo.label)}</span>
    </div>
    ${floorText ? `<div class="room-header-sub">${floorText}</div>` : ""}
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
