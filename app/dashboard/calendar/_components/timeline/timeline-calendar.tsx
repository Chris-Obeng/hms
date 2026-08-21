"use client";
/* eslint-disable react-hooks/refs, react-hooks/incompatible-library */

import * as React from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { AlertTriangle, BedDouble, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarAvailabilityBlock, CalendarBooking, CalendarRoom } from "../../actions";
import { getBookingBarColor } from "../calendar-helpers";
import { bookingGeometry, columnToDate, DAY_WIDTH, ROOM_COLUMN_WIDTH, ROW_HEIGHT } from "./timeline-geometry";
import { findTimelineConflicts, validateTimelineDrop } from "./timeline-conflicts";

type DragData = { kind: "booking" | "resize-left" | "resize-right"; bookingId: string };
type Props = { startDate: Date; days: number; rooms: CalendarRoom[]; bookings: CalendarBooking[]; blocks: CalendarAvailabilityBlock[]; canEdit: boolean; onOpenBooking(id: string): void; onCreate(room: CalendarRoom, date: string): void; onChange(booking: CalendarBooking, roomId: string | null, checkIn: string, checkOut: string): Promise<void> };

function BookingBar({ booking, conflict, canEdit, onOpen }: { booking: CalendarBooking; conflict: boolean; canEdit: boolean; onOpen(): void }) {
  const drag = useDraggable({ id: `booking:${booking.id}`, disabled: !canEdit, data: { kind: "booking", bookingId: booking.id } satisfies DragData });
  const left = useDraggable({ id: `left:${booking.id}`, disabled: !canEdit, data: { kind: "resize-left", bookingId: booking.id } satisfies DragData });
  const right = useDraggable({ id: `right:${booking.id}`, disabled: !canEdit, data: { kind: "resize-right", bookingId: booking.id } satisfies DragData });
  const colors = getBookingBarColor(booking.status, booking.source);
  return <div ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} tabIndex={0} role="button" aria-label={`${booking.guestName ?? "Guest"}, room ${booking.roomNumber ?? "unassigned"}, ${booking.checkIn} to ${booking.checkOut}${conflict ? ", conflict" : ""}`} onClick={onOpen} className={cn("rl-booking-bar", conflict && "is-conflict")} style={{ background: colors.bg, borderColor: conflict ? "var(--destructive)" : colors.border }}>
    <button ref={left.setNodeRef} {...left.listeners} {...left.attributes} className="rl-resize-handle left" aria-label="Resize check-in" onClick={(e) => e.stopPropagation()} />
    <GripVertical className="size-3 shrink-0 opacity-70"/><span className="truncate font-semibold">{booking.guestName ?? "Guest"}</span><span className="ml-auto shrink-0 text-[10px] opacity-80">{booking.paymentStatus === "paid" ? "Paid" : "Due"}</span>{conflict && <AlertTriangle className="size-3.5 shrink-0" aria-hidden />}
    <button ref={right.setNodeRef} {...right.listeners} {...right.attributes} className="rl-resize-handle right" aria-label="Resize check-out" onClick={(e) => e.stopPropagation()} />
  </div>;
}

function TrayBooking({ booking }: { booking: CalendarBooking }) {
  const drag = useDraggable({ id: `booking:${booking.id}`, data: { kind: "booking", bookingId: booking.id } satisfies DragData });
  return <button ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} className="rl-tray-booking"><BedDouble className="size-4"/><span className="truncate">{booking.guestName ?? booking.reference}</span><span>{differenceInCalendarDays(parseISO(booking.checkOut), parseISO(booking.checkIn))}n</span></button>;
}

