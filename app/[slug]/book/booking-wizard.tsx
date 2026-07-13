"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, ChevronDown, ChevronUp, Images } from "lucide-react";
import { RoomGallery } from "@/components/booking/room-gallery";

interface RoomImage { url: string; caption: string; order: number; }
interface Amenity { icon: string; label: string; }
interface RoomType { id:string;name:string;basePrice:number;weekendPrice:number|null;shortDescription:string|null;bedConfiguration:string|null;maxAdults:number;maxChildren:number;images:RoomImage[];amenities:Amenity[]; }
interface Hotel { name:string;currency:string;checkInTime:string|null;checkOutTime:string|null;cancellationPolicy:string|null;paymentPolicy:string;hasPaystack:boolean; }
interface Props { slug:string;hotel:Hotel;roomTypes:RoomType[];initialRoomTypeId:string|null;initialCheckIn:string|null;initialCheckOut:string|null; }

export function BookingWizard({ slug,hotel,roomTypes,initialRoomTypeId,initialCheckIn,initialCheckOut }:Props) {
  const router = useRouter();
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now()+86400000).toISOString().split("T")[0];
  const [checkIn,setCheckIn]=React.useState(initialCheckIn??today);
  const [checkOut,setCheckOut]=React.useState(initialCheckOut??tomorrow);
  const [selectedRoom,setSelectedRoom]=React.useState<RoomType|null>(roomTypes.find(r=>r.id===initialRoomTypeId)??null);
  const [galleryRoom,setGalleryRoom]=React.useState<RoomType|null>(null);
  const [guestName,setGuestName]=React.useState("");
  const [guestEmail,setGuestEmail]=React.useState("");
  const [guestPhone,setGuestPhone]=React.useState("");
  const [showExtras,setShowExtras]=React.useState(false);
  const [adults,setAdults]=React.useState(1);
  const [specialRequests,setSpecialRequests]=React.useState("");
  const [paymentPref,setPaymentPref]=React.useState<"pay_now"|"pay_at_checkin">(hotel.paymentPolicy==="pay_later_only"?"pay_at_checkin":"pay_now");
  const [submitting,setSubmitting]=React.useState(false);
  const [section,setSection]=React.useState<1|2|3>(1);
  // Override-resolved prices keyed by room type id.
  // subtotal is null when dates haven't been selected / availability not yet fetched.
  type ResolvedPrice = { displayPrice: number; subtotal: number | null };
  const [resolvedPrices,setResolvedPrices]=React.useState<Record<string,ResolvedPrice>>({});
  const [priceLoading,setPriceLoading]=React.useState(false);

  // Re-fetch resolved prices whenever dates change and are valid
  React.useEffect(()=>{
    if(!checkIn||!checkOut||checkOut<=checkIn)return;
    let cancelled=false;
    setPriceLoading(true);
    fetch(`/api/booking/${slug}/availability?check_in=${checkIn}&check_out=${checkOut}`)
      .then(r=>r.ok?r.json():null)
      .then((json)=>{
        if(cancelled||!json?.rooms)return;
        const map:Record<string,ResolvedPrice>={};
        for(const room of json.rooms){
          map[room.id]={
            displayPrice:room.displayPrice??room.basePrice,
            subtotal:typeof room.subtotal==="number"?room.subtotal:null,
          };
        }
        setResolvedPrices(map);
      })
      .catch(()=>{})
      .finally(()=>{ if(!cancelled) setPriceLoading(false); });
    return()=>{ cancelled=true; };
  },[checkIn,checkOut,slug]);

  const nights=checkIn&&checkOut?Math.max(1,Math.ceil((new Date(checkOut).getTime()-new Date(checkIn).getTime())/86400000)):1;
  // Use resolved subtotal when available, fall back to basePrice * nights
  const resolvedSelected=selectedRoom?resolvedPrices[selectedRoom.id]:null;
  const displayNightRate=resolvedSelected?.displayPrice??selectedRoom?.basePrice??0;
  const total=resolvedSelected?.subtotal??((selectedRoom?.basePrice??0)*nights);
  const fmt=(n:number)=>`${hotel.currency} ${n.toLocaleString()}`;
  const s1=!!selectedRoom&&checkIn&&checkOut&&checkOut>checkIn;
  const s2=guestName.trim().length>1&&guestEmail.includes("@")&&guestPhone.length>=7;

  async function handleConfirm() {
    if(!selectedRoom||!s1||!s2)return;
    setSubmitting(true);
    try {
      const res=await fetch(`/api/booking/${slug}/bookings`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({room_type_id:selectedRoom.id,check_in:checkIn,check_out:checkOut,adults,children:0,guest_name:guestName.trim(),guest_email:guestEmail.trim(),guest_phone:guestPhone.trim(),payment_preference:paymentPref,special_requests:specialRequests||undefined})});
      const data=await res.json();
      if(!res.ok){toast.error(data.error??"Something went wrong.");return;}
      if(data.paymentRequired&&data.authorizationUrl){window.location.href=data.authorizationUrl;return;}
      router.push(`/${slug}/book/confirmation?reference=${data.reference}`);
    } catch { toast.error("Network error. Please try again."); }
    finally { setSubmitting(false); }
  }

  return (
    <>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border px-5 py-3 flex items-center justify-between">
          <Link href={`/${slug}`} className="booking-heading text-base text-foreground">{hotel.name}</Link>
          <span className="text-xs text-muted-foreground">Secure booking</span>
        </header>
        <div className="max-w-2xl mx-auto px-4 py-10 space-y-4">
          <h1 className="booking-heading text-3xl mb-6">Reserve your room</h1>
          <Sec num={1} title="Dates & Room" complete={!!s1} active={section===1} onEdit={()=>setSection(1)} summary={s1?`${selectedRoom?.name} - ${nights}n`:undefined}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Check-in</span><input type="date" value={checkIn} min={today} onChange={(e)=>{setCheckIn(e.target.value);if(e.target.value>=checkOut){const d=new Date(e.target.value);d.setDate(d.getDate()+1);setCheckOut(d.toISOString().split("T")[0]);}}} className="mt-1 w-full h-10 px-3 rounded-xl border border-border bg-card text-sm outline-none focus:border-primary transition-colors" /></label>
                <label className="block"><span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Check-out</span><input type="date" value={checkOut} min={checkIn} onChange={(e)=>setCheckOut(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-xl border border-border bg-card text-sm outline-none focus:border-primary transition-colors" /></label>
              </div>
              <div><span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground block mb-2">Select Room</span><div className="space-y-2">{roomTypes.map(rt=><RoomOpt key={rt.id} room={rt} selected={selectedRoom?.id===rt.id} currency={hotel.currency} displayPrice={resolvedPrices[rt.id]?.displayPrice??rt.basePrice} priceLoading={priceLoading} onSelect={()=>setSelectedRoom(rt)} onPhotos={(e)=>{e.stopPropagation();setGalleryRoom(rt);}} />)}</div></div>
              <Next disabled={!s1} onClick={()=>setSection(2)} label="Continue to guest details" />
            </div>
          </Sec>
          <Sec num={2} title="Your Details" complete={!!s2} active={section===2} onEdit={()=>section>2&&setSection(2)} summary={s2?guestName:undefined}>
            <div className="space-y-3">
              <input type="text" placeholder="Full name *" value={guestName} onChange={e=>setGuestName(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm outline-none focus:border-primary transition-colors" autoComplete="name" />
              <input type="email" placeholder="Email address *" value={guestEmail} onChange={e=>setGuestEmail(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm outline-none focus:border-primary transition-colors" autoComplete="email" />
              <input type="tel" placeholder="Phone number *" value={guestPhone} onChange={e=>setGuestPhone(e.target.value)} className="w-full h-11 px-4 rounded-xl border border-border bg-card text-sm outline-none focus:border-primary transition-colors" autoComplete="tel" />
              <button type="button" onClick={()=>setShowExtras(!showExtras)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">{showExtras?<ChevronUp className="size-3.5" />:<ChevronDown className="size-3.5" />} Add special requests or guest count</button>
              {showExtras&&<div className="space-y-3 pt-1"><div className="flex items-center gap-3"><span className="text-sm text-muted-foreground w-20">Adults</span><div className="flex items-center gap-2"><button type="button" onClick={()=>setAdults(Math.max(1,adults-1))} className="size-7 rounded-full border border-border text-sm hover:border-primary transition-colors">-</button><span className="w-6 text-center text-sm font-medium">{adults}</span><button type="button" onClick={()=>setAdults(Math.min(10,adults+1))} className="size-7 rounded-full border border-border text-sm hover:border-primary transition-colors">+</button></div></div><textarea placeholder="Special requests (optional)" value={specialRequests} onChange={e=>setSpecialRequests(e.target.value)} rows={2} className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm outline-none focus:border-primary transition-colors resize-none" /></div>}
              <Next disabled={!s2} onClick={()=>setSection(3)} label="Continue to payment" />
            </div>
          </Sec>
          <Sec num={3} title="Confirm & Pay" complete={false} active={section===3} onEdit={()=>{}} summary={undefined}>
            <div className="rounded-xl bg-secondary border border-border p-4 space-y-2 mb-4">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">{selectedRoom?.name}</span><span className="font-medium">{selectedRoom?fmt(displayNightRate):""}/night</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">{checkIn} to {checkOut} ({nights} night{nights!==1?"s":""})</span></div>
              <div className="flex justify-between text-sm pt-1 border-t border-border"><span className="font-semibold text-foreground">Total</span><span className="font-bold text-lg text-foreground">{fmt(total)}</span></div>
            </div>
            {hotel.paymentPolicy==="choice"&&hotel.hasPaystack&&<div className="grid grid-cols-2 gap-2 mb-4">{(["pay_now","pay_at_checkin"] as const).map(p=><button key={p} type="button" onClick={()=>setPaymentPref(p)} className={`rounded-xl border p-3 text-left transition-all ${paymentPref===p?"border-primary bg-primary/5":"border-border bg-card hover:border-primary"}`}><p className="text-sm font-medium text-foreground">{p==="pay_now"?"Pay Now":"Pay at Check-In"}</p><p className="text-xs text-muted-foreground mt-0.5">{p==="pay_now"?"Secure online payment":"Pay when you arrive"}</p></button>)}</div>}
            {hotel.cancellationPolicy&&<p className="text-xs text-muted-foreground mb-4">{hotel.cancellationPolicy}</p>}
            <button type="button" onClick={handleConfirm} disabled={submitting||!s1||!s2} className="w-full h-12 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {submitting&&<Loader2 className="size-4 animate-spin" />}
              {submitting?"Processing...":paymentPref==="pay_now"?`Pay ${fmt(total)}`:"Reserve Now - Pay at Hotel"}
            </button>
          </Sec>
        </div>
      </div>
      {galleryRoom&&<RoomGallery open={!!galleryRoom} onClose={()=>setGalleryRoom(null)} images={galleryRoom.images} roomName={galleryRoom.name} shortDescription={galleryRoom.shortDescription} amenities={galleryRoom.amenities} basePrice={galleryRoom.basePrice} currency={hotel.currency} roomTypeId={galleryRoom.id} checkIn={checkIn} checkOut={checkOut} />}
    </>
  );
}

function RoomOpt({room,selected,currency,displayPrice,priceLoading,onSelect,onPhotos}:{room:RoomType;selected:boolean;currency:string;displayPrice:number;priceLoading:boolean;onSelect:()=>void;onPhotos:(e:React.MouseEvent)=>void;}) {
  const img=room.images[0]?.url??null;
  return <button type="button" onClick={onSelect} className={`w-full text-left rounded-xl border p-3 transition-all ${selected?"border-primary bg-primary/5":"border-border bg-card hover:border-primary"}`}><div className="flex items-start gap-3"><div className="relative shrink-0 w-16 h-14 rounded-lg overflow-hidden bg-secondary">{img?<Image src={img} alt={room.name} fill className="object-cover" sizes="64px" />:<div className="absolute inset-0 flex items-center justify-center"><span className="text-lg font-bold text-[#D4C8BE]">{room.name.split(" ").map((w:string)=>w[0]).join("").slice(0,2).toUpperCase()}</span></div>}{room.images.length>1&&<button type="button" onClick={onPhotos} className="absolute bottom-0.5 right-0.5 bg-black/60 text-primary-foreground rounded px-1 py-0.5 text-[8px] flex items-center gap-0.5 hover:bg-black/80"><Images className="size-2" />{room.images.length}</button>}</div><div className="flex-1 min-w-0"><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium text-foreground">{room.name}</p><div className="text-right shrink-0"><p className={`text-sm font-semibold text-foreground ${priceLoading?"opacity-40":""}`}>{currency} {displayPrice.toLocaleString()}</p><p className="text-[10px] text-muted-foreground">/night</p></div></div>{room.bedConfiguration&&<p className="text-xs text-muted-foreground mt-0.5">{room.bedConfiguration}</p>}{selected&&room.shortDescription&&<p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{room.shortDescription}</p>}{room.amenities.length>0&&<div className="flex flex-wrap gap-1 mt-1.5">{room.amenities.slice(0,3).map((a:Amenity)=><span key={a.label} className="text-[9px] text-muted-foreground bg-secondary border border-border px-1.5 py-0.5 rounded-full">{a.label}</span>)}{room.amenities.length>3&&<span className="text-[9px] text-muted-foreground">+{room.amenities.length-3}</span>}</div>}</div></div></button>;
}

function Sec({num,title,complete,active,onEdit,summary,children}:{num:number;title:string;complete:boolean;active:boolean;onEdit:()=>void;summary?:string;children:React.ReactNode;}) {
  return <div className={`rounded-2xl border transition-all ${active?"border-primary bg-card shadow-sm":"border-border bg-card"}`}><div className={`flex items-center justify-between px-5 py-4 ${!active&&complete?"cursor-pointer":""}`} onClick={!active&&complete?onEdit:undefined}><div className="flex items-center gap-3"><div className={`size-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${complete&&!active?"bg-primary text-primary-foreground":active?"bg-primary text-primary-foreground":"bg-[#E7E5E4] text-muted-foreground"}`}>{complete&&!active?"v":num}</div><span className="text-sm font-semibold text-foreground">{title}</span>{!active&&summary&&<span className="text-xs text-muted-foreground hidden sm:inline">- {summary}</span>}</div>{!active&&complete&&<span className="text-xs text-muted-foreground">Edit</span>}</div>{active&&<div className="px-5 pb-5">{children}</div>}</div>;
}

function Next({disabled,onClick,label}:{disabled:boolean;onClick:()=>void;label:string;}) {
  return <button type="button" onClick={onClick} disabled={disabled} className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed mt-2">{label}</button>;
}