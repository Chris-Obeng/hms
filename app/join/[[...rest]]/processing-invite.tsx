"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/brand/auth-shell";
import { roleInfo } from "./invite-screens";

const MAX_ATTEMPTS = 10;

/**
 * Shown right after an invitee signs up, while the Clerk webhook adds them to
 * the hotel. Polls membership every 2 s; after ~20 s it stops and says so,
 * instead of spinning forever.
 */
export function ProcessingInvite({ hotelName, role, orgId }: { hotelName: string; role: string; orgId: string }) {
  const router = useRouter();
  const attemptsRef = useRef(0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let active = true;
    const checkMembership = async () => {
      if (!active) return;
      attemptsRef.current += 1;
      try {
        const res = await fetch(`/api/check-membership?orgId=${encodeURIComponent(orgId)}`);
        const data = await res.json();
        if (!active) return;
        if (data.isMember) {
          router.push("/dashboard");
          return;
        }
      } catch {
        // Network hiccup: the next tick retries.
      }
      if (active && attemptsRef.current >= MAX_ATTEMPTS) {
        setSlow(true);
        clearInterval(interval);
      }
    };
    const interval = setInterval(checkMembership, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [orgId, router]);

  return (
    <AuthShell width="status">
      <div className="rl-screen-head" role="status" aria-live="polite">
        <h1 className="rl-title">
          {slow ? "This is taking longer than usual" : `Adding you to ${hotelName}`}
        </h1>
        <p className="rl-sub">
          {slow
            ? "Your account is ready. Refresh in a minute, or ask your manager to check the staff list."
            : `You're joining as ${roleInfo(role).label.toLowerCase()}. This takes a few seconds.`}
        </p>
      </div>
      {slow ? (
        <div className="rl-screen-actions">
          <button
            type="button"
            className="button button--primary button--lg"
            onClick={() => router.refresh()}
          >
            Refresh
          </button>
        </div>
      ) : (
        <div className="rl-progress" aria-hidden="true" />
      )}
    </AuthShell>
  );
}
