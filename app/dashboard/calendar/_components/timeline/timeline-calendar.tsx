"use client";
/* eslint-disable react-hooks/refs, react-hooks/incompatible-library */

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { AlertTriangle, BedDouble, GripVertical, Lock, Wand2 } from "lucide-react";
import { Button, Tooltip } from "@heroui/react";
import { cn } from "@/lib/utils";
import type { CalendarAvailabilityBlock, CalendarBooking, CalendarRoom } from "../../actions";
import { businessToday } from "@/lib/business-date";
import { getBookingBarColor, groupAccent, isManualLikeSource, NON_BOOKABLE_ROOM_STATUSES, TERMINAL_BOOKING_STATUS_SET } from "../calendar-helpers";
import {
  bookingGeometry,
  clampBarGeometry,
  columnToDate,
  dateToColumn,
  DAY_WIDTH,
  HEADER_HEIGHT,
  pointToCell,
  rangeOverlaps,
  ROOM_COLUMN_WIDTH,
  ROW_HEIGHT,
} from "./timeline-geometry";
import { findTimelineConflicts, validateTimelineDrop } from "./timeline-conflicts";

type DragKind = "booking" | "resize-left" | "resize-right";

type DragData = { kind: DragKind; bookingId: string };

interface DragTarget {
  roomIndex: number;
  column: number;
}

interface DragState {
  kind: DragKind;
  bookingId: string;
  target: DragTarget | null;
  overTray: boolean;
  error: string | null;
  typeChange: boolean;
}

export interface TypeChangeRequest {
  bookingId: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  fromRoomTypeId: string | null;
  toRoomTypeId: string;
}

type Props = {
  startDate: Date;
  days: number;
  rooms: CalendarRoom[];
  bookings: CalendarBooking[];
  blocks: CalendarAvailabilityBlock[];
  canEdit: boolean;
  /** Property timezone — drives the business date used by the past-drop rule and today marker. */
  hotelTimezone: string;
  /** Asserted on mount and by the Today control — the only moments the
   *  scrollport may jump to the today column. Manual navigation, filtering
   *  and realtime updates never touch the user's scroll position. */
  todayAnchor?: number;
  /** Bookings to pulse (recently created). */
  highlightIds?: Set<string>;
  onOpenBooking(id: string): void;
  onOpenBlock?(block: CalendarAvailabilityBlock): void;
  onCreate(room: CalendarRoom, date: string): void;
  onChange(booking: CalendarBooking, roomId: string | null, checkIn: string, checkOut: string): Promise<void>;
  onAutoAssign(bookingId: string): void;
  onRequestTypeChange(request: TypeChangeRequest): void;
};

/** Extract the client point from a pointer/mouse/touch activation event. */
function eventClientPoint(event: Event | null): { x: number; y: number } | null {
  if (!event) return null;
  const source = event as unknown as { clientX?: number; clientY?: number; touches?: ArrayLike<{ clientX: number; clientY: number }> };
  if (typeof source.clientX === "number" && typeof source.clientY === "number") {
    return { x: source.clientX, y: source.clientY };
  }
  const touch = source.touches?.[0];
  if (touch) return { x: touch.clientX, y: touch.clientY };
  return null;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.max(1, differenceInCalendarDays(parseISO(checkOut), parseISO(checkIn)));
}

/** Resolve the tentative stay dates for a drag gesture at a given cell. */
function resolveDragDates(
  kind: DragKind,
  booking: CalendarBooking,
  column: number,
  startDate: string,
): { checkIn: string; checkOut: string } {
  const date = columnToDate(column, startDate);
  switch (kind) {
    case "booking": {
      const nights = nightsBetween(booking.checkIn, booking.checkOut);
      return { checkIn: date, checkOut: format(addDays(parseISO(date), nights), "yyyy-MM-dd") };
    }
    case "resize-left":
      return { checkIn: date, checkOut: booking.checkOut };
    case "resize-right":
      return { checkIn: booking.checkIn, checkOut: format(addDays(parseISO(date), 1), "yyyy-MM-dd") };
  }
}

interface BarVisuals {
  bg: string;
  border: string;
}

