import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@clerk/nextjs";
import { Clock, UserRound } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DeactivatedPage() {
  const { orgId, userId } = await auth();
  if (!userId || !orgId) {
    redirect("/sign-in");
  }

  const supabase = await createClient();

  // Fetch status of hotel + staff in parallel
  const [hotelResult, staffResult] = await Promise.all([
    supabase
      .from("hotels")
      .select("id, name, status")
      .eq("clerk_org_id", orgId)
      .single(),
    supabase
      .from("staff_profiles")
      .select("id, is_active")
      .eq("clerk_user_id", userId)
      .eq("clerk_org_id", orgId)
      .single(),
  ]);

  const hotel = hotelResult.data;
  const staff = staffResult.data;

  // Self-heal: if both hotel is active and staff is active, let them back to dashboard
  if (hotel && hotel.status === "active" && staff && staff.is_active) {
    redirect("/dashboard");
  }

  // Redirect to suspended page if hotel status warrants it
  if (hotel && (hotel.status === "suspended" || hotel.status === "cancelled")) {
    redirect("/suspended");
  }

  // Determine dynamic message based on reason and database state
  const isHotelPending = hotel && hotel.status === "pending";
  const isStaffInactive = !staff || !staff.is_active;

  let title = "Access Restricted";
  let eyebrow = "Deactivated";
  let description = "Your account does not have active access to the application.";

  if (isHotelPending) {
    title = "Activation Pending";
    eyebrow = "Pending Review";
    description = `Your property profile for "${hotel?.name || "Your Hotel"}" is set up and awaiting approval by platform administrators.`;
  } else if (isStaffInactive) {
    title = "Awaiting Approval";
    eyebrow = "Profile Inactive";
    description = "Your staff profile is currently deactivated. Please contact your property manager to approve and activate your account.";
  }

  return (
    <main className="w-full min-h-[100dvh] bg-background text-foreground flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md rounded-2xl border border-border/50 bg-card p-8 shadow-xs">
        <div className="mx-auto mb-5 grid size-11 place-items-center rounded-full bg-secondary text-muted-foreground">
          {isHotelPending ? (
            <Clock className="size-5" aria-hidden />
          ) : (
            <UserRound className="size-5" aria-hidden />
          )}
        </div>

        <p className="mb-2 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {eyebrow}
        </p>

        <h1 className="text-center text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>

        <p className="mt-2 mb-8 text-center text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>

        <div className="flex w-full flex-col gap-2.5">
          <SignOutButton>
            <button className="h-10 w-full cursor-pointer rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
              Sign Out
            </button>
          </SignOutButton>

          <a
            href="#"
            className="flex h-10 w-full items-center justify-center rounded-xl border border-border bg-secondary px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Contact Support
          </a>
        </div>
      </div>
    </main>
  );
}
