"use client";

import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { buttonVariants } from "@heroui/react";
import { AuthShell } from "@/components/brand/auth-shell";
import { InviteCard } from "./invite-screens";

/**
 * A valid invite opened while signed in to a different RoomLine account.
 * Invites create a new staff account, so the way forward is to sign out and
 * come straight back to this link; the current account is not touched.
 */
export function SignedInElsewhere({
  token,
  email,
  hotelName,
  role,
  inviterName,
  expiresLabel,
}: {
  token: string;
  email: string | null;
  hotelName: string;
  role: string;
  inviterName: string | null;
  expiresLabel: string;
}) {
  return (
    <AuthShell width="status">
      <InviteCard
        hotelName={hotelName}
        role={role}
        inviterName={inviterName}
        expiresLabel={expiresLabel}
      />
      <div className="rl-screen-head">
        <h2 className="rl-title">You&apos;re signed in as someone else</h2>
        <p className="rl-sub">
          {email ? (
            <>
              This browser is signed in as <strong className="text-[var(--rl-ink)]">{email}</strong>.
            </>
          ) : (
            "This browser is signed in to another RoomLine account."
          )}{" "}
          Sign out to create your account for {hotelName}. You&apos;ll come straight back here.
        </p>
      </div>
      <div className="rl-screen-actions">
        <SignOutButton redirectUrl={`/join?token=${encodeURIComponent(token)}`}>
          <button type="button" className={buttonVariants({ size: "lg" })}>
            Sign out and accept invite
          </button>
        </SignOutButton>
        <Link href="/dashboard" className={buttonVariants({ size: "lg", variant: "outline" })}>
          Stay signed in
        </Link>
      </div>
    </AuthShell>
  );
}
