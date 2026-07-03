"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

export interface GalleryImage {
  url: string;
  caption?: string;
}

interface RoomGalleryProps {
  images: GalleryImage[];
  roomName: string;
  shortDescription?: string | null;
  amenities?: { icon: string; label: string }[];
  basePrice: number;
  currency: string;
  roomTypeId: string;
  checkIn?: string;
  checkOut?: string;
  slug?: string;
  open: boolean;
  onClose: () => void;
}

export function RoomGallery({
  images, roomName, shortDescription, amenities, basePrice, currency,
  roomTypeId, checkIn, checkOut, slug, open, onClose,
}: RoomGalleryProps) {
  const [current, setCurrent] = React.useState(0);

  React.useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setCurrent((c) => Math.min(c + 1, images.length - 1));
      if (e.key === "ArrowLeft") setCurrent((c) => Math.max(c - 1, 0));
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, images.length, onClose]);

  React.useEffect(() => { if (open) setCurrent(0); }, [open]);

  React.useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const touchStart = React.useRef<number | null>(null);
  function onTouchStart(e: React.TouchEvent) { touchStart.current = e.touches[0].clientX; }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStart.current === null) return;
    const delta = touchStart.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 50) {
      if (delta > 0) setCurrent((c) => Math.min(c + 1, images.length - 1));
      else setCurrent((c) => Math.max(c - 1, 0));
    }
    touchStart.current = null;
  }

  if (!open || images.length === 0) return null;

  const base = slug ? `/${slug}` : "";
  const bookHref = checkIn && checkOut
    ? `${base}/book?room_type_id=${roomTypeId}&check_in=${checkIn}&check_out=${checkOut}`
    : `${base}/book?room_type_id=${roomTypeId}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0F0E0C]">
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <button
          onClick={onClose}
          className="size-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          aria-label="Close gallery"
        >
          <X className="size-4 text-white" />
        </button>
        <span className="text-white/60 text-sm tabular-nums">
          {current + 1} / {images.length}
        </span>
        <div className="size-8" />
      </div>

      <div
        className="flex-1 relative flex items-center justify-center px-4 select-none"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="relative w-full h-full max-h-[60vh]">
          <Image
            src={images[current].url}
            alt={images[current].caption || `${roomName} — photo ${current + 1}`}
            fill
            className="object-contain"
            priority
            sizes="100vw"
          />
        </div>
        {current > 0 && (
          <button
            onClick={() => setCurrent((c) => c - 1)}
            className="absolute left-2 size-10 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center transition-colors"
            aria-label="Previous photo"
          >
            <ChevronLeft className="size-5 text-white" />
          </button>
        )}
        {current < images.length - 1 && (
          <button
            onClick={() => setCurrent((c) => c + 1)}
            className="absolute right-2 size-10 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center transition-colors"
            aria-label="Next photo"
          >
            <ChevronRight className="size-5 text-white" />
          </button>
        )}
      </div>

      {images[current].caption && (
        <p className="text-center text-white/40 text-xs px-4 py-1 shrink-0">
          {images[current].caption}
        </p>
      )}

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 py-3 shrink-0 scrollbar-none">
          {images.map((img, i) => (
            <button
              key={img.url}
              onClick={() => setCurrent(i)}
              className={`relative shrink-0 size-12 rounded-md overflow-hidden transition-all ${
                i === current ? "ring-2 ring-white opacity-100" : "opacity-50 hover:opacity-75"
              }`}
            >
              <Image src={img.url} alt={`Thumbnail ${i + 1}`} fill className="object-cover" sizes="48px" />
            </button>
          ))}
        </div>
      )}

      <div className="shrink-0 border-t border-white/10 bg-[#1A1917] px-4 py-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h2 className="text-white font-semibold text-lg leading-tight" style={{ fontFamily: "Georgia, serif" }}>
                {roomName}
              </h2>
              {shortDescription && (
                <p className="text-white/50 text-xs mt-0.5 line-clamp-1">{shortDescription}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-white/40 text-[10px]">from</p>
              <p className="text-white font-semibold">
                {currency} {basePrice.toLocaleString()}
                <span className="text-white/40 text-xs font-normal">/night</span>
              </p>
            </div>
          </div>
          {amenities && amenities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {amenities.slice(0, 5).map((a) => (
                <span
                  key={a.label}
                  className="text-[10px] text-white/60 bg-white/10 border border-white/10 px-2 py-0.5 rounded-full"
                >
                  {a.label}
                </span>
              ))}
              {amenities.length > 5 && (
                <span className="text-[10px] text-white/40 px-1">+{amenities.length - 5}</span>
              )}
            </div>
          )}
          <Link
            href={bookHref}
            onClick={onClose}
            className="block w-full h-11 rounded-xl bg-white text-[#1C1917] text-sm font-semibold hover:bg-white/90 transition-colors flex items-center justify-center"
          >
            Book this room
          </Link>
        </div>
      </div>
    </div>
  );
}
