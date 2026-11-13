"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { BedDouble, Check, RefreshCw, Minus, Plus, Trash2 } from "lucide-react";
import { getStaffAvailability, type StaffAvailabilityRoom } from "@/app/actions/availability";
import { formatCurrency, nightsLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX_QTY_PER_LINE = 5;
const MAX_ROOM_TYPES = 4;

export interface StaffCartLine {
  roomTypeId: string;
  room: StaffAvailabilityRoom;
  adults: number;
  children: number;
  quantity: number;
}

interface AvailabilityStepProps {
  checkIn: string | null;
  checkOut: string | null;
  currency: string;
  nights: number;
  cartLines: StaffCartLine[];
  onAddLine: (room: StaffAvailabilityRoom) => void;
  onRemoveLine: (roomTypeId: string) => void;
  onUpdateLine: (roomTypeId: string, patch: Partial<Omit<StaffCartLine, "roomTypeId" | "room">>) => void;
  onSyncCart?: (next: StaffCartLine[]) => void;
  prefillRoomTypeId?: string;
}

/** Inventory + policy → bookable verdict (occupancy checked per line, not globally). */
function roomStockState(room: StaffAvailabilityRoom) {
  if (!room.available) return { addable: false, reason: "Sold out" };
  if (!room.sellable) return { addable: false, reason: room.restrictionReason ?? "Unavailable for these dates" };
  return { addable: true, reason: null as string | null };
}

function AvailabilityChip({ count }: { count: number }) {
  if (count <= 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-1 text-[11px] font-semibold text-destructive">
        Sold out
      </span>
    );
  }
  const low = count <= 3;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold tabular-nums",
        low ? "bg-amber-500/10 text-amber-700" : "bg-emerald-500/10 text-emerald-700"
      )}
    >
      {count} left
    </span>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const canDec = value > min;
  const canInc = value < max;
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <div className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 p-1">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={!canDec}
          onClick={() => canDec && onChange(value - 1)}
          className="inline-flex size-7 items-center justify-center rounded-full bg-background text-foreground shadow-sm transition disabled:opacity-40"
        >
          <Minus className="size-4" />
        </button>
        <span className="min-w-6 text-center text-sm font-semibold tabular-nums text-foreground">{value}</span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={!canInc}
          onClick={() => canInc && onChange(value + 1)}
          className="inline-flex size-7 items-center justify-center rounded-full bg-background text-foreground shadow-sm transition disabled:opacity-40"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function AvailabilityStep({
  checkIn,
  checkOut,
  currency,
  nights,
  cartLines,
  onAddLine,
  onRemoveLine,
  onUpdateLine,
  onSyncCart,
  prefillRoomTypeId,
}: AvailabilityStepProps) {
  const enabled = Boolean(checkIn && checkOut);
  const { data, isPending, isFetching, refetch } = useQuery({
    queryKey: ["staff-availability", checkIn, checkOut],
    queryFn: () => getStaffAvailability(checkIn as string, checkOut as string),
    enabled,
  });

  const result = data && data.success ? data.data : null;
  const rooms = React.useMemo(() => result?.rooms ?? [], [result]);
  const loadError = data && !data.success ? data.error : null;

  const cartById = React.useMemo(() => new Map(cartLines.map((l) => [l.roomTypeId, l])), [cartLines]);
  const totalRooms = cartLines.reduce((s, l) => s + l.quantity, 0);

  // Auto-add prefilled room type once it lands, if it fits stock.
  const prefillApplied = React.useRef(false);
  React.useEffect(() => {
    if (prefillApplied.current || !prefillRoomTypeId || !rooms.length || cartLines.length) return;
    const match = rooms.find((r) => r.roomTypeId === prefillRoomTypeId);
    if (match && roomStockState(match).addable) {
      prefillApplied.current = true;
      onAddLine(match);
    }
  }, [rooms, prefillRoomTypeId, cartLines.length, onAddLine]);

  // Prune/clamp cart when availability changes (sold out / restricted / fewer left).
  // Single-sync: compute next cart once, apply one state update instead of N calls.
  React.useEffect(() => {
    if (!rooms.length || !cartLines.length) return;
    if (!onSyncCart) return;
    const roomMap = new Map(rooms.map((r) => [r.roomTypeId, r]));
    let changed = false;
    const next: StaffCartLine[] = [];
    for (const line of cartLines) {
      const room = roomMap.get(line.roomTypeId);
      if (!room || !roomStockState(room).addable) {
        changed = true;
        continue;
      }
      const clampedQty = Math.min(line.quantity, Math.max(1, room.availableCount || MAX_QTY_PER_LINE));
      const roomChanged =
        line.room.availableCount !== room.availableCount ||
        line.room.subtotal !== room.subtotal ||
        line.room.avgNightly !== room.avgNightly ||
        line.room.sellable !== room.sellable;
      if (clampedQty !== line.quantity || roomChanged) {
        changed = true;
        next.push({ ...line, quantity: clampedQty, room: roomChanged ? room : line.room });
      } else {
        next.push(line);
      }
    }
    if (changed) onSyncCart(next);
  }, [rooms, cartLines, onSyncCart]);

  const atTypeLimit = cartLines.length >= MAX_ROOM_TYPES;

  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-8 text-center">
        <p className="text-sm font-medium text-foreground">Couldn&apos;t load availability</p>
        <p className="max-w-sm text-xs text-muted-foreground">{loadError}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
        >
          <RefreshCw className="size-4" /> Try again
        </button>
      </div>
    );
  }

  if (isPending && enabled) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[88px] animate-pulse rounded-xl border border-border bg-muted/40" />
        ))}
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-10 text-center">
        <BedDouble className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">No room types published</p>
        <p className="text-xs text-muted-foreground">Add room types in settings before taking reservations.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Cart summary — compact, always visible when something is added */}
      {cartLines.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {totalRooms} room{totalRooms !== 1 ? "s" : ""} · {cartLines.length} type{cartLines.length !== 1 ? "s" : ""}
            </p>
            <p className="text-[11px] text-muted-foreground">One reservation — each room gets its own stay on the calendar</p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-background px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
            {cartLines.length}/{MAX_ROOM_TYPES} types · max {MAX_QTY_PER_LINE} each
          </span>
        </div>
      )}

      {atTypeLimit && (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
          Limit {MAX_ROOM_TYPES} room types per reservation — remove one to add another.
        </p>
      )}

      {/* Room cards — single column, Apple-clean, no table bloat */}
      <div className="flex flex-col gap-3">
        {rooms.map((room) => {
          const line = cartById.get(room.roomTypeId) ?? null;
          const selected = Boolean(line);
          const st = roomStockState(room);
          const blocked = !st.addable;
          const maxQty = Math.min(room.availableCount || MAX_QTY_PER_LINE, MAX_QTY_PER_LINE);
          const inCartQty = line?.quantity ?? 0;

          return (
            <div
              key={room.roomTypeId}
              className={cn(
                "rounded-xl border bg-background p-4 transition",
                selected ? "border-primary/30 bg-primary/[0.03] shadow-sm" : "border-border hover:border-border/80",
                blocked && !selected && "opacity-60"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{room.name}</span>
                    {selected && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground">
                        <Check className="size-3" /> Added
                      </span>
                    )}
                  </div>
                  {blocked ? (
                    <span className="mt-1 block text-[11px] font-medium text-destructive">{st.reason}</span>
                  ) : room.shortDescription ? (
                    <span className="mt-1 block truncate text-[11px] text-muted-foreground">{room.shortDescription}</span>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      {formatCurrency(room.subtotal, currency)} total · {formatCurrency(room.avgNightly, currency)}/night · {nightsLabel(nights)}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Sleeps {room.maxAdults}
                    {room.maxChildren > 0 ? ` + ${room.maxChildren} children` : ""} · per room
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <AvailabilityChip count={room.availableCount} />
                  {!selected ? (
                    <button
                      type="button"
                      disabled={blocked || atTypeLimit}
                      onClick={() => onAddLine(room)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition",
                        blocked || atTypeLimit
                          ? "cursor-not-allowed bg-muted text-muted-foreground"
                          : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                      )}
                    >
                      <Plus className="size-4" /> Add
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRemoveLine(room.roomTypeId)}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted"
                    >
                      <Trash2 className="size-3" /> Remove
                    </button>
                  )}
                </div>
              </div>

              {selected && line && (
                <div className="mt-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <Stepper
                    label={`Rooms · ${inCartQty} of ${maxQty} available`}
                    value={line.quantity}
                    min={1}
                    max={maxQty}
                    onChange={(n) => onUpdateLine(room.roomTypeId, { quantity: n })}
                  />
                  <div className="my-1 h-px bg-border/60" />
                  <Stepper
                    label="Adults · per room"
                    value={line.adults}
                    min={1}
                    max={room.maxAdults}
                    onChange={(n) => onUpdateLine(room.roomTypeId, { adults: n })}
                  />
                  <Stepper
                    label="Children · per room"
                    value={line.children}
                    min={0}
                    max={room.maxChildren > 0 ? room.maxChildren : 6}
                    onChange={(n) => onUpdateLine(room.roomTypeId, { children: n })}
                  />
                  <p className="pt-1 text-[11px] text-muted-foreground">
                    {line.adults} adult{line.adults !== 1 ? "s" : ""}
                    {line.children ? ` · ${line.children} child${line.children !== 1 ? "ren" : ""}` : ""} · per room
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isFetching && <p className="text-center text-[11px] text-muted-foreground">Refreshing availability…</p>}
    </div>
  );
}
