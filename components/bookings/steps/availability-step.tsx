"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { BedDouble, Check, RefreshCw, Users } from "lucide-react";
import { getStaffAvailability, type StaffAvailabilityRoom } from "@/app/actions/availability";
import { NumericStepper } from "@/components/booking/numeric-stepper";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, nightsLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

interface AvailabilityStepProps {
  checkIn: string | null;
  checkOut: string | null;
  currency: string;
  nights: number;
  adults: number;
  childrenCount: number;
  onAdultsChange: (n: number) => void;
  onChildrenChange: (n: number) => void;
  selectedRoomTypeId: string | null;
  onSelectRoom: (room: StaffAvailabilityRoom | null) => void;
  prefillRoomTypeId?: string;
}

/** Inventory + policy + capacity resolve to one selectable/blocked verdict. */
function roomState(room: StaffAvailabilityRoom, adults: number, childrenCount: number) {
  const fits = adults <= room.maxAdults && childrenCount <= room.maxChildren;
  if (!room.available) return { selectable: false, reason: "Sold out" };
  if (!room.sellable) return { selectable: false, reason: room.restrictionReason ?? "Unavailable for these dates" };
  if (!fits) {
    const cap = room.maxChildren > 0 ? `${room.maxAdults} adults · ${room.maxChildren} children` : `${room.maxAdults} guests`;
    return { selectable: false, reason: `Max ${cap}` };
  }
  return { selectable: true, reason: null as string | null };
}

function AvailabilityChip({ count }: { count: number }) {
  if (count <= 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
        Sold out
      </span>
    );
  }
  const low = count <= 3;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        low ? "bg-amber-500/10 text-amber-700" : "bg-emerald-500/10 text-emerald-700"
      )}
    >
      {count} left
    </span>
  );
}

