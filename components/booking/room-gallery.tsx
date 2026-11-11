"use client";

import * as React from "react";
import Image from "next/image";
import { Modal, Drawer } from "@heroui/react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  BedDouble,
  Users,
  Wifi,
  AirVent,
  Tv,
  Refrigerator,
  ShowerHead,
  Coffee,
  ShieldCheck,
  Sun,
  Bath,
  Utensils,
  Laptop,
  Phone,
  KeyRound,
  PawPrint,
  Accessibility,
  type LucideIcon,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

export interface GalleryImage {
  url: string;
  caption?: string;
}

interface RoomGalleryProps {
  images: GalleryImage[];
  roomName: string;
  shortDescription?: string | null;
  description?: string | null;
  bedConfiguration?: string | null;
  maxAdults: number;
  maxChildren: number;
  amenities?: { icon: string; label: string }[];
  formattedPrice: string;
  taxEnabled: boolean;
  availableCount: number | null;
  restrictionReason: string | null;
  selectedQty: number;
  maxSelectable: number;
  inCart: boolean;
  blocked: boolean;
  atLimit: boolean;
  onQtyChange: (qty: number) => void;
  onBook: () => void;
  open: boolean;
  onClose: () => void;
}

const AMENITY_ICONS: Record<string, LucideIcon> = {
  wifi: Wifi,
  "air-vents": AirVent,
  tv: Tv,
  fridge: Refrigerator,
  shower: ShowerHead,
  coffee: Coffee,
  safe: ShieldCheck,
  balcony: Sun,
  bathtub: Bath,
  breakfast: Utensils,
  desk: Laptop,
  phone: Phone,
  "key-card": KeyRound,
  pet: PawPrint,
  wheelchair: Accessibility,
};

function resolveAmenityIcon(iconKey: string, label: string): LucideIcon {
  if (AMENITY_ICONS[iconKey]) return AMENITY_ICONS[iconKey];
  const lower = label.toLowerCase();
  if (lower.includes("wifi") || lower.includes("internet")) return Wifi;
  if (lower.includes("air") || lower.includes("ac")) return AirVent;
  if (lower.includes("tv") || lower.includes("television")) return Tv;
  if (lower.includes("mini bar") || lower.includes("fridge")) return Refrigerator;
  if (lower.includes("bath") && lower.includes("jacuzzi")) return Bath;
  if (lower.includes("bath") || lower.includes("shower")) return ShowerHead;
  if (lower.includes("coffee") || lower.includes("tea")) return Coffee;
  if (lower.includes("safe")) return ShieldCheck;
  if (lower.includes("balcony") || lower.includes("patio")) return Sun;
  if (lower.includes("breakfast") || lower.includes("dining")) return Utensils;
  if (lower.includes("desk") || lower.includes("work")) return Laptop;
  if (lower.includes("phone")) return Phone;
  if (lower.includes("key")) return KeyRound;
  if (lower.includes("pet")) return PawPrint;
  if (lower.includes("wheelchair") || lower.includes("access"))
    return Accessibility;
  return Check;
}

