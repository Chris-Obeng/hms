"use client";

import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { useEffect } from "react";
import { setInviteTokenCookie } from "./actions";

export function JoinSignUp({ token, hotelName, role }: { token: string; hotelName: string; role: string }) {
  useEffect(() => { setInviteTokenCookie(token); }, [token]);
  return (
    <div className="min-h-screen bg-[#FDFCFA] flex flex-col">
      <header className="border-b border-[#E9E2D6] bg-[#FDFCFA]/80 backdrop-blur">
        <div className="mx-auto w-full max-w-[80rem] px-6 lg:px-8 flex h-18 items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-[#0F1D1A]" style={{ fontFamily: "var(--font-fraunces)" }}>
            <span className="flex items-end gap-[3px] skew-y-[-10deg]"><span className="block w-[6px] h-4 bg-[#0F1D1A] rounded-[1px]" /><span className="block w-[6px] h-6 bg-[#C8A96A] rounded-[1px]" /><span className="block w-[6px] h-5 bg-[#0F1D1A] rounded-[1px]" /></span>
            <span className="text-[1.25rem] font-bold tracking-[-0.04em]">RoomLine<span className="text-[#C8A96A]">.</span></span>
          </Link>
          <span className="text-xs font-medium text-[#8A9692]">Staff invite</span>
        </div>
      </header>
      <div className="flex-1 grid lg:grid-cols-[1.05fr_.95fr] min-h-0">
        <div className="hidden lg:flex flex-col justify-between bg-[#0F1D1A] text-[#FFFCF8] p-10 xl:p-12">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#A8B5B0]">You&apos;re invited</p>
            <h1 className="mt-3 text-[2rem] xl:text-[2.25rem] font-medium leading-[1.05] tracking-[-0.04em]" style={{ fontFamily: "var(--font-fraunces)" }}>
              Welcome to<br />{hotelName}
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-6 text-[#A8B5B0]">
              Join as <span className="text-[#FFFCF8] font-semibold capitalize">{role.replace("_", " ")}</span>. Create your account to accept the invite — takes 30 seconds.
            </p>
          </div>
          <p className="text-xs text-[#A8B5B0]">Invite secured · Expires in 7 days</p>
        </div>
        <div className="flex items-center justify-center p-6 sm:p-10 bg-[#FDFCFA]">
          <div className="w-full max-w-md">
            <div className="lg:hidden mb-6">
              <h1 className="text-2xl font-semibold tracking-tight text-[#0F1D1A]" style={{ fontFamily: "var(--font-fraunces)" }}>Welcome to {hotelName}</h1>
              <p className="mt-1 text-sm text-[#6B7571]">Invited as <span className="font-semibold text-[#0F1D1A] capitalize">{role.replace("_", " ")}</span>.</p>
            </div>
            <SignUp
              path="/join"
              signInUrl="/sign-in"
              fallbackRedirectUrl="/join/sso-callback"
              unsafeMetadata={{ inviteToken: token }}
              appearance={{
                elements: {
                  card: "shadow-none border border-[#E9E2D6] rounded-[16px] bg-white",
                  headerTitle: "text-[#0F1D1A]",
                  formButtonPrimary: "bg-[#0F1D1A] hover:bg-[#1C2E2B] rounded-full",
                },
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