function BookingBar({
  booking,
  conflict,
  canEdit,
  onOpen,
}: {
  booking: CalendarBooking;
  conflict: boolean;
  canEdit: boolean;
  onOpen(): void;
}) {
  // Terminal statuses are historical records — visible when scrolling back,
  // never movable.
  const editable = canEdit && !TERMINAL_BOOKING_STATUS_SET.has(booking.status);
  const drag = useDraggable({ id: `booking:${booking.id}`, disabled: !editable, data: { kind: "booking", bookingId: booking.id } satisfies DragData });
  const left = useDraggable({ id: `left:${booking.id}`, disabled: !editable, data: { kind: "resize-left", bookingId: booking.id } satisfies DragData });
  const right = useDraggable({ id: `right:${booking.id}`, disabled: !editable, data: { kind: "resize-right", bookingId: booking.id } satisfies DragData });
  const colors = getBookingBarColor(booking.status, booking.source);
  const accent = groupAccent(booking.groupId);
  const isDragging = drag.isDragging || left.isDragging || right.isDragging;
  return (
    <div
      className={cn("rl-booking-bar", conflict && "is-conflict", isDragging && "is-dragging", !editable && "is-terminal")}
      data-group={accent ? "true" : undefined}
      style={{
        background: `linear-gradient(180deg, color-mix(in srgb, ${colors.bg} 84%, white) 0%, ${colors.bg} 52%, color-mix(in srgb, ${colors.bg} 90%, black) 100%)`,
        borderColor: conflict ? "var(--destructive)" : colors.border,
        ...(accent ? { "--rl-group-accent": accent } as React.CSSProperties : {}),
      }}
    >
      {editable && (
        <>
          {/* Handles are SIBLINGS of the move surface. Nesting them inside the
              move-draggable lets pointerdown bubble and resize degrade into a
              move. */}
          <div
            ref={left.setNodeRef}
            {...left.listeners}
            {...left.attributes}
            role="button"
            tabIndex={0}
            aria-label="Resize check-in"
            className="rl-resize-handle left"
            onClick={(e) => e.stopPropagation()}
          />
          <div
            ref={right.setNodeRef}
            {...right.listeners}
            {...right.attributes}
            role="button"
            tabIndex={0}
            aria-label="Resize check-out"
            className="rl-resize-handle right"
            onClick={(e) => e.stopPropagation()}
          />
        </>
      )}
      <div
        ref={drag.setNodeRef}
        {...drag.listeners}
        {...drag.attributes}
        role="button"
        tabIndex={0}
        aria-label={`${booking.guestName ?? "Guest"}, room ${booking.roomNumber ?? "unassigned"}, ${booking.checkIn} to ${booking.checkOut}, ${booking.status.replaceAll("_", " ")}${accent ? ", part of a multi-room reservation" : ""}${(booking.roomsCount ?? 0) > 1 ? `, ${booking.roomsCount} rooms` : ""}${conflict ? ", conflict" : ""}`}
        onClick={onOpen}
        className="rl-booking-move"
      >
        {editable && <GripVertical className="rl-booking-grip" aria-hidden />}
        <span className="rl-booking-name">{booking.guestName ?? "Guest"}</span>
        {(booking.roomsCount ?? 0) > 1 && (
          <span className="rl-booking-rooms" aria-hidden>
            ×{booking.roomsCount}
          </span>
        )}
        <span className={cn("rl-booking-pay", booking.paymentStatus === "paid" ? "is-paid" : "is-due")}>
          {booking.paymentStatus === "paid" ? "Paid" : "Due"}
        </span>
        {conflict && <AlertTriangle className="size-3.5 shrink-0 text-white drop-shadow-sm" aria-hidden />}
      </div>
    </div>
  );
}

