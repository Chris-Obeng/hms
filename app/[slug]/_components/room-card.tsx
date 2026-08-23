"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Card, Chip, Button } from "@heroui/react";
import { RoomGallery, type GalleryImage } from "@/components/booking/room-gallery";
import { Camera } from "lucide-react";

interface RoomCardProps {
  slug: string;
  id: string;
  name: string;
  shortDescription: string | null;
  basePrice: number;
  currency: string;
  images: GalleryImage[];
  amenities?: { icon: string; label: string }[];
  checkIn?: string;
  checkOut?: string;
  availableCount?: number | null;
  datesSelected?: boolean;
  /** Party context carried through to the booking wizard. */
  adults?: string;
  childGuests?: string;
  rooms?: string;
}

export function RoomCard({
  slug,
  id,
  name,
  shortDescription,
  basePrice,
  currency,
  images,
  amenities,
  checkIn,
  checkOut,
  availableCount,
  datesSelected,
  adults,
  childGuests,
  rooms,
}: RoomCardProps) {
  const router = useRouter();
  const [galleryOpen, setGalleryOpen] = React.useState(false);

  const bookHref = React.useMemo(() => {
    const params = new URLSearchParams({ room_type_id: id });
    if (checkIn) params.set("check_in", checkIn);
    if (checkOut) params.set("check_out", checkOut);
    if (adults) params.set("adults", adults);
    if (childGuests && childGuests !== "0") params.set("children", childGuests);
    if (rooms && rooms !== "1") params.set("rooms", rooms);
    return `/${slug}/book?${params.toString()}`;
  }, [slug, id, checkIn, checkOut, adults, childGuests, rooms]);

  const firstImage = images[0]?.url ?? null;
  const isSoldOut =
    availableCount !== null &&
    availableCount !== undefined &&
    availableCount === 0;

  return (
    <>
      <Card
        variant="default"
        className={`group overflow-hidden rounded-2xl border border-[var(--bk-line)] bg-[var(--bk-surface)] shadow-[var(--bk-shadow)] transition-all duration-300 hover:shadow-[var(--bk-shadow-lg)] hover:border-[var(--bk-line-strong)] h-full flex flex-col ${
          isSoldOut ? "opacity-70" : ""
        }`}
      >
        <div
          className="relative aspect-[16/10] bg-[var(--bk-surface-soft)] overflow-hidden cursor-pointer"
          onClick={() => {
            if (images.length > 0) setGalleryOpen(true);
          }}
          role={images.length > 0 ? "button" : undefined}
          tabIndex={images.length > 0 ? 0 : undefined}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && images.length > 0) {
              e.preventDefault();
              setGalleryOpen(true);
            }
          }}
          aria-label={images.length > 0 ? `View photos of ${name}` : undefined}
        >
          {firstImage ? (
            <Image
              src={firstImage}
              alt={name}
              fill
              className="object-cover group-hover:scale-[1.03] transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--bk-surface-soft)]">
              <span className="text-2xl font-semibold text-[var(--bk-muted)]/50 tracking-wide">
                {name
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
            </div>
          )}

          {images.length > 1 && (
            <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full bg-[var(--bk-ink)]/70 backdrop-blur-sm text-white text-[10px] font-semibold flex items-center gap-1.5">
              <Camera className="size-3" strokeWidth={1.75} />
              <span>{images.length}</span>
            </div>
          )}

          {availableCount !== null && availableCount !== undefined && (
            <div className="absolute top-2.5 left-2.5">
              {availableCount === 0 ? (
                <Chip
                  variant="secondary"
                  className="bg-rose-700 text-white text-[10px] font-semibold px-2 py-0.5"
                >
                  Sold out
                </Chip>
              ) : availableCount <= 2 ? (
                <Chip
                  variant="secondary"
                  className="bg-amber-700 text-white text-[10px] font-semibold px-2 py-0.5"
                >
                  Only {availableCount} left
                </Chip>
              ) : (
                <Chip
                  variant="secondary"
                  className="bg-emerald-800 text-white text-[10px] font-semibold px-2 py-0.5"
                >
                  Available
                </Chip>
              )}
            </div>
          )}
        </div>

        <Card.Content className="p-4 sm:p-5 flex flex-col flex-1">
          <div className="space-y-2 flex-1">
            <h3 className="booking-heading text-xl sm:text-2xl text-[var(--bk-ink)] leading-snug">
              {name}
            </h3>

            {shortDescription && (
              <p className="text-xs text-[var(--bk-muted)] line-clamp-2 leading-relaxed">
                {shortDescription}
              </p>
            )}

            {amenities && amenities.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {amenities.slice(0, 3).map((a) => (
                  <span key={a.label} className="booking-chip">
                    {a.label}
                  </span>
                ))}
                {amenities.length > 3 && (
                  <span className="text-[10px] text-[var(--bk-muted)] self-center">
                    +{amenities.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-end justify-between gap-3 pt-4 sm:pt-5 mt-3 border-t border-[var(--bk-line)]">
            <div className="min-w-0">
              {!datesSelected && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--bk-muted)] block">
                  from
                </span>
              )}
              <div className="flex items-baseline gap-1 flex-wrap">
                <span className="booking-price text-base sm:text-lg font-semibold text-[var(--bk-ink)]">
                  {currency} {basePrice.toLocaleString()}
                </span>
                <span className="text-xs text-[var(--bk-muted)]">/night</span>
              </div>
            </div>

            {!isSoldOut ? (
              <Button
                variant="primary"
                size="sm"
                onPress={() => router.push(bookHref)}
                className="booking-cta h-10 sm:h-9 min-w-[4.5rem] px-4 rounded-xl text-xs touch-manipulation shrink-0"
              >
                Book
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                isDisabled
                className="h-10 sm:h-9 px-4 rounded-xl text-xs font-semibold shrink-0"
              >
                Sold out
              </Button>
            )}
          </div>
        </Card.Content>
      </Card>

      <RoomGallery
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        images={images}
        roomName={name}
        shortDescription={shortDescription}
        amenities={amenities}
        basePrice={basePrice}
        currency={currency}
        roomTypeId={id}
        checkIn={checkIn}
        checkOut={checkOut}
      />
    </>
  );
}
