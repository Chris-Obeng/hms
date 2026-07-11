"use client";

import * as React from "react";
import Image from "next/image";
import { X, ExternalLink } from "lucide-react";

interface RoomType {
  name: string;
  shortDescription: string | null;
  description: string | null;
  bedConfiguration: string | null;
  maxAdults: number;
  maxChildren: number;
  basePrice: number;
  weekendPrice: number | null;
  amenities: { icon: string; label: string }[] | null;
  images: { url: string; caption: string; order: number }[] | null;
  isActive: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  roomType: RoomType;
  bookingUrl?: string;
}

export function RoomPreviewSheet({ open, onClose, roomType, bookingUrl }: Props) {
  if (!open) return null;

  const images = roomType.images ?? [];
  const firstImage = images[0]?.url ?? null;
  const amenities = roomType.amenities ?? [];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-background shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-background/95 backdrop-blur border-b border-border px-5 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Guest Preview</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Exactly what guests see</p>
          </div>
          <button
            onClick={onClose}
            className="size-7 rounded-full bg-secondary hover:bg-[#E7E5E4] flex items-center justify-center transition-colors"
          >
            <X className="size-3.5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Room card preview */}
          <div className="rounded-2xl overflow-hidden bg-card shadow-[0_2px_16px_rgba(0,0,0,0.06)]">
            {/* Hero image */}
            <div className="relative aspect-[3/2] bg-secondary">
              {firstImage ? (
                <Image src={firstImage} alt={roomType.name} fill className="object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-[#D4C8BE] mb-1">
                      {roomType.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <p className="text-xs text-[#B4AFA9]">No photo yet</p>
                  </div>
                </div>
              )}
              {images.length > 1 && (
                <div className="absolute bottom-2 left-2 bg-black/60 text-primary-foreground text-[10px] font-medium px-2 py-1 rounded-full">
                  {images.length} photos
                </div>
              )}
              {!roomType.isActive && (
                <div className="absolute inset-0 bg-card/70 flex items-center justify-center">
                  <span className="text-xs font-medium text-muted-foreground bg-card px-3 py-1 rounded-full border border-border">
                    Hidden (inactive)
                  </span>
                </div>
              )}
            </div>

            <div className="p-4">
              <h3 className="text-lg font-semibold text-foreground" style={{ fontFamily: "Georgia, serif" }}>
                {roomType.name}
              </h3>
              {roomType.shortDescription && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{roomType.shortDescription}</p>
              )}

              {/* Amenity pills */}
              {amenities.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {amenities.slice(0, 4).map((a) => (
                    <span
                      key={a.label}
                      className="text-[10px] text-muted-foreground bg-secondary border border-border px-2 py-0.5 rounded-full"
                    >
                      {a.label}
                    </span>
                  ))}
                  {amenities.length > 4 && (
                    <span className="text-[10px] text-muted-foreground px-1">+{amenities.length - 4} more</span>
                  )}
                </div>
              )}

              <div className="flex items-end justify-between mt-4 pt-3 border-t border-border">
                <div>
                  <p className="text-xs text-muted-foreground">from</p>
                  <p className="text-lg font-semibold text-foreground">
                    GHS {roomType.basePrice.toLocaleString()}
                    <span className="text-sm font-normal text-muted-foreground">/night</span>
                  </p>
                </div>
                <div className="h-8 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-medium flex items-center">
                  Book
                </div>
              </div>
            </div>
          </div>

          {/* Bed + occupancy info */}
          <div className="bg-card rounded-xl border border-border p-3 space-y-1.5 text-xs text-muted-foreground">
            {roomType.bedConfiguration && (
              <div className="flex justify-between">
                <span>Bed</span>
                <span className="text-foreground font-medium">{roomType.bedConfiguration}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Sleeps</span>
              <span className="text-foreground font-medium">
                {roomType.maxAdults} adult{roomType.maxAdults !== 1 ? "s" : ""}
                {roomType.maxChildren > 0 ? `, ${roomType.maxChildren} child${roomType.maxChildren !== 1 ? "ren" : ""}` : ""}
              </span>
            </div>
            {roomType.weekendPrice && (
              <div className="flex justify-between">
                <span>Weekend rate</span>
                <span className="text-foreground font-medium">GHS {roomType.weekendPrice.toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Image strip */}
          {images.length > 1 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">All {images.length} photos</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  <div key={img.url} className="relative size-16 rounded-lg overflow-hidden shrink-0 bg-secondary">
                    <Image src={img.url} alt={`Photo ${i + 1}`} fill className="object-cover" />
                    {i === 0 && (
                      <div className="absolute bottom-0 inset-x-0 bg-black/50 text-primary-foreground text-[8px] text-center py-0.5">
                        Cover
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Link to live booking page */}
          {bookingUrl && (
            <a
              href={`${bookingUrl}/rooms`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-xl py-2.5 transition-colors"
            >
              <ExternalLink className="size-3" />
              Open live booking page
            </a>
          )}

          <p className="text-[10px] text-muted-foreground text-center">
            Save changes for them to appear on the booking page.
          </p>
        </div>
      </div>
    </>
  );
}