function TrayBooking({ booking, onOpen, onAutoAssign }: { booking: CalendarBooking; onOpen(): void; onAutoAssign(): void }) {
  const drag = useDraggable({ id: `booking:${booking.id}`, data: { kind: "booking", bookingId: booking.id } satisfies DragData });
  const nights = nightsBetween(booking.checkIn, booking.checkOut);
  return (
    <div className={cn("rl-tray-booking", drag.isDragging && "is-dragging")} title={`${booking.guestName ?? booking.reference} · ${nights}n`}>
      <button
        ref={drag.setNodeRef}
        {...drag.listeners}
        {...drag.attributes}
        className="rl-tray-main"
        onClick={onOpen}
        aria-label={`Open ${booking.guestName ?? booking.reference}, unassigned, ${nights} nights`}
      >
        <BedDouble className="size-4 shrink-0 opacity-70" />
        <span className="truncate">{booking.guestName ?? booking.reference}</span>
      </button>
      <span className="rl-tray-nights tabular-nums">{nights}n</span>
      <Tooltip delay={200}>
        <Tooltip.Trigger>
          <Button variant="ghost" size="sm" isIconOnly aria-label={`Auto-assign ${booking.guestName ?? booking.reference}`} onPress={onAutoAssign} className="size-6 min-h-6 rounded-md">
            <Wand2 className="size-3" />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content placement="top">Auto-assign best room</Tooltip.Content>
      </Tooltip>
    </div>
  );
}

interface RowProps {
  room: CalendarRoom;
  bookings: CalendarBooking[];
  blocks: CalendarAvailabilityBlock[];
  conflicts: Set<string>;
  canEdit: boolean;
  start: string;
  days: number;
  highlightIds: Set<string> | null;
  onOpenBooking(id: string): void;
  onOpenBlock?(block: CalendarAvailabilityBlock): void;
  onCreate(room: CalendarRoom, date: string): void;
}

/** Rooms in these states cannot take any booking — the row is hatched and
 *  creation/drops are rejected. */
const NON_BOOKABLE = NON_BOOKABLE_ROOM_STATUSES;

/** Shared empty arrays so rooms with nothing scheduled keep stable props and
 *  stay memoized through unrelated renders (search keystrokes, drag moves). */
const EMPTY_BOOKINGS: CalendarBooking[] = [];
const EMPTY_BLOCKS: CalendarAvailabilityBlock[] = [];

const RoomRow = React.memo(function RoomRow({ room, bookings, blocks, conflicts, canEdit, start, days, highlightIds, onOpenBooking, onOpenBlock, onCreate }: RowProps) {
  const notBookable = NON_BOOKABLE.has(room.status ?? "");
  return (
    <div className="rl-room-row" style={{ height: ROW_HEIGHT }}>
      <div className="rl-room-label" style={{ width: ROOM_COLUMN_WIDTH }} data-status={room.status}>
        <strong>
          {room.roomNumber}
          {notBookable && (
            <span className={`rl-room-flag rl-room-flag--${room.status}`}>
              {room.status === "maintenance" ? "Maintenance" : "Out of order"}
            </span>
          )}
        </strong>
        <span>{room.roomTypeName}</span>
        <i className={`status ${room.status}`} />
      </div>
      <div
        className={cn("rl-room-grid", notBookable && "is-non-bookable")}
        style={{ left: ROOM_COLUMN_WIDTH, width: days * DAY_WIDTH, backgroundSize: `${DAY_WIDTH}px 100%` }}
        onDoubleClick={(e) => {
          if (notBookable) return; // no creation on maintenance / OOS rooms
          const box = e.currentTarget.getBoundingClientRect();
          onCreate(room, columnToDate(Math.floor((e.clientX - box.left) / DAY_WIDTH), start));
        }}
      >
        {notBookable && (
          <div
            aria-hidden
            className="rl-oos-veil"
            title={room.status === "maintenance" ? "Room under maintenance — not sellable" : "Room out of service — not sellable"}
          />
        )}
        {blocks.map((block) => {
          const g = bookingGeometry(block.startDate, block.endDate, start);
          const clipped = clampBarGeometry(g, days);
          if (!clipped.visible) return null;
          return (
            <button
              key={block.id}
              type="button"
              className="rl-block-bar"
              style={{ left: clipped.left, width: clipped.width }}
              title="View block details"
              aria-label={`Blocked room, ${block.reason?.replaceAll("_", " ") || "unspecified reason"}, ${block.startDate} to ${block.endDate}. View details.`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenBlock?.(block);
              }}
            >
              <Lock aria-hidden className="rl-block-lock" />
              <span>{block.reason?.replaceAll("_", " ") || "Blocked"}</span>
            </button>
          );
        })}
        {bookings.map((b) => {
          const g = bookingGeometry(b.checkIn, b.checkOut, start);
          const clipped = clampBarGeometry(g, days);
          if (!clipped.visible) return null;
          return (
            <div
              key={b.id}
              className={cn("rl-bar-slot", highlightIds?.has(b.id) && "rl-bar-new")}
              style={{ position: "absolute", left: clipped.left, width: clipped.width, top: 8, height: 36 }}
            >
              <BookingBar booking={b} conflict={conflicts.has(b.id)} canEdit={canEdit} onOpen={() => onOpenBooking(b.groupId ?? b.id)} />
            </div>
          );
        })}
      </div>
    </div>
  );
});

