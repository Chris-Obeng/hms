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
import { AlertTriangle, Lock, MessageSquareText, Wand2 } from "lucide-react";
import { Button, Spinner, Tooltip } from "@heroui/react";
import { cn } from "@/lib/utils";
import { useIsCompactScreen } from "@/hooks/use-mobile";
import { getStatusLabel } from "@/lib/booking-status";
import type { CalendarAvailabilityBlock, CalendarBooking, CalendarRoom } from "../../actions";
import { businessToday } from "@/lib/business-date";
import {
  BLOCK_REASON_LABELS,
  getBookingStatusKey,
  groupAccent,
  isManualLikeSource,
  NON_BOOKABLE_ROOM_STATUSES,
  TERMINAL_BOOKING_STATUS_SET,
} from "../calendar-helpers";
import {
  bookingGeometry,
  clampBarGeometry,
  columnToDate,
  dateToColumn,
  DAY_WIDTH,
  fitDayWidth,
  HEADER_HEIGHT,
  pointToCell,
  rangeOverlaps,
  ROOM_COLUMN_WIDTH,
  ROW_HEIGHT,
} from "./timeline-geometry";
import { findTimelineConflicts, validateTimelineDrop } from "./timeline-conflicts";

const COMPACT_ROOM_COLUMN_WIDTH = 136;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Prefix for blocks shown before the server has assigned them an id. */
export const PENDING_BLOCK_PREFIX = "pending:";

function subscribeReducedMotion(onChange: () => void) {
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getReducedMotionSnapshot() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getServerReducedMotionSnapshot() {
  return false;
}

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
  /** Bookings to draw (after search and filters). */
  bookings: CalendarBooking[];
  /** Every loaded booking. Drop validation and conflict marks use this set, so
   *  a search or filter never hides a clash. Defaults to `bookings`. */
  allBookings?: CalendarBooking[];
  blocks: CalendarAvailabilityBlock[];
  canEdit: boolean;
  hotelTimezone: string;
  todayAnchor?: number;
  highlightIds?: Set<string>;
  assigningIds?: Set<string>;
  movingIds?: Set<string>;
  onOpenBooking(id: string): void;
  onOpenBlock?(block: CalendarAvailabilityBlock): void;
  onCreate(room: CalendarRoom, date: string): void;
  onChange(
    booking: CalendarBooking,
    roomId: string | null,
    checkIn: string,
    checkOut: string
  ): Promise<void>;
  onAutoAssign(bookingId: string): void;
  onRequestTypeChange(request: TypeChangeRequest): void;
  attachBarRef?: (el: HTMLElement | null) => void;
};

