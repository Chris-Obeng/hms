"use client";

import * as React from "react";
import { Users } from "lucide-react";
import { Popover, Drawer, Button } from "@heroui/react";
import { NumericStepper } from "./numeric-stepper";
import { useIsCompactScreen } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface GuestPickerPopoverProps {
  adults: number;
  childrenCount: number;
  rooms: number;
  /** Upper bound for the rooms stepper (live availability cap). */
  maxRooms?: number;
  onAdultsChange: (val: number) => void;
  onChildrenChange: (val: number) => void;
  onRoomsChange: (val: number) => void;
  className?: string;
}

export function GuestPickerPopover({
  adults = 1,
  childrenCount = 0,
  rooms = 1,
  maxRooms,
  onAdultsChange,
  onChildrenChange,
  onRoomsChange,
  className,
}: GuestPickerPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const isCompact = useIsCompactScreen();
  const roomsMax = Math.max(1, Math.min(maxRooms ?? 5, 5));

  // Always show rooms (even default 1) — hotel OTA pattern (Booking.com, Expedia).
  // Children stay optional: omit when 0 to keep the default line short.
  const summaryText = React.useMemo(() => {
    const parts = [
      `${adults} ${adults === 1 ? "Adult" : "Adults"}`,
    ];
    if (childrenCount > 0) {
      parts.push(
        `${childrenCount} ${childrenCount === 1 ? "Child" : "Children"}`
      );
    }
    parts.push(`${rooms} ${rooms === 1 ? "Room" : "Rooms"}`);
    return parts.join(" · ");
  }, [adults, childrenCount, rooms]);

  const triggerButton = (
    <button
      type="button"
      className={cn(
        "flex items-center gap-2 sm:gap-2.5 h-12 sm:h-[52px] px-3 sm:px-3.5 rounded-xl bg-background/90 border border-border/80 hover:border-primary shadow-xs hover:shadow-sm text-left cursor-pointer outline-none transition-all w-full min-w-0",
        className
      )}
      aria-label="Select number of guests and rooms"
    >
      <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
        <Users className="size-4" />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
          Guests & Rooms
        </span>
        <span className="text-xs font-semibold text-foreground truncate">
          {summaryText}
        </span>
      </div>
    </button>
  );

  const steppers = (
    <>
      <NumericStepper
        label="Adults"
        description="Age 13 and above"
        value={adults}
        onChange={onAdultsChange}
        min={1}
        max={10}
      />
      <div className="h-px bg-border/40 my-1" />
      <NumericStepper
        label="Children"
        description="Age 0 to 12"
        value={childrenCount}
        onChange={onChildrenChange}
        min={0}
        max={6}
      />
      <div className="h-px bg-border/40 my-1" />
      <NumericStepper
        label="Rooms"
        description={
          maxRooms != null && maxRooms < 5
            ? `${maxRooms} available for these dates`
            : "Number of rooms needed"
        }
        value={rooms}
        onChange={onRoomsChange}
        min={1}
        max={roomsMax}
      />
    </>
  );

  // Compact phones: bottom sheet — steppers get full-width, thumb-friendly rows.
  if (isCompact) {
    return (
      <>
        {React.cloneElement(triggerButton, {
          onClick: () => setOpen(true),
          "aria-haspopup": "dialog",
          "aria-expanded": open,
        })}
        <Drawer.Backdrop isOpen={open} onOpenChange={setOpen} variant="blur">
          <Drawer.Content placement="bottom">
            <Drawer.Dialog className="booking-popover-panel rounded-t-2xl">
              <Drawer.Handle />
              <Drawer.CloseTrigger />
              <Drawer.Header>
                <Drawer.Heading>Guests & Rooms</Drawer.Heading>
              </Drawer.Header>
              <Drawer.Body className="space-y-1 pb-2">{steppers}</Drawer.Body>
              <Drawer.Footer className="pb-[max(1rem,env(safe-area-inset-bottom))]">
                <Button
                  variant="primary"
                  slot="close"
                  className="h-11 w-full rounded-xl text-sm font-semibold"
                >
                  Done
                </Button>
              </Drawer.Footer>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </>
    );
  }

  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Popover.Trigger>{triggerButton}</Popover.Trigger>

      <Popover.Content
        placement="bottom"
        className="p-0 border-border/60 w-[min(20rem,calc(100vw-1.25rem))]"
      >
        <Popover.Dialog className="outline-none p-3.5 sm:p-4 bg-card rounded-2xl shadow-xl space-y-2 booking-popover-panel">
          {steppers}

          <div className="pt-3 border-t border-border/40 flex justify-end">
            <Button
              variant="primary"
              size="sm"
              onPress={() => setOpen(false)}
              className="text-xs font-semibold px-4 h-9 min-w-[4.5rem] rounded-lg"
            >
              Done
            </Button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