export function RoomGallery({
  images,
  roomName,
  shortDescription,
  description,
  bedConfiguration,
  maxAdults,
  maxChildren,
  amenities = [],
  formattedPrice,
  taxEnabled,
  availableCount,
  restrictionReason,
  selectedQty,
  maxSelectable,
  inCart,
  blocked,
  atLimit,
  onQtyChange,
  onBook,
  open,
  onClose,
}: RoomGalleryProps) {
  const isMobile = useIsMobile();
  const [current, setCurrent] = React.useState(0);

  const [prevOpen, setPrevOpen] = React.useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) setCurrent(0);
  }

  React.useEffect(() => {
    if (!open || images.length <= 1) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") {
        setCurrent((c) => Math.min(c + 1, images.length - 1));
      } else if (e.key === "ArrowLeft") {
        setCurrent((c) => Math.max(c - 1, 0));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, images.length]);

  const touchStart = React.useRef<number | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    touchStart.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStart.current === null) return;
    const delta = touchStart.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 45) {
      if (delta > 0) setCurrent((c) => Math.min(c + 1, images.length - 1));
      else setCurrent((c) => Math.max(c - 1, 0));
    }
    touchStart.current = null;
  }

  const safeIndex = Math.min(current, Math.max(0, images.length - 1));
  const activeImage = images[safeIndex] ?? null;
  const fullCopy = description?.trim() || shortDescription?.trim() || null;

  const sleepsLabel =
    maxChildren > 0
      ? `Sleeps ${maxAdults} ${
          maxAdults === 1 ? "adult" : "adults"
        } + ${maxChildren} ${maxChildren === 1 ? "child" : "children"}`
      : `Sleeps ${maxAdults} ${maxAdults === 1 ? "adult" : "adults"}`;

  const scarce =
    !blocked &&
    availableCount !== null &&
    availableCount > 0 &&
    availableCount <= 2;

  const statusBadge = blocked ? (
    <span className="inline-flex items-center rounded-full bg-[#EBEBEC] px-2.5 py-0.5 text-[11px] font-medium text-[#71717A]">
      Not available
    </span>
  ) : scarce ? (
    <span className="inline-flex items-center rounded-full bg-[#F5A524]/15 px-2.5 py-0.5 text-[11px] font-medium text-[#F5A524]">
      Only {availableCount} left
    </span>
  ) : availableCount !== null && availableCount > 2 ? (
    <span className="inline-flex items-center rounded-full bg-[#17C964]/15 px-2.5 py-0.5 text-[11px] font-medium text-[#17C964]">
      Available
    </span>
  ) : null;

  const qtyOptions = Array.from(
    { length: Math.max(1, maxSelectable) },
    (_, i) => i + 1
  );

  const photoStage = (aspectClass: string) => (
    <div className="flex flex-col gap-2.5 min-h-0 h-full">
      <div
        className={`relative w-full overflow-hidden rounded-[18px] bg-[#EBEBEC] select-none ${aspectClass}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {activeImage ? (
          <Image
            src={activeImage.url}
            alt={
              activeImage.caption ||
              `${roomName} — photo ${safeIndex + 1} of ${images.length}`
            }
            fill
            className="object-cover"
            priority
            sizes="(max-width: 767px) 100vw, 520px"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[#A1A1AA]">
            <span className="text-2xl font-semibold tracking-wider">
              {roomName
                .split(" ")
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <span className="text-xs text-[#71717A]">No photos uploaded</span>
          </div>
        )}

        {images.length > 0 && (
          <span className="absolute top-3 left-3 inline-flex items-center rounded-full bg-white/92 backdrop-blur-md px-2.5 py-1 text-[11px] font-semibold text-[#18181B] shadow-[0_2px_8px_rgb(0_0_0/0.1)] tabular-nums">
            {safeIndex + 1} / {images.length}
          </span>
        )}

        {images.length > 1 && safeIndex > 0 && (
          <button
            type="button"
            onClick={() => setCurrent((c) => Math.max(0, c - 1))}
            aria-label="Previous photo"
            className="absolute left-3 top-1/2 -translate-y-1/2 flex size-9 items-center justify-center rounded-full bg-white/92 hover:bg-white text-[#18181B] shadow-[0_2px_10px_rgb(0_0_0/0.14)] active:scale-95 transition-all cursor-pointer touch-manipulation"
          >
            <ChevronLeft className="size-4 stroke-[2.25]" />
          </button>
        )}

        {images.length > 1 && safeIndex < images.length - 1 && (
          <button
            type="button"
            onClick={() =>
              setCurrent((c) => Math.min(images.length - 1, c + 1))
            }
            aria-label="Next photo"
            className="absolute right-3 top-1/2 -translate-y-1/2 flex size-9 items-center justify-center rounded-full bg-white/92 hover:bg-white text-[#18181B] shadow-[0_2px_10px_rgb(0_0_0/0.14)] active:scale-95 transition-all cursor-pointer touch-manipulation"
          >
            <ChevronRight className="size-4 stroke-[2.25]" />
          </button>
        )}

        {activeImage?.caption && (
          <span className="absolute bottom-3 left-3 right-3 truncate rounded-full bg-white/92 backdrop-blur-md px-3 py-1 text-center text-[11px] font-medium text-[#18181B] shadow-[0_2px_8px_rgb(0_0_0/0.1)]">
            {activeImage.caption}
          </span>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto py-0.5 px-0.5 no-scrollbar shrink-0">
          {images.map((img, i) => {
            const selected = i === safeIndex;
            return (
              <button
                key={`${img.url}-${i}`}
                type="button"
                onClick={() => setCurrent(i)}
                aria-label={`View photo ${i + 1}`}
                aria-current={selected ? "true" : undefined}
                className={`relative h-12 w-16 shrink-0 overflow-hidden rounded-[10px] bg-[#EBEBEC] transition-all cursor-pointer touch-manipulation ${
                  selected
                    ? "ring-2 ring-[#0485F7] ring-offset-2 ring-offset-white md:ring-offset-[#F5F5F5] opacity-100"
                    : "opacity-60 hover:opacity-95"
                }`}
              >
                <Image
                  src={img.url}
                  alt={img.caption || `${roomName} thumbnail ${i + 1}`}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const detailsSections = (
    <div className="space-y-5">
      {/* Specs pills */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex items-start gap-2.5 rounded-[14px] bg-[#F5F5F5] px-3.5 py-2.5">
          <BedDouble
            className="size-4 shrink-0 text-[#0485F7] mt-0.5"
            strokeWidth={2}
          />
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-[#71717A]">Bedding</p>
            <p className="text-[12px] font-semibold text-[#18181B] leading-snug">
              {bedConfiguration || "Standard bed"}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2.5 rounded-[14px] bg-[#F5F5F5] px-3.5 py-2.5">
          <Users
            className="size-4 shrink-0 text-[#0485F7] mt-0.5"
            strokeWidth={2}
          />
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-[#71717A]">Occupancy</p>
            <p className="text-[12px] font-semibold text-[#18181B] leading-snug">
              {sleepsLabel}
            </p>
          </div>
        </div>
      </div>

      {restrictionReason && (
        <div className="rounded-[12px] bg-[#F5A524]/12 px-3.5 py-2.5 text-[12px] font-medium text-[#B4690E]">
          {restrictionReason}
        </div>
      )}

      {/* Full room description */}
      {fullCopy && (
        <div className="space-y-1.5">
          <h3 className="text-[12px] font-semibold text-[#18181B]">
            About this room
          </h3>
          <p className="text-[13px] leading-relaxed text-[#52525B] whitespace-pre-line">
            {fullCopy}
          </p>
        </div>
      )}

      {/* Full amenities list — never truncated */}
      {amenities.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[12px] font-semibold text-[#18181B]">
            Room amenities
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {amenities.map((a) => {
              const Icon = resolveAmenityIcon(a.icon, a.label);
              return (
                <div
                  key={a.label}
                  className="flex items-center gap-2 rounded-[10px] bg-[#F5F5F5] px-3 py-2 text-[12px] font-medium text-[#18181B]"
                >
                  <Icon
                    className="size-3.5 shrink-0 text-[#0485F7]"
                    strokeWidth={2}
                  />
                  <span className="truncate">{a.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const actionFooter = (
    <div className="flex items-center justify-between gap-3 w-full">
      <div className="min-w-0">
        <p className="booking-mono text-[20px] font-semibold tracking-[-0.3px] text-[#18181B] leading-tight">
          {formattedPrice}
        </p>
        <p className="text-[11px] text-[#71717A]">
          {taxEnabled ? "per night · excl. taxes & fees" : "per night"}
        </p>
      </div>

      {blocked && !inCart ? (
        <span className="inline-flex h-10 px-5 items-center justify-center rounded-full bg-[#EBEBEC] text-[13px] font-medium text-[#A1A1AA] shrink-0">
          Not available
        </span>
      ) : (
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="relative">
            <select
              aria-label={`Number of rooms for ${roomName}`}
              value={selectedQty}
              disabled={atLimit && !inCart}
              onChange={(e) =>
                onQtyChange(Number.parseInt(e.target.value, 10))
              }
              className="h-10 w-[98px] appearance-none rounded-[12px] border border-[#DEDEE0] bg-white pl-3 pr-7 text-[13px] font-medium text-[#18181B] outline-none hover:border-[#A1A1AA] focus:border-[#0485F7] cursor-pointer disabled:opacity-50"
            >
              {inCart && <option value={0}>0 rooms</option>}
              {qtyOptions.map((q) => (
                <option key={q} value={q}>
                  {q} {q === 1 ? "room" : "rooms"}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#71717A]"
              strokeWidth={2}
            />
          </div>

          {inCart ? (
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-full border border-[#0485F7] bg-[#0485F7]/12 px-4 text-[14px] font-semibold text-[#0485F7] hover:bg-[#0485F7]/18 inline-flex items-center gap-1.5 cursor-pointer transition-colors touch-manipulation"
            >
              <Check className="size-4 stroke-[2.5]" />
              <span>Selected</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={atLimit}
              onClick={() => {
                onBook();
                onClose();
              }}
              className="booking-btn-primary h-10 px-5 inline-flex items-center justify-center text-[15px] cursor-pointer touch-manipulation"
            >
              {atLimit ? "Limit reached" : "Book"}
            </button>
          )}
        </div>
      )}
    </div>
  );

  // Mobile (<768px): light-mode bottom sheet
  if (isMobile) {
    return (
      <Drawer.Backdrop
        isOpen={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        variant="blur"
        className="booking-portal"
      >
        <Drawer.Content placement="bottom" className="booking-portal">
          <Drawer.Dialog className="booking-sheet-dialog">
            <Drawer.Handle />
            <Drawer.CloseTrigger />
            <Drawer.Header>
              <div className="flex flex-wrap items-center gap-2">
                <Drawer.Heading>{roomName}</Drawer.Heading>
                {statusBadge}
              </div>
            </Drawer.Header>
            <Drawer.Body className="space-y-4">
              {photoStage("aspect-[16/10]")}
              {detailsSections}
            </Drawer.Body>
            <Drawer.Footer>{actionFooter}</Drawer.Footer>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    );
  }

  // Desktop (>=768px): light-mode 2-column split hospitality dialog
  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      variant="blur"
      className="booking-portal bg-black/35 backdrop-blur-[2px]"
    >
      <Modal.Container
        placement="center"
        className="booking-portal sm:w-full sm:max-w-[940px] sm:p-6"
      >
        <Modal.Dialog
          aria-label={`${roomName} details`}
          className="w-full max-w-[940px] rounded-[24px] border border-[#E4E4E7] bg-white p-0 shadow-[0_24px_64px_rgb(0_0_0/0.16)] overflow-hidden"
        >
          <div className="grid grid-cols-[1.15fr_1fr] h-[min(82dvh,600px)]">
            {/* Left light photo stage */}
            <div className="bg-[#F5F5F5] p-4 flex flex-col min-h-0">
              {photoStage("flex-1 min-h-[260px]")}
            </div>

            {/* Right details + sticky footer */}
            <div className="bg-white flex flex-col min-h-0 border-l border-[#E4E4E7]">
              <div className="px-6 pt-5 pb-4 border-b border-[#E4E4E7] flex items-start justify-between gap-3 shrink-0">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[19px] font-semibold tracking-[-0.3px] text-[#18181B] leading-snug">
                      {roomName}
                    </h2>
                    {statusBadge}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close room details"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#F5F5F5] hover:bg-[#EBEBEC] text-[#71717A] hover:text-[#18181B] transition-colors cursor-pointer"
                >
                  <X className="size-4" strokeWidth={2} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
                {detailsSections}
              </div>

              <div className="px-6 py-4 border-t border-[#E4E4E7] bg-white shrink-0">
                {actionFooter}
              </div>
            </div>
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