function eventClientPoint(event: Event | null): { x: number; y: number } | null {
  if (!event) return null;
  const source = event as unknown as {
    clientX?: number;
    clientY?: number;
    touches?: ArrayLike<{ clientX: number; clientY: number }>;
  };
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

function resolveDragDates(
  kind: DragKind,
  booking: CalendarBooking,
  column: number,
  startDate: string
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

/** A balance is still owed. Cancelled and no-show stays owe nothing on the rack. */
function hasBalanceDue(booking: CalendarBooking): boolean {
  if (booking.status === "cancelled" || booking.status === "no_show") return false;
  return booking.paymentStatus !== "paid" && booking.paymentStatus !== "refunded";
}

function groupByRoom(list: CalendarBooking[]): Map<string, CalendarBooking[]> {
  const map = new Map<string, CalendarBooking[]>();
  for (const b of list) {
    if (!b.roomId) continue;
    const entry = map.get(b.roomId);
    if (entry) entry.push(b);
    else map.set(b.roomId, [b]);
  }
  return map;
}

function blockLabel(reason: string | null): string {
  if (!reason) return "Blocked";
  return BLOCK_REASON_LABELS[reason] ?? reason.replaceAll("_", " ");
}

function BookingBar({
  booking,
  conflict,
  canEdit,
  isBusy = false,
  onOpen,
}: {
  booking: CalendarBooking;
  conflict: boolean;
  canEdit: boolean;
  isBusy?: boolean;
  onOpen(): void;
}) {
  const isVirtual = Boolean(booking.isVirtual);
  const isTerminal = TERMINAL_BOOKING_STATUS_SET.has(booking.status);
  const draggable = canEdit && !isBusy && !isVirtual && !isTerminal;
  const drag = useDraggable({
    id: `booking:${booking.id}`,
    disabled: !draggable,
    data: { kind: "booking", bookingId: booking.id } satisfies DragData,
  });
  const left = useDraggable({
    id: `left:${booking.id}`,
    disabled: !draggable,
    data: { kind: "resize-left", bookingId: booking.id } satisfies DragData,
  });
  const right = useDraggable({
    id: `right:${booking.id}`,
    disabled: !draggable,
    data: { kind: "resize-right", bookingId: booking.id } satisfies DragData,
  });
  const statusKey = getBookingStatusKey(booking.status);
  const hasNotes = Boolean(booking.specialRequests?.trim() || booking.internalNotes?.trim());
  const accent = groupAccent(booking.groupId);
  const isDragging = drag.isDragging || left.isDragging || right.isDragging;
  const balanceDue = hasBalanceDue(booking);
  const roomsCount = booking.roomsCount ?? 0;

  const label = [
    booking.guestName ?? "Guest",
    `room ${booking.roomNumber ?? "unassigned"}`,
    `${format(parseISO(booking.checkIn), "MMM d")} to ${format(parseISO(booking.checkOut), "MMM d")}`,
    getStatusLabel(booking.status),
    balanceDue ? "balance due" : null,
    accent ? "part of a multi-room reservation" : null,
    roomsCount > 1 ? `${roomsCount} rooms` : null,
    hasNotes ? "has notes" : null,
    conflict ? "overlaps another stay" : null,
    isBusy ? "saving" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      className={cn(
        "rl-booking-bar",
        conflict && "is-conflict",
        isDragging && "is-dragging",
        isTerminal && "is-terminal",
        !draggable && "is-locked",
        isBusy && "is-saving"
      )}
      data-cal-status={statusKey}
      data-group={accent ? "true" : undefined}
      style={accent ? ({ "--rl-group-accent": accent } as React.CSSProperties) : undefined}
    >
      {draggable && (
        <>
          <div
            ref={left.setNodeRef}
            {...left.listeners}
            {...left.attributes}
            role="button"
            tabIndex={0}
            aria-label="Change check-in date"
            className="rl-resize-handle left"
            onClick={(e) => e.stopPropagation()}
          />
          <div
            ref={right.setNodeRef}
            {...right.listeners}
            {...right.attributes}
            role="button"
            tabIndex={0}
            aria-label="Change check-out date"
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
        aria-label={label}
        aria-busy={isBusy || undefined}
        onClick={onOpen}
        onKeyDown={(e) => {
          // dnd-kit's keyboard sensor starts a drag from this handler (Space),
          // so it must run first; overriding it disabled keyboard moves.
          drag.listeners?.onKeyDown?.(e);
          if (e.key === "Enter") onOpen();
        }}
        className="rl-booking-move"
      >
        <span className="rl-booking-name">{booking.guestName ?? "Guest"}</span>
        {hasNotes && <MessageSquareText className="rl-booking-note" aria-hidden />}
        {roomsCount > 1 && (
          <span className="rl-booking-rooms" aria-hidden>
            ×{roomsCount}
          </span>
        )}
        {balanceDue && (
          <span className="rl-booking-due" aria-hidden>
            Due
          </span>
        )}
        {conflict && <AlertTriangle className="rl-booking-conflict" aria-hidden />}
      </div>
    </div>
  );
}

function TrayBooking({
  booking,
  canEdit,
  isAssigning = false,
  onOpen,
  onAutoAssign,
}: {
  booking: CalendarBooking;
  canEdit: boolean;
  isAssigning?: boolean;
  onOpen(): void;
  onAutoAssign(): void;
}) {
  const isVirtual = Boolean(booking.isVirtual);
  const draggable = canEdit && !isVirtual && !isAssigning;
  const drag = useDraggable({
    id: `booking:${booking.id}`,
    disabled: !draggable,
    data: { kind: "booking", bookingId: booking.id } satisfies DragData,
  });
  const nights = nightsBetween(booking.checkIn, booking.checkOut);
  const name = booking.guestName ?? booking.reference;
  const arrival = format(parseISO(booking.checkIn), "MMM d");
  return (
    <div
      className={cn(
        "rl-tray-booking",
        drag.isDragging && "is-dragging",
        !draggable && "is-locked",
        !canEdit && "is-readonly",
        isAssigning && "is-saving"
      )}
    >
      <button
        type="button"
        ref={drag.setNodeRef}
        {...drag.listeners}
        {...drag.attributes}
        className="rl-tray-main"
        onClick={onOpen}
        aria-label={`Open ${name}, unassigned, arrives ${arrival}, ${nights} ${nights === 1 ? "night" : "nights"}`}
      >
        <span className="rl-tray-name">{name}</span>
        <span className="rl-tray-meta">
          {arrival} · {nights}n
        </span>
      </button>
      {canEdit && (
        <Tooltip delay={300}>
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            isPending={isAssigning}
            isDisabled={isVirtual}
            aria-label={`Assign a room to ${name}`}
            onPress={onAutoAssign}
            className="ui-press size-10 min-h-10 min-w-10 rounded-lg text-muted-foreground sm:size-8 sm:min-h-8 sm:min-w-8 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground"
          >
            {({ isPending }) =>
              isPending ? <Spinner size="sm" color="current" /> : <Wand2 className="size-4" />
            }
          </Button>
          <Tooltip.Content placement="top">Assign best room</Tooltip.Content>
        </Tooltip>
      )}
    </div>
  );
}

interface RowProps {
  room: CalendarRoom;
  roomColumnWidth: number;
  dayWidth: number;
  bookings: CalendarBooking[];
  blocks: CalendarAvailabilityBlock[];
  conflicts: Set<string>;
  canEdit: boolean;
  start: string;
  days: number;
  highlightIds: Set<string> | null;
  movingIds: Set<string> | null;
  onOpenBooking(id: string): void;
  onOpenBlock?(block: CalendarAvailabilityBlock): void;
  onCreate(room: CalendarRoom, date: string): void;
  attachBarRef?: (el: HTMLElement | null) => void;
}

const NON_BOOKABLE = NON_BOOKABLE_ROOM_STATUSES;
const EMPTY_BOOKINGS: CalendarBooking[] = [];
const EMPTY_BLOCKS: CalendarAvailabilityBlock[] = [];

const RoomRow = React.memo(function RoomRow({
  room,
  roomColumnWidth,
  dayWidth,
  bookings,
  blocks,
  conflicts,
  canEdit,
  start,
  days,
  highlightIds,
  movingIds,
  onOpenBooking,
  onOpenBlock,
  onCreate,
  attachBarRef,
}: RowProps) {
  const notBookable = NON_BOOKABLE.has(room.status ?? "");
  return (
    <div className="rl-room-row" style={{ height: ROW_HEIGHT }}>
      <div className="rl-room-label" style={{ width: roomColumnWidth }} data-status={room.status}>
        <strong>
          <span className="truncate">{room.roomNumber}</span>
          {notBookable && (
            <span className={`rl-room-flag rl-room-flag--${room.status}`}>
              {room.status === "maintenance" ? "Maint." : "Out"}
            </span>
          )}
        </strong>
        <span className="rl-room-type">{room.roomTypeName}</span>
      </div>
      <div
        className={cn("rl-room-grid", notBookable && "is-non-bookable")}
        style={{
          left: roomColumnWidth,
          width: days * dayWidth,
          backgroundSize: `${dayWidth}px 100%`,
        }}
        onDoubleClick={(e) => {
          if (notBookable || !canEdit) return;
          const box = e.currentTarget.getBoundingClientRect();
          onCreate(room, columnToDate(Math.floor((e.clientX - box.left) / dayWidth), start));
        }}
      >
        {notBookable && (
          <div
            aria-hidden
            className="rl-oos-veil"
            title={room.status === "maintenance" ? "Room under maintenance" : "Room out of service"}
          />
        )}
        {blocks.map((block) => {
          const g = bookingGeometry(block.startDate, block.endDate, start, dayWidth);
          const clipped = clampBarGeometry(g, days, dayWidth);
          if (!clipped.visible) return null;
          const label = blockLabel(block.reason);
          const lastNight = format(addDays(parseISO(block.endDate), -1), "MMM d");
          const range = `${format(parseISO(block.startDate), "MMM d")} to ${lastNight}`;
          if (block.id.startsWith(PENDING_BLOCK_PREFIX)) {
            return (
              <div
                key={block.id}
                role="img"
                className="rl-block-bar is-pending"
                style={{ left: clipped.left, width: clipped.width }}
                aria-label={`Blocked, ${label}, ${range}. Saving.`}
              >
                <Lock aria-hidden className="rl-block-lock" />
                <span className="truncate">{label}</span>
              </div>
            );
          }
          return (
            <button
              key={block.id}
              type="button"
              className="rl-block-bar"
              style={{ left: clipped.left, width: clipped.width }}
              aria-label={`Blocked, ${label}, ${range}. View details.`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenBlock?.(block);
              }}
            >
              <Lock aria-hidden className="rl-block-lock" />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
        {bookings.map((b) => {
          const g = bookingGeometry(b.checkIn, b.checkOut, start, dayWidth);
          const clipped = clampBarGeometry(g, days, dayWidth);
          if (!clipped.visible) return null;
          const barId = (b.groupId ?? b.id).replace(/:v\d+$/, "");
          return (
            <div
              key={b.id}
              ref={attachBarRef as unknown as React.Ref<HTMLDivElement>}
              data-booking-id={barId}
              className={cn("rl-bar-slot", highlightIds?.has(b.id) && "rl-bar-new")}
              style={{ left: clipped.left, width: clipped.width }}
            >
              <BookingBar
                booking={b}
                conflict={conflicts.has(b.id)}
                canEdit={canEdit}
                isBusy={movingIds?.has(b.id) ?? false}
                onOpen={() => onOpenBooking(barId)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

export function TimelineCalendar({
  startDate,
  days,
  rooms,
  bookings,
  allBookings,
  blocks,
  canEdit,
  hotelTimezone,
  todayAnchor = 0,
  highlightIds,
  assigningIds,
  movingIds,
  onOpenBooking,
  onOpenBlock,
  onCreate,
  onChange,
  onAutoAssign,
  onRequestTypeChange,
  attachBarRef,
}: Props) {
  const isCompact = useIsCompactScreen();
  const shouldReduceMotion = React.useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getServerReducedMotionSnapshot
  );
  const roomColWidth = isCompact ? COMPACT_ROOM_COLUMN_WIDTH : ROOM_COLUMN_WIDTH;
  const occupancy = allBookings ?? bookings;

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const trayRef = React.useRef<HTMLDivElement>(null);
  const [activeDrag, setActiveDrag] = React.useState<DragState | null>(null);
  const [dragWidth, setDragWidth] = React.useState<number | null>(null);
  const activeRef = React.useRef<DragState | null>(null);
  const quantKeyRef = React.useRef("");
  const suppressClickRef = React.useRef(false);
  // What a drop did, for screen readers. dnd-kit's own drop announcement
  // cannot know whether the drop was saved, refused or a no-op.
  const [dropMessage, setDropMessage] = React.useState("");

  // Day columns stretch to fill the scroller, so a week never leaves an empty
  // strip on the right. Measured before paint; DAY_WIDTH is the floor.
  const [viewportWidth, setViewportWidth] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const measure = () => setViewportWidth(scroller.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);
  const dayWidth =
    viewportWidth == null ? DAY_WIDTH : fitDayWidth(viewportWidth, roomColWidth, days);
  // Keyboard drags step one day column; the sensor reads the current width.
  const dayWidthRef = React.useRef(dayWidth);
  React.useLayoutEffect(() => {
    dayWidthRef.current = dayWidth;
  }, [dayWidth]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      keyboardCodes: {
        start: ["Space"],
        cancel: ["Escape"],
        end: ["Space", "Enter"],
      },
      coordinateGetter: (event, { currentCoordinates }) => {
        switch (event.code) {
          case "ArrowRight":
            return { x: currentCoordinates.x + dayWidthRef.current, y: currentCoordinates.y };
          case "ArrowLeft":
            return { x: currentCoordinates.x - dayWidthRef.current, y: currentCoordinates.y };
          case "ArrowDown":
            return { x: currentCoordinates.x, y: currentCoordinates.y + ROW_HEIGHT };
          case "ArrowUp":
            return { x: currentCoordinates.x, y: currentCoordinates.y - ROW_HEIGHT };
          default:
            return undefined;
        }
      },
    })
  );

  const start = format(startDate, "yyyy-MM-dd");
  const endExclusive = format(addDays(startDate, days), "yyyy-MM-dd");
  const todayKey = businessToday(hotelTimezone);
  const todayColumn = dateToColumn(todayKey, start);
  const todayColumnVisible = todayColumn >= 0 && todayColumn < days;

  // Horizontal scroll intent. "today" (mount, Today button) puts today at the
  // left edge; "start" (paging to another period) shows the period's first day.
  // Applied only once the scroller is measured, and never on a plain resize.
  const scrollIntentRef = React.useRef<"today" | "start" | null>("today");
  const lastAnchorRef = React.useRef(todayAnchor);
  const lastStartRef = React.useRef(start);
  React.useLayoutEffect(() => {
    if (todayAnchor !== lastAnchorRef.current) {
      lastAnchorRef.current = todayAnchor;
      scrollIntentRef.current = "today";
    } else if (start !== lastStartRef.current) {
      scrollIntentRef.current = "start";
    }
    lastStartRef.current = start;
    const scroller = scrollRef.current;
    const intent = scrollIntentRef.current;
    if (!scroller || viewportWidth == null || !intent) return;
    scroller.scrollLeft = intent === "today" && todayColumnVisible ? todayColumn * dayWidth : 0;
    scrollIntentRef.current = null;
  }, [dayWidth, start, todayAnchor, todayColumn, todayColumnVisible, viewportWidth]);

  const conflicts = React.useMemo(() => findTimelineConflicts(occupancy), [occupancy]);

  // Drawn bars (filtered) and occupancy (everything) are separate maps: a
  // hidden stay still blocks a drop.
  const assignedByRoom = React.useMemo(() => groupByRoom(bookings), [bookings]);
  const occupancyByRoom = React.useMemo(() => groupByRoom(occupancy), [occupancy]);

  const blocksByRoom = React.useMemo(() => {
    const map = new Map<string, CalendarAvailabilityBlock[]>();
    for (const b of blocks) {
      const entry = map.get(b.roomId);
      if (entry) entry.push(b);
      else map.set(b.roomId, [b]);
    }
    return map;
  }, [blocks]);

  // Only stays that touch the visible window: the loaded range can be wider
  // than the view (the page seeds 37 days), and an arrival three weeks out
  // does not belong in this week's tray.
  const unassigned = React.useMemo(
    () =>
      bookings.filter(
        (b) =>
          !b.roomId &&
          !b.isVirtual &&
          !TERMINAL_BOOKING_STATUS_SET.has(b.status) &&
          rangeOverlaps(b.checkIn, b.checkOut, start, endExclusive)
      ),
    [bookings, endExclusive, start]
  );
  const bookingById = React.useMemo(() => new Map(occupancy.map((b) => [b.id, b])), [occupancy]);

  const virtualizer = useVirtualizer({
    count: rooms.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });
  const rowsHeight = virtualizer.getTotalSize();
  const dates = React.useMemo(
    () => Array.from({ length: days }, (_, i) => addDays(startDate, i)),
    [startDate, days]
  );

  const weekendColumns = React.useMemo(
    () =>
      dates.reduce<number[]>((acc, d, index) => {
        const dow = d.getDay();
        if (dow === 0 || dow === 6) acc.push(index);
        return acc;
      }, []),
    [dates]
  );

  const setDragState = React.useCallback((next: DragState | null) => {
    activeRef.current = next;
    setActiveDrag(next);
  }, []);

  const findConflictInRoom = React.useCallback(
    (roomId: string, checkIn: string, checkOut: string, excludeId: string): string | null => {
      for (const other of occupancyByRoom.get(roomId) ?? []) {
        if (other.id === excludeId || TERMINAL_BOOKING_STATUS_SET.has(other.status)) continue;
        if (rangeOverlaps(checkIn, checkOut, other.checkIn, other.checkOut))
          return other.guestName || other.reference;
      }
      return null;
    },
    [occupancyByRoom]
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
      else if (TERMINAL_BOOKING_STATUS_SET.has(booking.status))
        error = `Cannot move a ${getStatusLabel(booking.status).toLowerCase()} booking`;
      else if (NON_BOOKABLE_ROOM_STATUSES.has(room.status))
        error = `Room is ${room.status.replaceAll("_", " ")}`;
      else if (
        checkIn < todayKey &&
        !isManualLikeSource(booking.source) &&
        booking.status !== "checked_in"
      )
        error = "Cannot schedule in the past";
      else {
        const clash = findConflictInRoom(room.id, checkIn, checkOut, booking.id);
        if (clash) error = `Overlaps ${clash}`;
        else if (
          blocksByRoom
            .get(room.id)
            ?.some((block) => rangeOverlaps(checkIn, checkOut, block.startDate, block.endDate))
        )
          error = "Room blocked for these dates";
      }
      return { ...state, error, typeChange: !error && roomTypeChanged };
    },
    [blocksByRoom, bookingById, findConflictInRoom, rooms, start, todayKey]
  );

  const resolvePointerCell = React.useCallback(
    (event: DragMoveEvent | DragEndEvent): { target: DragTarget | null; overTray: boolean } => {
      const scroller = scrollRef.current;
      if (!scroller) return { target: null, overTray: false };
      const rect = scroller.getBoundingClientRect();
      const translated = event.active.rect.current.translated;
      if (!translated) return { target: null, overTray: false };

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
      const overTray =
        !!trayBox &&
        px >= trayBox.left &&
        px <= trayBox.right &&
        py >= trayBox.top &&
        py <= trayBox.bottom;
      if (overTray) return { target: null, overTray };

      const cell = pointToCell(
        px - rect.left + scroller.scrollLeft - roomColWidth,
        py - rect.top + scroller.scrollTop - HEADER_HEIGHT,
        days,
        rooms.length,
        dayWidth
      );
      return { target: cell, overTray: false };
    },
    [dayWidth, days, roomColWidth, rooms.length]
  );

  const handleDragStart = React.useCallback(
    (event: DragStartEvent) => {
      suppressClickRef.current = true;
      setDropMessage("");
      const data = event.active.data.current as DragData | undefined;
      if (!data) return;
      setDragWidth(event.active.rect.current.initial?.width ?? null);
      setDragState(
        evaluateTarget({
          kind: data.kind,
          bookingId: data.bookingId,
          target: null,
          overTray: false,
          error: null,
          typeChange: false,
        })
      );
    },
    [evaluateTarget, setDragState]
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
    [evaluateTarget, resolvePointerCell, setDragState]
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
      const name = booking.guestName ?? booking.reference;
      const notMoved = `${name} was not moved.`;

      const { target, overTray } = resolvePointerCell(event);
      const finalTarget = target ?? current.target;

      if (overTray) {
        if (current.kind === "booking" && booking.roomId) {
          setDropMessage(`Unassigning ${name}.`);
          await onChange(booking, null, booking.checkIn, booking.checkOut);
        } else {
          setDropMessage(notMoved);
        }
        return;
      }
      if (!finalTarget) {
        setDropMessage(notMoved);
        return;
      }

      const room = rooms[finalTarget.roomIndex];
      if (!room) {
        setDropMessage(notMoved);
        return;
      }
      const { checkIn, checkOut } = resolveDragDates(
        current.kind,
        booking,
        finalTarget.column,
        start
      );
      // Dropped where it started: nothing to save.
      if (room.id === booking.roomId && checkIn === booking.checkIn && checkOut === booking.checkOut) {
        setDropMessage(notMoved);
        return;
      }
      const typeChanged = !!booking.roomTypeId && room.roomTypeId !== booking.roomTypeId;
      const error = validateTimelineDrop({
        booking,
        room,
        checkIn,
        checkOut,
        bookings: occupancy,
        blocks,
        today: todayKey,
        allowRoomTypeChange: true,
      });
      if (error) {
        setDropMessage(`${notMoved} ${error}.`);
        window.dispatchEvent(new CustomEvent("roomline-calendar-error", { detail: error }));
        return;
      }
      if (typeChanged) {
        setDropMessage(`Moving ${name} to room ${room.roomNumber} changes the room type. Choose a rate to continue.`);
        onRequestTypeChange({
          bookingId: booking.id,
          roomId: room.id,
          checkIn,
          checkOut,
          fromRoomTypeId: booking.roomTypeId,
          toRoomTypeId: room.roomTypeId,
        });
        return;
      }
      setDropMessage(
        `Saving ${name} in room ${room.roomNumber}, ${format(parseISO(checkIn), "MMM d")} to ${format(parseISO(checkOut), "MMM d")}.`
      );
      await onChange(booking, room.id, checkIn, checkOut);
    },
    [
      blocks,
      bookingById,
      canEdit,
      occupancy,
      onChange,
      onRequestTypeChange,
      resolvePointerCell,
      rooms,
      setDragState,
      start,
      todayKey,
    ]
  );

  const handleDragCancel = React.useCallback(() => {
    quantKeyRef.current = "";
    setDragState(null);
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }, [setDragState]);

  const activeBooking = activeDrag ? bookingById.get(activeDrag.bookingId) : undefined;
  const activeStatusKey = activeBooking ? getBookingStatusKey(activeBooking.status) : null;

  const preview = React.useMemo(() => {
    if (!activeDrag || !activeDrag.target || !activeBooking) return null;
    const { checkIn, checkOut } = resolveDragDates(
      activeDrag.kind,
      activeBooking,
      activeDrag.target.column,
      start
    );
    const g = bookingGeometry(checkIn, checkOut, start, dayWidth);
    const clipped = clampBarGeometry(g, days, dayWidth);
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
  }, [activeBooking, activeDrag, dayWidth, days, start]);

  // Screen-reader announcements name the guest instead of dnd-kit's internal id.
  const accessibility = React.useMemo(() => {
    const describe = (id: string | number) => {
      const bookingId = String(id).replace(/^(booking|left|right):/, "");
      const booking = bookingById.get(bookingId);
      const name = booking?.guestName ?? booking?.reference ?? "booking";
      if (String(id).startsWith("left:")) return `check-in date of ${name}`;
      if (String(id).startsWith("right:")) return `check-out date of ${name}`;
      return name;
    };
    return {
      announcements: {
        onDragStart: ({ active }: { active: { id: string | number } }) =>
          `Picked up ${describe(active.id)}.`,
        onDragMove: () => undefined,
        onDragOver: () => undefined,
        // The drop's outcome (saving, refused, unchanged) is announced from
        // commitDrag through the live region below.
        onDragEnd: () => undefined,
        onDragCancel: ({ active }: { active: { id: string | number } }) =>
          `Cancelled. ${describe(active.id)} was not moved.`,
      },
      screenReaderInstructions: {
        draggable:
          "To move a booking, press Space. Use the arrow keys to change the room or dates, then press Space or Enter to drop it, or Escape to cancel.",
      },
    };
  }, [bookingById]);

  const guardedOpenBooking = React.useCallback(
    (id: string) => {
      if (suppressClickRef.current) return;
      onOpenBooking(id);
    },
    [onOpenBooking]
  );

  return (
    <DndContext
      sensors={sensors}
      accessibility={accessibility}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragCancel={handleDragCancel}
      onDragEnd={commitDrag}
    >
      <div className="rl-timeline-shell">
        <div ref={scrollRef} className="rl-timeline-scroll">
          <div
            className="rl-timeline-canvas"
            style={{
              width: roomColWidth + days * dayWidth,
              height: HEADER_HEIGHT + rowsHeight,
            }}
          >
            <div className="rl-timeline-header">
              <div className="rl-corner" style={{ width: roomColWidth }}>
                <span>Rooms</span>
                <small>{rooms.length} shown</small>
              </div>
              <div className="rl-date-header" style={{ width: days * dayWidth }}>
                {dates.map((d) => {
                  const key = format(d, "yyyy-MM-dd");
                  const isToday = key === todayKey;
                  return (
                    <div
                      key={key}
                      data-dow={d.getDay()}
                      className={cn("rl-date", isToday && "today")}
                      style={{ width: dayWidth }}
                      aria-current={isToday ? "date" : undefined}
                    >
                      <strong>{format(d, "EEE")}</strong>
                      <span>{format(d, "MMM d")}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Column washes end at the last room row. The canvas is at least
                as tall as the viewport, so `bottom: 0` would run them into the
                empty space below a short rack. */}
            {weekendColumns.map((index) => (
              <div
                key={index}
                className="rl-weekend-column"
                style={{
                  left: roomColWidth + index * dayWidth,
                  width: dayWidth,
                  height: rowsHeight,
                }}
                aria-hidden
              />
            ))}

            {todayColumnVisible && (
              <div
                className="rl-today-column"
                style={{
                  left: roomColWidth + todayColumn * dayWidth,
                  width: dayWidth,
                  height: rowsHeight,
                }}
                aria-hidden
              />
            )}

            <div
              style={{
                position: "absolute",
                top: HEADER_HEIGHT,
                left: 0,
                width: "100%",
                height: rowsHeight,
              }}
            >
              {virtualizer.getVirtualItems().map((v) => {
                const room = rooms[v.index];
                return (
                  <div
                    key={room.id}
                    style={{
                      position: "absolute",
                      top: v.start,
                      left: 0,
                      width: "100%",
                      height: ROW_HEIGHT,
                    }}
                  >
                    <RoomRow
                      room={room}
                      roomColumnWidth={roomColWidth}
                      dayWidth={dayWidth}
                      bookings={assignedByRoom.get(room.id) ?? EMPTY_BOOKINGS}
                      blocks={blocksByRoom.get(room.id) ?? EMPTY_BLOCKS}
                      conflicts={conflicts}
                      canEdit={canEdit}
                      start={start}
                      days={days}
                      highlightIds={highlightIds ?? null}
                      movingIds={movingIds ?? null}
                      onOpenBooking={guardedOpenBooking}
                      onOpenBlock={onOpenBlock}
                      onCreate={onCreate}
                      attachBarRef={attachBarRef}
                    />
                  </div>
                );
              })}

              {preview && (
                <div
                  className={cn(
                    "rl-drag-preview",
                    preview.invalid && "is-invalid",
                    preview.typeChange && "is-type-change"
                  )}
                  style={{
                    transform: `translateY(${preview.roomIndex * ROW_HEIGHT}px)`,
                    left: roomColWidth + preview.left,
                    width: preview.width,
                    height: ROW_HEIGHT,
                  }}
                  aria-hidden
                >
                  <span className="rl-drag-hint">
                    {preview.invalid
                      ? activeDrag?.error
                      : `${format(parseISO(preview.checkIn), "MMM d")} – ${format(parseISO(preview.checkOut), "MMM d")} · ${preview.nights}n${preview.typeChange ? " · New room type" : ""}`}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {unassigned.length > 0 && (
          <aside
            className={cn(
              "rl-unassigned",
              activeDrag?.kind === "booking" && "has-drag",
              activeDrag?.kind === "booking" && activeDrag?.overTray && "is-target"
            )}
            aria-label="Unassigned bookings"
          >
            <strong>
              Unassigned
              <span className="rl-unassigned-count">{unassigned.length}</span>
            </strong>
            <div ref={trayRef}>
              {unassigned.map((b) => (
                <TrayBooking
                  key={b.id}
                  booking={b}
                  canEdit={canEdit}
                  isAssigning={assigningIds?.has(b.id) ?? false}
                  onOpen={() => guardedOpenBooking(b.groupId ?? b.id)}
                  onAutoAssign={() => onAutoAssign(b.id)}
                />
              ))}
            </div>
          </aside>
        )}
      </div>

      <span aria-live="polite" className="sr-only">
        {activeDrag?.error ?? dropMessage}
      </span>

      <DragOverlay
        dropAnimation={
          shouldReduceMotion ? null : { duration: 150, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }
        }
      >
        {activeDrag?.kind === "booking" && activeBooking && activeStatusKey ? (
          <div
            className="rl-drag-overlay-bar"
            data-cal-status={activeStatusKey}
            style={{ width: dragWidth ?? undefined }}
          >
            <span className="rl-booking-name">
              {activeBooking.guestName ?? activeBooking.reference}
            </span>
            <span className="rl-drag-overlay-dates">
              {format(parseISO(activeBooking.checkIn), "MMM d")} –{" "}
              {format(parseISO(activeBooking.checkOut), "MMM d")}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
