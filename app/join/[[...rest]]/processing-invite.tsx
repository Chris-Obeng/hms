"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface ProcessingInviteProps {
  hotelName: string;
  role: string;
  orgId: string;
}

export function ProcessingInvite({ hotelName, role, orgId }: ProcessingInviteProps) {
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
        
        if (data.isMember) {
          router.push("/dashboard");
        } else if (attemptsRef.current >= maxAttempts) {
          router.refresh();
        }
      } catch (err) {
        console.error("Membership check failed:", err);
        if (active && attemptsRef.current >= maxAttempts) {
          router.refresh();
        }
      }
    };

    const interval = setInterval(checkMembership, 2000); // Poll every 2s to avoid rate limit
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [orgId, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted/30 p-4">
      <div className="max-w-md w-full bg-card border border-border/60 rounded-xl p-6 shadow-sm text-center space-y-4">
        <div className="size-12 rounded-xl bg-foreground flex items-center justify-center mx-auto animate-pulse">
          <span className="text-xl font-bold text-background">H</span>
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-foreground">Processing Invitation...</h2>
          <p className="text-sm text-muted-foreground">
            Adding you to {hotelName} as <span className="capitalize">{role.replace("_", " ")}</span>. This will only take a moment.
          </p>
        </div>
      </div>
    </div>
  );
}
