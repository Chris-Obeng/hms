"use client";

import { ListBox, Select } from "@heroui/react";

interface RoomQuantitySelectProps {
  roomName: string;
  /** Rooms of this type currently chosen (0 only once the type is in the cart). */
  value: number;
  /** Highest selectable count, at least 1. */
  maxSelectable: number;
  /** Offers "0 rooms" so a guest can drop a type already in the cart. */
  inCart: boolean;
  isDisabled?: boolean;
  onChange: (qty: number) => void;
  className?: string;
}

const roomsLabel = (count: number) => `${count} ${count === 1 ? "room" : "rooms"}`;

/** How many rooms of one type the guest wants, on the room list and in the room details. */
export function RoomQuantitySelect({
  roomName,
  value,
  maxSelectable,
  inCart,
  isDisabled,
  onChange,
  className,
}: RoomQuantitySelectProps) {
  const options = [
    ...(inCart ? [0] : []),
    ...Array.from({ length: Math.max(1, maxSelectable) }, (_, i) => i + 1),
  ];

  return (
    <Select
      aria-label={`Number of rooms for ${roomName}`}
      value={String(value)}
      onChange={(next) => {
        if (next == null) return;
        const qty = Number.parseInt(String(next), 10);
        if (Number.isFinite(qty)) onChange(qty);
      }}
      isDisabled={isDisabled}
      className={className}
    >
      <Select.Trigger className="h-11 md:h-10 w-full rounded-xl border border-[#DEDEE0] bg-white ps-3 pe-2 text-xs md:text-sm font-medium text-[#18181B] flex items-center justify-between gap-1 shadow-none hover:border-[#A1A1AA] focus-visible:border-[#0485F7] data-[disabled=true]:opacity-50">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover className="booking-portal min-w-(--trigger-width) p-1 max-h-64 overflow-y-auto bg-white border border-[#E4E4E7] rounded-2xl shadow-[0_12px_28px_rgb(0_0_0/0.12)] z-50 text-[#18181B]">
        <ListBox>
          {options.map((count) => (
            <ListBox.Item
              key={count}
              id={String(count)}
              textValue={roomsLabel(count)}
              className="text-sm ps-3 pe-8 py-2 rounded-lg cursor-pointer hover:bg-[#F5F5F5] text-[#18181B]"
            >
              {roomsLabel(count)}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
