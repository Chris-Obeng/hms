import type { Metadata } from "next";
import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/components/brand/auth-shell";
import { clerkAppearance } from "@/components/brand/clerk-appearance";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your RoomLine front desk.",
};

export default function SignInPage() {
  return (
    <AuthShell
      aside={{
        title: "Welcome back to the front desk.",
        body: "Today's arrivals, rooms and payments are where you left them.",
      }}
      topAction={
        <>
          <span className="hidden sm:inline">New to RoomLine?</span>
          <Link href="/sign-up" className="rl-link">
            Create workspace
          </Link>
        </>
      }
    >
      <SignIn appearance={clerkAppearance} signUpUrl="/sign-up" />
    </AuthShell>
  );
}
