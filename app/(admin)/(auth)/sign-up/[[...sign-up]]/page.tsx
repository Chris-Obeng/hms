import type { Metadata } from "next";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/components/brand/auth-shell";
import { clerkAppearance } from "@/components/brand/clerk-appearance";

export const metadata: Metadata = {
  title: "Create your workspace",
  description: "Create a RoomLine account for your hotel or guesthouse.",
};

export default function SignUpPage() {
  return (
    <AuthShell
      aside={{
        title: "Open your front desk.",
        body: "Create your account, then add your property. Rooms and rates come next.",
      }}
      topAction={
        <>
          <span className="hidden sm:inline">Have an account?</span>
          <Link href="/sign-in" className="rl-link">
            Sign in
          </Link>
        </>
      }
    >
      <SignUp appearance={clerkAppearance} signInUrl="/sign-in" />
    </AuthShell>
  );
}
