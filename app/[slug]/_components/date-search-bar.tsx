"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DateSearchBar({ slug }: { slug: string }) {
  const router = useRouter();
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(tomorrow);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/${slug}/rooms?check_in=${checkIn}&check_out=${checkOut}`);
  }

  return (
    <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 sm:gap-0 bg-white/95 backdrop-blur rounded-2xl p-2 shadow-2xl w-full max-w-lg mx-auto">
      <div className="flex flex-1 divide-x divide-[#E7E5E4]">
        <div className="flex-1 px-4 py-2">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-[#78716C] block mb-0.5">Check-in</label>
          <input type="date" value={checkIn} min={today} onChange={(e) => { setCheckIn(e.target.value); if (e.target.value >= checkOut) { const n = new Date(e.target.value); n.setDate(n.getDate() + 1); setCheckOut(n.toISOString().split("T")[0]); } }} className="w-full text-sm font-medium text-[#1C1917] bg-transparent outline-none cursor-pointer" required />
        </div>
        <div className="flex-1 px-4 py-2">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-[#78716C] block mb-0.5">Check-out</label>
          <input type="date" value={checkOut} min={checkIn} onChange={(e) => setCheckOut(e.target.value)} className="w-full text-sm font-medium text-[#1C1917] bg-transparent outline-none cursor-pointer" required />
        </div>
      </div>
      <button type="submit" className="sm:ml-2 h-12 px-6 rounded-xl bg-[#1C1917] text-white text-sm font-medium hover:bg-[#292524] transition-colors whitespace-nowrap">Check Availability</button>
    </form>
  );
}
