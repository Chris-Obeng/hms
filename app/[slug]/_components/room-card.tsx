"use client";
import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { RoomGallery, type GalleryImage } from "@/components/booking/room-gallery";

interface P { slug:string;id:string;name:string;shortDescription:string|null;basePrice:number;currency:string;images:GalleryImage[];amenities?:{icon:string;label:string}[];checkIn?:string;checkOut?:string;availableCount?:number|null; }

export function RoomCard({ slug,id,name,shortDescription,basePrice,currency,images,amenities,checkIn,checkOut,availableCount }: P) {
  const [galleryOpen, setGalleryOpen] = React.useState(false);
  const bookHref = checkIn && checkOut ? `/${slug}/book?room_type_id=${id}&check_in=${checkIn}&check_out=${checkOut}` : `/${slug}/book?room_type_id=${id}`;
  const firstImage = images[0]?.url ?? null;
  const isSoldOut = availableCount !== null && availableCount !== undefined && availableCount === 0;

  let availBadge: React.ReactNode = null;
  if (availableCount !== null && availableCount !== undefined) {
    if (availableCount === 0) availBadge = <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">Sold Out</span>;
    else if (availableCount <= 2) availBadge = <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Only {availableCount} left</span>;
    else availBadge = <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Available</span>;
  }

  return (
    <>
      <div className={`group rounded-2xl overflow-hidden bg-card shadow-[0_2px_16px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_24px_rgba(0,0,0,0.10)] transition-shadow ${isSoldOut ? "opacity-70" : ""}`}>
        <div className={`relative aspect-[3/2] bg-secondary ${images.length > 0 ? "cursor-pointer" : ""}`} onClick={() => { if (images.length > 0 && !isSoldOut) setGalleryOpen(true); }}>
          {firstImage
            ? <Image src={firstImage} alt={name} fill className="object-cover group-hover:scale-[1.02] transition-transform duration-500" sizes="(max-width:640px) 100vw,(max-width:1024px) 50vw,33vw" />
            : <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200"><p className="text-3xl font-bold text-stone-300">{name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}</p></div>
          }
          {isSoldOut && <div className="absolute inset-0 bg-card/60 flex items-center justify-center"><span className="text-xs font-semibold text-muted-foreground bg-card/90 px-3 py-1 rounded-full border border-border">Sold Out</span></div>}
        </div>
        <div className="p-5">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="booking-heading text-xl text-foreground leading-tight">{name}</h3>
            {availBadge}
          </div>
          {shortDescription && <p className="text-sm text-muted-foreground line-clamp-2">{shortDescription}</p>}
          {amenities && amenities.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2.5">
              {amenities.slice(0, 3).map((a: {icon:string;label:string}) => <span key={a.label} className="text-[10px] text-muted-foreground bg-secondary border border-border px-2 py-0.5 rounded-full">{a.label}</span>)}
              {amenities.length > 3 && <span className="text-[10px] text-muted-foreground">+{amenities.length - 3}</span>}
            </div>
          )}
          <div className="flex items-end justify-between mt-4">
            <div>
              <span className="text-xs text-muted-foreground">from</span>
              <p className="text-xl font-semibold text-foreground">{currency} {basePrice.toLocaleString()}<span className="text-sm font-normal text-muted-foreground">/night</span></p>
            </div>
            {!isSoldOut
              ? <Link href={bookHref} className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">Book</Link>
              : <span className="h-9 px-4 rounded-xl bg-secondary text-muted-foreground text-sm font-medium flex items-center cursor-not-allowed">Unavailable</span>
            }
          </div>
        </div>
      </div>
      <RoomGallery open={galleryOpen} onClose={() => setGalleryOpen(false)} images={images} roomName={name} shortDescription={shortDescription} amenities={amenities} basePrice={basePrice} currency={currency} roomTypeId={id} checkIn={checkIn} checkOut={checkOut} />
    </>
  );
}
