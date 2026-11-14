"use client";

import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { useEffect } from "react";
import { setInviteTokenCookie } from "./actions";
import { AuthShell } from "@/components/brand/auth-shell";
import { clerkAppearance } from "@/components/brand/clerk-appearance";
import { InviteCard } from "./invite-screens";

export function JoinSignUp({
  token,
  hotelName,
  role,
  inviterName,
  expiresLabel,
}: {
  token: string;
  hotelName: string;
  role: string;
  inviterName: string | null;
  expiresLabel: string;
}) {
  useEffect(() => {
    setInviteTokenCookie(token);
  }, [token]);

  return (
    <AuthShell
      aside={{
        title: `Welcome to ${hotelName}.`,
        body: "Create your RoomLine account to accept the invite. Your manager sees you on the team as soon as you're in.",
      }}
      topAction={
        <>
          <span className="hidden sm:inline">Already on RoomLine?</span>
          <Link href="/sign-in" className="rl-link">
            Sign in
          </Link>
        </>
      }
    >
      <InviteCard
        hotelName={hotelName}
        role={role}
        inviterName={inviterName}
        expiresLabel={expiresLabel}
      />
      <SignUp
        path="/join"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/join/sso-callback"
        unsafeMetadata={{ inviteToken: token }}
        appearance={{
          ...clerkAppearance,
          elements: {
            ...clerkAppearance.elements,
            // The invite card already says where and why; keep Clerk's title small.
            headerTitle: {
              ...clerkAppearance.elements.headerTitle,
              fontSize: "1.25rem",
              letterSpacing: "-0.02em",
            },
          },
        }}
      />
    </AuthShell>
  );
}
