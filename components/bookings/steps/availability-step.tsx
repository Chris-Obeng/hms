"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { BedDouble, Trash2 } from "lucide-react";
import { Alert, Button, Chip, Label, NumberField, Skeleton } from "@heroui/react";
import { getStaffAvailability, type StaffAvailabilityRoom } from "@/app/actions/availability";
import { formatCurrency } from "@/lib/format";
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

function StockChip({ count }: { count: number }) {
  if (count <= 0) {
    return (
      <Chip size="sm" variant="soft" color="danger" className="shrink-0">
        Sold out
      </Chip>
    );
  }
  if (count > 3) return null;
  return (
    <Chip size="sm" variant="soft" color="warning" className="shrink-0 tabular-nums">
      {count} left
    </Chip>
  );
}

/** HeroUI NumberField laid out label-left on phones and label-above from `sm`. */
function Counter({
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
  return (
    <NumberField
      value={value}
      minValue={min}
      maxValue={max}
      onChange={(n) => {
        if (typeof n === "number" && !Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
      }}
      className="flex-row items-center justify-between gap-3 sm:flex-col sm:items-stretch sm:gap-1"
    >
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <NumberField.Group className="w-32 sm:w-full">
        <NumberField.DecrementButton />
        <NumberField.Input className="min-w-0 text-center tabular-nums" />
        <NumberField.IncrementButton />
      </NumberField.Group>
    </NumberField>
  );
}

/**
 * Step 2: one row per room type with its nightly and stay price. Adding a type
 * opens its room, adult and child counts inline; the running total sits in
 * the modal footer.
 */
export function AvailabilityStep({
  checkIn,
  checkOut,
  currency,
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
      <Alert status="danger" className="rounded-2xl">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Couldn&apos;t load availability</Alert.Title>
          <Alert.Description>{loadError}</Alert.Description>
        </Alert.Content>
        <Button size="sm" variant="secondary" onPress={() => refetch()} className="rounded-lg">
          Try again
        </Button>
      </Alert>
    );
  }

  if (isPending && enabled) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-muted-foreground">
          <BedDouble className="size-5" aria-hidden />
        </span>
        <p className="text-sm font-semibold text-foreground">No room types yet</p>
        <p className="text-xs text-muted-foreground">Add room types in settings to take bookings.</p>
      </div>
    );
  }

  return (
    <ul className={cn("flex flex-col gap-3 transition-opacity duration-150", isFetching && "opacity-70")}>
      {rooms.map((room) => {
        const line = cartById.get(room.roomTypeId) ?? null;
        const selected = Boolean(line);
        const st = roomStockState(room);
        const blocked = !st.addable;
        const maxQty = Math.min(room.availableCount || MAX_QTY_PER_LINE, MAX_QTY_PER_LINE);
        const subline = blocked && room.available ? st.reason : room.shortDescription;

        return (
          <li
            key={room.roomTypeId}
            className={cn(
              "rounded-2xl border transition-colors duration-150",
              selected ? "border-primary/40 bg-primary/[0.03]" : "border-border/70 bg-card",
              blocked && !selected && "opacity-60"
            )}
          >
            <div className="flex items-center gap-3 p-4 sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">{room.name}</p>
                  <StockChip count={room.availableCount} />
                </div>
                {subline && (
                  <p className={cn("mt-1 truncate text-xs", blocked ? "text-destructive" : "text-muted-foreground")}>
                    {subline}
                  </p>
                )}
                {/* Phones: price folds under the name so the name keeps its width */}
                <p className="mt-1 truncate text-xs tabular-nums text-muted-foreground sm:hidden">
                  <span className="font-semibold text-foreground">{formatCurrency(room.subtotal, currency)}</span>
                  {" · "}
                  {formatCurrency(room.avgNightly, currency)} / night
                </p>
              </div>

              <div className="hidden shrink-0 text-right sm:block">
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {formatCurrency(room.subtotal, currency)}
                </p>
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {formatCurrency(room.avgNightly, currency)} / night
                </p>
              </div>

              {selected ? (
                <Button
                  isIconOnly
                  variant="ghost"
                  aria-label={`Remove ${room.name}`}
                  onPress={() => onRemoveLine(room.roomTypeId)}
                  className="shrink-0 rounded-xl text-muted-foreground"
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  isDisabled={blocked || atTypeLimit}
                  onPress={() => onAddLine(room)}
                  className="w-16 shrink-0 rounded-xl font-semibold text-primary"
                >
                  Add
                </Button>
              )}
            </div>

            {selected && line && (
              <div className="grid grid-cols-1 gap-3 border-t border-primary/15 px-4 py-3 sm:grid-cols-3 sm:gap-4">
                <Counter
                  label="Rooms"
                  value={line.quantity}
                  min={1}
                  max={maxQty}
                  onChange={(n) => onUpdateLine(room.roomTypeId, { quantity: n })}
                />
                <Counter
                  label="Adults per room"
                  value={line.adults}
                  min={1}
                  max={room.maxAdults}
                  onChange={(n) => onUpdateLine(room.roomTypeId, { adults: n })}
                />
                <Counter
                  label="Children per room"
                  value={line.children}
                  min={0}
                  max={room.maxChildren > 0 ? room.maxChildren : 6}
                  onChange={(n) => onUpdateLine(room.roomTypeId, { children: n })}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
