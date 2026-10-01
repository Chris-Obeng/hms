"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function ProcessingInvite({ hotelName, role, orgId }: { hotelName: string; role: string; orgId: string }) {
  const router = useRouter();
  const attemptsRef = useRef(0);
  const maxAttempts = 10;

  useEffect(() => {
    let active = true;
    const checkMembership = async () => {
      if (!active) return;
      attemptsRef.current += 1;
      try {
        const res = await fetch(`/api/check-membership?orgId=${orgId}`);
        const data = await res.json();
        if (!active) return;
        if (data.isMember) router.push("/dashboard");
        else if (attemptsRef.current >= maxAttempts) router.refresh();
      } catch {
        if (active && attemptsRef.current >= maxAttempts) router.refresh();
      }
    };
    const interval = setInterval(checkMembership, 2000);
    return () => { active = false; clearInterval(interval); };
  }, [orgId, router]);

  return (
    <div className="min-h-screen bg-[#FDFCFA] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-[16px] border border-[#E9E2D6] bg-white p-6 text-center shadow-sm">
        <div className="mx-auto size-12 rounded-xl bg-[#0F1D1A] flex items-center justify-center animate-pulse">
          <span className="text-lg font-bold text-white">R</span>
        </div>
        <h2 className="mt-4 text-lg font-semibold tracking-tight text-[#0F1D1A]" style={{ fontFamily: "var(--font-fraunces)" }}>Adding you to {hotelName}</h2>
        <p className="mt-1 text-sm text-[#6B7571]">Joining as <span className="capitalize font-medium text-[#0F1D1A]">{role.replace("_", " ")}</span>. This takes a moment.</p>
        <div className="mt-4 h-1.5 rounded-full bg-[#F3F0EB] overflow-hidden">
          <div className="h-full w-1/2 rounded-full bg-[#0F1D1A] animate-[shimmer_1.2s_ease-in-out_infinite]" style={{ animation: "lp-shimmer 1.2s ease-in-out infinite" }} />
        </div>
      </div>
    </div>
  );
}