export function TimelineCalendar({ startDate, days, rooms, bookings, blocks, canEdit, onOpenBooking, onCreate, onChange }: Props) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }), useSensor(KeyboardSensor));
  const start = format(startDate, "yyyy-MM-dd");
  const conflicts = React.useMemo(() => findTimelineConflicts(bookings), [bookings]);
  const assignedByRoom = React.useMemo(() => { const map = new Map<string, CalendarBooking[]>(); for (const b of bookings) if (b.roomId) { const v=map.get(b.roomId)??[]; v.push(b); map.set(b.roomId,v); } return map; }, [bookings]);
  const blocksByRoom = React.useMemo(() => { const map = new Map<string, CalendarAvailabilityBlock[]>(); for (const b of blocks) { const v=map.get(b.roomId)??[]; v.push(b); map.set(b.roomId,v); } return map; }, [blocks]);
  const virtualizer = useVirtualizer({ count: rooms.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_HEIGHT, overscan: 10 });
  const dates = React.useMemo(() => Array.from({ length: days }, (_, i) => addDays(startDate, i)), [startDate, days]);
  const active = activeId ? bookings.find(b => activeId.endsWith(b.id)) : undefined;
  const endDrag = async (event: DragEndEvent) => {
    setActiveId(null); const data=event.active.data.current as DragData|undefined; if (!data || !canEdit || !scrollRef.current) return;
    const booking=bookings.find(b=>b.id===data.bookingId); if(!booking)return;
    const rect=scrollRef.current.getBoundingClientRect(); const translated=event.active.rect.current.translated; if(!translated)return;
    const x=translated.left + translated.width/2 - rect.left + scrollRef.current.scrollLeft - ROOM_COLUMN_WIDTH;
    const y=translated.top + translated.height/2 - rect.top + scrollRef.current.scrollTop - 62;
    if (x < 0 || y < 0) { if (data.kind === "booking" && booking.roomId) await onChange(booking, null, booking.checkIn, booking.checkOut); return; }
    const room=rooms[Math.max(0,Math.min(rooms.length-1,Math.floor(y/ROW_HEIGHT)))]; const date=columnToDate(Math.max(0,Math.min(days-1,Math.floor(x/DAY_WIDTH))),start);
    let checkIn=booking.checkIn, checkOut=booking.checkOut;
    if(data.kind==="booking"){const nights=Math.max(1,differenceInCalendarDays(parseISO(booking.checkOut),parseISO(booking.checkIn)));checkIn=date;checkOut=format(addDays(parseISO(date),nights),"yyyy-MM-dd");}
    if(data.kind==="resize-left") checkIn=date;
    if(data.kind==="resize-right") checkOut=format(addDays(parseISO(date),1),"yyyy-MM-dd");
    const error=validateTimelineDrop({booking,room,checkIn,checkOut,bookings,blocks}); if(error){window.dispatchEvent(new CustomEvent("roomline-calendar-error",{detail:error}));return;} await onChange(booking,room.id,checkIn,checkOut);
  };
  return <DndContext sensors={sensors} onDragStart={e=>setActiveId(String(e.active.id))} onDragCancel={()=>setActiveId(null)} onDragEnd={endDrag}>
    <div className="rl-timeline-shell">
      <div ref={scrollRef} className="rl-timeline-scroll">
        <div className="rl-timeline-canvas" style={{ width: ROOM_COLUMN_WIDTH + days * DAY_WIDTH, height: 62 + virtualizer.getTotalSize() }}>
          <div className="rl-timeline-header">
            <div className="rl-corner" style={{width:ROOM_COLUMN_WIDTH}}><span>Rooms</span><small>{rooms.length} active</small></div>
            <div className="rl-date-header" style={{width:days*DAY_WIDTH}}>{dates.map(d=><div key={d.toISOString()} className={cn("rl-date",[0,6].includes(d.getDay())&&"weekend",format(d,"yyyy-MM-dd")===format(new Date(),"yyyy-MM-dd")&&"today")} style={{width:DAY_WIDTH}}><strong>{format(d,"EEE")}</strong><span>{format(d,"MMM d")}</span></div>)}</div>
          </div>
          <div style={{position:"absolute",top:62,left:0,width:"100%",height:virtualizer.getTotalSize()}}>{virtualizer.getVirtualItems().map(v=>{const room=rooms[v.index];return <div key={room.id} className="rl-room-row" style={{transform:`translateY(${v.start}px)`,height:ROW_HEIGHT}}><div className="rl-room-label" style={{width:ROOM_COLUMN_WIDTH}}><strong>{room.roomNumber}</strong><span>{room.roomTypeName}</span><i className={`status ${room.status}`}/></div><div className="rl-room-grid" style={{left:ROOM_COLUMN_WIDTH,width:days*DAY_WIDTH,backgroundSize:`${DAY_WIDTH}px 100%`}} onDoubleClick={e=>{const box=e.currentTarget.getBoundingClientRect();onCreate(room,columnToDate(Math.floor((e.clientX-box.left)/DAY_WIDTH),start));}}>{(blocksByRoom.get(room.id)??[]).map(block=>{const g=bookingGeometry(block.startDate,block.endDate,start);return <div key={block.id} className="rl-block-bar" style={{left:g.left,width:g.width}} title={`${block.reason ?? "Blocked"}: ${block.startDate} to ${block.endDate}`}>{block.reason?.replaceAll("_"," ")??"Blocked"}</div>})}{(assignedByRoom.get(room.id)??[]).map(b=>{const g=bookingGeometry(b.checkIn,b.checkOut,start);return <div key={b.id} style={{position:"absolute",left:g.left,width:g.width,top:8,height:36}}><BookingBar booking={b} conflict={conflicts.has(b.id)} canEdit={canEdit} onOpen={()=>onOpenBooking(b.id)}/></div>})}</div></div>})}</div>
        </div>
      </div>
      {bookings.some(b=>!b.roomId)&&<aside className="rl-unassigned" aria-label="Unassigned bookings"><strong>Unassigned</strong><div>{bookings.filter(b=>!b.roomId).map(b=><TrayBooking key={b.id} booking={b}/>)}</div></aside>}
    </div><DragOverlay>{active?<div className="rl-drag-overlay">{active.guestName??active.reference}</div>:null}</DragOverlay>
  </DndContext>;
}