export function TimelineCalendar({ startDate, days, rooms, bookings, blocks, canEdit, hotelTimezone, todayAnchor = 0, highlightIds, onOpenBooking, onOpenBlock, onCreate, onChange, onAutoAssign, onRequestTypeChange }: Props) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const trayRef = React.useRef<HTMLDivElement>(null);
  const [activeDrag, setActiveDrag] = React.useState<DragState | null>(null);
  const [dragWidth, setDragWidth] = React.useState<number | null>(null);
  const activeRef = React.useRef<DragState | null>(null);
  const quantKeyRef = React.useRef("");
  const suppressClickRef = React.useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const start = format(startDate, "yyyy-MM-dd");
  const todayKey = businessToday(hotelTimezone);
  const todayColumn = dateToColumn(todayKey, start);
  const todayColumnVisible = todayColumn >= 0 && todayColumn < days;

  // Scroll the today column to the left edge only when the anchor is
  // (re)asserted — first paint and the Today button. Runs before paint so
  // the user never sees the pre-anchor scroll position.
  React.useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (scroller && todayColumnVisible) {
      scroller.scrollLeft = todayColumn * DAY_WIDTH;
    }
    // todayColumn/todayColumnVisible are derived; re-running on them would
    // hijack scrolling on every navigation — anchor assertions only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayAnchor]);
  const conflicts = React.useMemo(() => findTimelineConflicts(bookings), [bookings]);

  const assignedByRoom = React.useMemo(() => {
    const map = new Map<string, CalendarBooking[]>();
    for (const b of bookings) {
      if (!b.roomId) continue;
      const list = map.get(b.roomId) ?? [];
      list.push(b);
      map.set(b.roomId, list);
    }
    return map;
  }, [bookings]);

  const blocksByRoom = React.useMemo(() => {
    const map = new Map<string, CalendarAvailabilityBlock[]>();
    for (const b of blocks) {
      const list = map.get(b.roomId) ?? [];
      list.push(b);
      map.set(b.roomId, list);
    }
    return map;
  }, [blocks]);

  // Tray is operational: only bookings that can still be placed.
  const unassigned = React.useMemo(
    () => bookings.filter((b) => !b.roomId && !TERMINAL_BOOKING_STATUS_SET.has(b.status)),
    [bookings],
  );
  const bookingById = React.useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings]);

  const virtualizer = useVirtualizer({ count: rooms.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_HEIGHT, overscan: 10 });
  const dates = React.useMemo(() => Array.from({ length: days }, (_, i) => addDays(startDate, i)), [startDate, days]);

  // Column indices that fall on Sat/Sun. Header cells get the wash via
  // [data-dow] in calendar.css; these indices drive the full-height overlays.
  const weekendColumns = React.useMemo(
    () =>
      dates.reduce<number[]>((acc, d, index) => {
        const dow = d.getDay();
        if (dow === 0 || dow === 6) acc.push(index);
        return acc;
      }, []),
    [dates],
  );

  const setDragState = React.useCallback((next: DragState | null) => {
    activeRef.current = next;
    setActiveDrag(next);
  }, []);

  /** Fast overlap probe against the hovered room only (O(bookings-in-room)). */
  const findConflictInRoom = React.useCallback(
    (roomId: string, checkIn: string, checkOut: string, excludeId: string): string | null => {
      for (const other of assignedByRoom.get(roomId) ?? []) {
        if (other.id === excludeId || TERMINAL_BOOKING_STATUS_SET.has(other.status)) continue;
        if (rangeOverlaps(checkIn, checkOut, other.checkIn, other.checkOut)) return other.guestName || other.reference;
      }
      return null;
    },
    [assignedByRoom],
  );

  const evaluateTarget = React.useCallback(
    (state: DragState): DragState => {
      const booking = bookingById.get(state.bookingId);
      if (!state.target || !booking) return state;
      const room = rooms[state.target.roomIndex];
      if (!room) return { ...state, target: null, error: null };
      const { checkIn, checkOut } = resolveDragDates(state.kind, booking, state.target.column, start);
      const roomTypeChanged = !!booking.roomTypeId && room.roomTypeId !== booking.roomTypeId;
      let error: string | null = null;
      if (checkOut <= checkIn) error = "Check-out must be after check-in";
      else if (TERMINAL_BOOKING_STATUS_SET.has(booking.status)) error = `Cannot move ${booking.status.replaceAll("_", " ")} booking`;
      else if (["maintenance", "out_of_service"].includes(room.status)) error = `Room is ${room.status.replaceAll("_", " ")}`;
      else if (checkIn < todayKey && !isManualLikeSource(booking.source) && booking.status !== "checked_in") error = "Cannot schedule in the past";
      else {
        const clash = findConflictInRoom(room.id, checkIn, checkOut, booking.id);
        if (clash) error = `Overlap with ${clash}`;
        else if (blocksByRoom.get(room.id)?.some((block) => rangeOverlaps(checkIn, checkOut, block.startDate, block.endDate))) error = "Room blocked for selected dates";
      }
      return { ...state, error, typeChange: !error && roomTypeChanged };
    },
    [blocksByRoom, bookingById, findConflictInRoom, rooms, start, todayKey],
  );

  const resolvePointerCell = React.useCallback(
    (event: DragMoveEvent | DragEndEvent): { target: DragTarget | null; overTray: boolean } => {
      const scroller = scrollRef.current;
      if (!scroller) return { target: null, overTray: false };
      const rect = scroller.getBoundingClientRect();
      const translated = event.active.rect.current.translated;
      if (!translated) return { target: null, overTray: false };

      // Prefer the live pointer position (grab point stays under cursor); fall
      // back to the dragged bar's centre — e.g. keyboard drags or a release
      // that lands over the room-label gutter, which must still resolve.
      let px: number | null = null;
      let py: number | null = null;
      const base = eventClientPoint(event.activatorEvent as Event | null);
      if (base && event.delta) {
        px = base.x + event.delta.x;
        py = base.y + event.delta.y;
      }
      if (px == null || py == null) {
        px = translated.left + translated.width / 2;
        py = translated.top + translated.height / 2;
      }

      const trayBox = trayRef.current?.getBoundingClientRect();
      const overTray = !!trayBox && px >= trayBox.left && px <= trayBox.right && py >= trayBox.top && py <= trayBox.bottom;
      if (overTray) return { target: null, overTray };

      const cell = pointToCell(px - rect.left + scroller.scrollLeft - ROOM_COLUMN_WIDTH, py - rect.top + scroller.scrollTop - HEADER_HEIGHT, days, rooms.length);
      return { target: cell, overTray: false };
    },
    [days, rooms.length],
  );

  const handleDragStart = React.useCallback(
    (event: DragStartEvent) => {
      suppressClickRef.current = true;
      const data = event.active.data.current as DragData | undefined;
      if (!data) return;
      // Preserve the bar's real pixel width so long stays keep their shape
      // in the floating overlay instead of collapsing to a pill.
      setDragWidth(event.active.rect.current.initial?.width ?? null);
      setDragState(evaluateTarget({ kind: data.kind, bookingId: data.bookingId, target: null, overTray: false, error: null, typeChange: false }));
    },
    [evaluateTarget, setDragState],
  );

  const handleDragMove = React.useCallback(
    (event: DragMoveEvent) => {
      const current = activeRef.current;
      if (!current) return;
      const { target, overTray } = resolvePointerCell(event);
      const key = `${current.kind}:${current.bookingId}:${target ? `${target.roomIndex}:${target.column}` : "none"}:${overTray}`;
      if (key === quantKeyRef.current) return;
      quantKeyRef.current = key;
      setDragState(evaluateTarget({ ...current, target, overTray }));
    },
    [evaluateTarget, resolvePointerCell, setDragState],
  );

  const commitDrag = React.useCallback(
    async (event: DragEndEvent) => {
      const current = activeRef.current;
      quantKeyRef.current = "";
      setDragState(null);
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      if (!current || !canEdit) return;
      const booking = bookingById.get(current.bookingId);
      if (!booking) return;

      const { target, overTray } = resolvePointerCell(event);
      const finalTarget = target ?? current.target;

      // Unassign ONLY on an explicit drop onto the unassigned tray — the tray
      // highlights while hovered, so the outcome is always visible. Dropping
      // anywhere else outside the grid is a cancel, never a destructive side
      // effect (this was the "booking silently becomes unassigned" bug).
      if (overTray) {
        if (current.kind === "booking" && booking.roomId) {
          await onChange(booking, null, booking.checkIn, booking.checkOut);
        }
        return;
      }
      if (!finalTarget) return;

      const room = rooms[finalTarget.roomIndex];
      if (!room) return;
      const { checkIn, checkOut } = resolveDragDates(current.kind, booking, finalTarget.column, start);
      const typeChanged = !!booking.roomTypeId && room.roomTypeId !== booking.roomTypeId;
      const error = validateTimelineDrop({ booking, room, checkIn, checkOut, bookings, blocks, today: todayKey, allowRoomTypeChange: true });
      if (error) {
        window.dispatchEvent(new CustomEvent("roomline-calendar-error", { detail: error }));
        return;
      }
      // Cross-type drop → confirm with staff before rewriting the booking's room type.
      if (typeChanged) {
        onRequestTypeChange({ bookingId: booking.id, roomId: room.id, checkIn, checkOut, fromRoomTypeId: booking.roomTypeId, toRoomTypeId: room.roomTypeId });
        return;
      }
      await onChange(booking, room.id, checkIn, checkOut);
    },
    [blocks, bookingById, bookings, canEdit, onChange, onRequestTypeChange, resolvePointerCell, rooms, setDragState, start, todayKey],
  );

  const handleDragCancel = React.useCallback(() => {
    quantKeyRef.current = "";
    setDragState(null);
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }, [setDragState]);

  const activeBooking = activeDrag ? bookingById.get(activeDrag.bookingId) : undefined;
  const activeColors: BarVisuals | null = activeBooking ? getBookingBarColor(activeBooking.status, activeBooking.source) : null;

  const preview = React.useMemo(() => {
    if (!activeDrag || !activeDrag.target || !activeBooking) return null;
    const { checkIn, checkOut } = resolveDragDates(activeDrag.kind, activeBooking, activeDrag.target.column, start);
    const g = bookingGeometry(checkIn, checkOut, start);
    const clipped = clampBarGeometry(g, days);
    if (!clipped.visible) return null;
    return {
      roomIndex: activeDrag.target.roomIndex,
      left: clipped.left,
      width: clipped.width,
      checkIn,
      checkOut,
      nights: nightsBetween(checkIn, checkOut),
      invalid: !!activeDrag.error,
      typeChange: !!activeDrag.typeChange && !activeDrag.error,
    };
  }, [activeBooking, activeDrag, days, start]);

  const guardedOpenBooking = React.useCallback(
    (id: string) => {
      if (suppressClickRef.current) return;
      onOpenBooking(id);
    },
    [onOpenBooking],
  );

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragCancel={handleDragCancel} onDragEnd={commitDrag}>
      <div className="rl-timeline-shell">
        <div ref={scrollRef} className="rl-timeline-scroll">
          <div className="rl-timeline-canvas" style={{ width: ROOM_COLUMN_WIDTH + days * DAY_WIDTH, height: HEADER_HEIGHT + virtualizer.getTotalSize() }}>
            <div className="rl-timeline-header">
              <div className="rl-corner" style={{ width: ROOM_COLUMN_WIDTH }}>
                <span>Rooms</span>
                <small>{rooms.length} active</small>
              </div>
              <div className="rl-date-header" style={{ width: days * DAY_WIDTH }}>
                {dates.map((d) => (
                  <div
                    key={d.toISOString()}
                    data-dow={d.getDay()}
                    className={cn("rl-date", format(d, "yyyy-MM-dd") === todayKey && "today")}
                    style={{ width: DAY_WIDTH }}
                  >
                    <strong>{format(d, "EEE")}</strong>
                    <span>{format(d, "MMM d")}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Full-height weekend wash — sits BELOW the today tint and every
                booking/block bar (see z-scale in calendar.css). */}
            {weekendColumns.map((index) => (
              <div
                key={index}
                className="rl-weekend-column"
                style={{ left: ROOM_COLUMN_WIDTH + index * DAY_WIDTH, width: DAY_WIDTH }}
                aria-hidden
              />
            ))}
            {/* Full-height today marker — one element, above the weekend wash, under bars. */}
            {todayColumnVisible && (
              <div className="rl-today-column" style={{ left: ROOM_COLUMN_WIDTH + todayColumn * DAY_WIDTH, width: DAY_WIDTH }} aria-hidden />
            )}
            <div style={{ position: "absolute", top: HEADER_HEIGHT, left: 0, width: "100%", height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((v) => {
                const room = rooms[v.index];
                return (
                  // Absolutely positioned at the virtualizer's measured offset —
                  // flow stacking + translate would double every row offset and
                  // desynchronise the drop hit-test from the rendered rows.
                  <div key={room.id} style={{ position: "absolute", top: v.start, left: 0, width: "100%", height: ROW_HEIGHT }}>
                    <RoomRow
                      room={room}
                      bookings={assignedByRoom.get(room.id) ?? EMPTY_BOOKINGS}
                      blocks={blocksByRoom.get(room.id) ?? EMPTY_BLOCKS}
                      conflicts={conflicts}
                      canEdit={canEdit}
                      start={start}
                      days={days}
                      highlightIds={highlightIds ?? null}
                      onOpenBooking={guardedOpenBooking}
                      onOpenBlock={onOpenBlock}
                      onCreate={onCreate}
                    />
                  </div>
                );
              })}
              {preview && (
                <div
                  className={cn("rl-drag-preview", preview.invalid && "is-invalid", preview.typeChange && "is-type-change")}
                  style={{
                    transform: `translateY(${preview.roomIndex * ROW_HEIGHT}px)`,
                    left: ROOM_COLUMN_WIDTH + preview.left,
                    width: preview.width,
                    height: ROW_HEIGHT,
                  }}
                  aria-hidden
                >
                  <span className="rl-drag-hint">
                    {preview.invalid
                      ? activeDrag?.error
                      : `${format(parseISO(preview.checkIn), "MMM d")} → ${format(parseISO(preview.checkOut), "MMM d")} · ${preview.nights}n${preview.typeChange ? " · Type change" : ""}`}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
        {unassigned.length > 0 && (
          <aside className={cn("rl-unassigned", activeDrag?.kind === "booking" && "has-drag", activeDrag?.kind === "booking" && activeDrag?.overTray && "is-target")} aria-label="Unassigned bookings">
            <strong>Unassigned · {unassigned.length}</strong>
            <div ref={trayRef}>
              {unassigned.map((b) => (
                <TrayBooking key={b.id} booking={b} onOpen={() => guardedOpenBooking(b.groupId ?? b.id)} onAutoAssign={() => onAutoAssign(b.id)} />
              ))}
            </div>
            <p className="rl-unassigned-hint">Drag onto a room to assign</p>
          </aside>
        )}
      </div>
      <span aria-live="polite" className="sr-only">
        {activeDrag?.error ?? ""}
      </span>
      <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
        {/* Only move-drags float a clone — resize feedback lives entirely in
            the cell preview, which is what the eye should track. The clone
            keeps the bar's true pixel width so long stays hold their shape. */}
        {activeDrag?.kind === "booking" && activeBooking && activeColors ? (
          <div
            className="rl-drag-overlay-bar"
            style={{
              width: dragWidth ?? undefined,
              background: `linear-gradient(180deg, color-mix(in srgb, ${activeColors.bg} 84%, white) 0%, ${activeColors.bg} 52%, color-mix(in srgb, ${activeColors.bg} 90%, black) 100%)`,
              borderColor: activeColors.border,
            }}
          >
            <GripVertical className="rl-booking-grip" aria-hidden />
            <span className="rl-booking-name">{activeBooking.guestName ?? activeBooking.reference}</span>
            <span className="rl-booking-pay is-paid">{format(parseISO(activeBooking.checkIn), "MMM d")} – {format(parseISO(activeBooking.checkOut), "MMM d")}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
