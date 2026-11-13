"use client";

import * as React from "react";
import { Users, ChevronDown } from "lucide-react";
import { Popover, Drawer, Button } from "@heroui/react";
import { NumericStepper } from "./numeric-stepper";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface GuestPickerPopoverProps {
  adults: number;
  childrenCount: number;
  rooms: number;
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
  const isMobile = useIsMobile();
  const roomsMax = Math.max(1, Math.min(maxRooms ?? 5, 5));

  const desktopText = React.useMemo(() => {
    const parts = [`${adults} ${adults === 1 ? "adult" : "adults"}`];
    if (childrenCount > 0) {
      parts.push(
        `${childrenCount} ${childrenCount === 1 ? "child" : "children"}`
      );
    }
    if (rooms > 1) {
      parts.push(`${rooms} rooms`);
    }
    return parts.join(", ");
  }, [adults, childrenCount, rooms]);

  const mobileText = React.useMemo(() => {
    const parts = [`${adults} ${adults === 1 ? "adult" : "adults"}`];
    if (childrenCount > 0) {
      parts.push(
        `${childrenCount} ${childrenCount === 1 ? "child" : "children"}`
      );
    }
    if (rooms > 1) {
      parts.push(`${rooms} rooms`);
    }
    return parts.join(" · ");
  }, [adults, childrenCount, rooms]);

  const triggerButton = (
    <button
      type="button"
      className={cn(
        "group flex w-full cursor-pointer text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#0485F7] touch-manipulation",
        // Mobile (`v24Sj`): 50px soft grey cell, stacked Who + guests
        "h-12 flex-col justify-center gap-1 rounded-xl bg-[#F5F5F5] hover:bg-[#EBEBEC]/75 px-3",
        // Desktop (`dZjQo`): 52px soft grey cell, left users icon + stacked label/guests
        "md:h-[52px] md:w-auto md:min-w-[180px] md:flex-row md:items-center md:justify-start md:gap-3 md:px-4",
        className
      )}
      aria-label="Select number of guests and rooms"
    >
      <Users
        className="hidden md:block size-4 shrink-0 text-[#0485F7]"
        strokeWidth={2}
      />

      {/* Mobile top row */}
      <span className="flex md:hidden items-center gap-2">
        <Users className="size-3 shrink-0 text-[#0485F7]" strokeWidth={2} />
        <span className="text-2xs font-medium tracking-[0.2px] text-[#71717A]">
          Who
        </span>
      </span>

      {/* Desktop stacked + Mobile bottom row */}
      <span className="flex flex-col min-w-0 w-full md:w-auto gap-1">
        <span className="hidden md:block text-2xs font-medium tracking-[0.3px] text-[#71717A]">
          Who
        </span>
        <span className="flex items-center justify-between md:justify-start gap-2 min-w-0">
          <span className="hidden md:inline text-sm font-medium text-[#18181B] truncate whitespace-nowrap">
            {desktopText}
          </span>
          <span className="inline md:hidden text-2xs font-medium text-[#18181B] truncate whitespace-nowrap">
            {mobileText}
          </span>
          <ChevronDown
            className={cn(
              "size-3 md:size-4 shrink-0 text-[#71717A] transition-transform duration-150",
              open && "rotate-180"
            )}
            strokeWidth={2}
          />
        </span>
      </span>
    </button>
  );

  const renderSteppers = (stepperSize: "md" | "lg") => (
    <div className="divide-y divide-[#E4E4E7]">
      <NumericStepper
        label="Adults"
        description="Age 13 and above"
        value={adults}
        onChange={onAdultsChange}
        min={1}
        max={10}
        size={stepperSize}
      />
      <NumericStepper
        label="Children"
        description="Age 0 to 12"
        value={childrenCount}
        onChange={onChildrenChange}
        min={0}
        max={6}
        size={stepperSize}
      />
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
        size={stepperSize}
      />
    </div>
  );

  if (isMobile) {
    return (
      <>
        {React.cloneElement(triggerButton, {
          onClick: () => setOpen(true),
          "aria-haspopup": "dialog",
          "aria-expanded": open,
        })}
        <Drawer.Backdrop
          isOpen={open}
          onOpenChange={setOpen}
          variant="blur"
          className="booking-portal"
        >
          <Drawer.Content placement="bottom" className="booking-portal">
            <Drawer.Dialog className="booking-sheet-dialog">
              <Drawer.Handle />
              <Drawer.CloseTrigger />
              <Drawer.Header>
                <Drawer.Heading>Who is staying?</Drawer.Heading>
              </Drawer.Header>
              <Drawer.Body>{renderSteppers("lg")}</Drawer.Body>
              <Drawer.Footer>
                <Button
                  variant="primary"
                  slot="close"
                  className="booking-btn-primary h-11 w-full text-md touch-manipulation"
                >
                  Apply · {mobileText}
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
        placement="bottom start"
        className="booking-portal w-[min(21rem,calc(100vw-1.5rem))] rounded-3xl border border-[#E4E4E7] bg-white p-0 shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
      >
        <Popover.Dialog className="outline-none p-6 space-y-2">
          {renderSteppers("md")}

          <div className="pt-3 border-t border-[#E4E4E7] flex items-center justify-between gap-3">
            <span className="text-xs text-[#71717A] truncate">
              {desktopText}
            </span>
            <Button
              variant="primary"
              size="sm"
              onPress={() => setOpen(false)}
              className="booking-btn-primary text-xs px-4 h-10 min-w-[4.5rem] shrink-0"
            >
              Done
            </Button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