export function AvailabilityStep({
  checkIn,
  checkOut,
  currency,
  nights,
  adults,
  childrenCount,
  onAdultsChange,
  onChildrenChange,
  selectedRoomTypeId,
  onSelectRoom,
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

  const maxAdultsCap = rooms.length ? Math.max(...rooms.map((r) => r.maxAdults)) : 6;
  const maxChildrenCap = rooms.length ? Math.max(...rooms.map((r) => r.maxChildren)) : 4;

  const anySelectable = rooms.some((r) => roomState(r, adults, childrenCount).selectable);

  // Auto-select the prefilled room type once it lands, if it fits.
  const prefillApplied = React.useRef(false);
  React.useEffect(() => {
    if (prefillApplied.current || !prefillRoomTypeId || !rooms.length) return;
    const match = rooms.find((r) => r.roomTypeId === prefillRoomTypeId);
    if (match && roomState(match, adults, childrenCount).selectable) {
      prefillApplied.current = true;
      onSelectRoom(match);
    }
  }, [rooms, prefillRoomTypeId, adults, childrenCount, onSelectRoom]);

  // Drop a selection that no longer fits the current occupancy or availability.
  React.useEffect(() => {
    if (!selectedRoomTypeId) return;
    const sel = rooms.find((r) => r.roomTypeId === selectedRoomTypeId);
    if (rooms.length && (!sel || !roomState(sel, adults, childrenCount).selectable)) {
      onSelectRoom(null);
    }
  }, [adults, childrenCount, rooms, selectedRoomTypeId, onSelectRoom]);

  function handlePick(room: StaffAvailabilityRoom) {
    if (!roomState(room, adults, childrenCount).selectable) return;
    onSelectRoom(selectedRoomTypeId === room.roomTypeId ? null : room);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Occupancy */}
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Users className="size-4 text-muted-foreground" />
          Occupancy
        </div>
        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          <NumericStepper value={adults} onChange={onAdultsChange} min={1} max={maxAdultsCap} label="Adults" size="sm" />
          <NumericStepper value={childrenCount} onChange={onChildrenChange} min={0} max={maxChildrenCap} label="Children" size="sm" />
        </div>
      </div>

      {loadError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">Couldn&apos;t load availability</p>
          <p className="max-w-sm text-xs text-muted-foreground">{loadError}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <RefreshCw className="size-3.5" /> Try again
          </button>
        </div>
      ) : isPending && enabled ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-muted/40" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-10 text-center">
          <BedDouble className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No room types published</p>
          <p className="text-xs text-muted-foreground">Add room types in settings before taking reservations.</p>
        </div>
      ) : (
        <>
          {!anySelectable && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
              No rooms fit this stay and occupancy. Adjust the dates or guest count.
            </div>
          )}

          {/* Desktop table */}
          <div className="hidden sm:block">
            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Room type</TableHead>
                    <TableHead>Availability</TableHead>
                    <TableHead className="text-right">Price · {nightsLabel(nights)}</TableHead>
                    <TableHead className="w-16 text-center">Select</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rooms.map((room) => {
                    const st = roomState(room, adults, childrenCount);
                    const selected = selectedRoomTypeId === room.roomTypeId;
                    return (
                      <TableRow
                        key={room.roomTypeId}
                        data-state={selected ? "selected" : undefined}
                        onClick={() => handlePick(room)}
                        className={cn(
                          st.selectable ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                          selected && "bg-primary/5"
                        )}
                      >
                        <TableCell className="max-w-[220px]">
                          <span className="block text-sm font-semibold text-foreground">{room.name}</span>
                          {st.reason ? (
                            <span className="block text-[11px] font-medium text-muted-foreground">{st.reason}</span>
                          ) : room.shortDescription ? (
                            <span className="block truncate text-[11px] text-muted-foreground">{room.shortDescription}</span>
                          ) : null}
                        </TableCell>
                        <TableCell><AvailabilityChip count={room.availableCount} /></TableCell>
                        <TableCell className="text-right">
                          <span className="block text-sm font-bold tabular-nums text-foreground">{formatCurrency(room.subtotal, currency)}</span>
                          <span className="block text-[11px] text-muted-foreground tabular-nums">{formatCurrency(room.avgNightly, currency)}/night</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            role="radio"
                            aria-checked={selected}
                            aria-disabled={!st.selectable}
                            className={cn(
                              "inline-flex size-5 items-center justify-center rounded-full border-2 transition-colors",
                              selected ? "border-primary bg-primary text-primary-foreground" : "border-border",
                              !st.selectable && "opacity-40"
                            )}
                          >
                            {selected && <Check className="size-3" strokeWidth={3} />}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-2 sm:hidden">
            {rooms.map((room) => {
              const st = roomState(room, adults, childrenCount);
              const selected = selectedRoomTypeId === room.roomTypeId;
              return (
                <button
                  key={room.roomTypeId}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={!st.selectable}
                  onClick={() => handlePick(room)}
                  className={cn(
                    "flex flex-col gap-2 rounded-xl border px-3.5 py-3 text-left transition-colors",
                    selected ? "border-primary bg-primary/8 ring-1 ring-primary/25" : "border-border bg-background",
                    !st.selectable && "cursor-not-allowed opacity-60"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">{room.name}</span>
                      {st.reason ? (
                        <span className="block text-[11px] font-medium text-muted-foreground">{st.reason}</span>
                      ) : room.shortDescription ? (
                        <span className="block truncate text-[11px] text-muted-foreground">{room.shortDescription}</span>
                      ) : null}
                    </div>
                    <AvailabilityChip count={room.availableCount} />
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <span className="block text-sm font-bold tabular-nums text-foreground">{formatCurrency(room.subtotal, currency)}</span>
                      <span className="block text-[11px] text-muted-foreground tabular-nums">{formatCurrency(room.avgNightly, currency)}/night</span>
                    </div>
                    <span
                      aria-hidden
                      className={cn(
                        "inline-flex size-5 items-center justify-center rounded-full border-2",
                        selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
                      )}
                    >
                      {selected && <Check className="size-3" strokeWidth={3} />}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {isFetching && (
            <p className="text-center text-[11px] text-muted-foreground">Refreshing availability…</p>
          )}
        </>
      )}
    </div>
  );
}

