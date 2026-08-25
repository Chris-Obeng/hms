export const dynamic = "force-dynamic";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@clerk/nextjs";
import { ShieldAlert } from "lucide-react";

export default async function SuspendedPage() {
  const { orgId, userId } = await auth();

  // If not logged in, redirect to sign-in
  if (!userId || !orgId) {
    redirect("/sign-in");
  }

  const supabase = await createClient();

  // Query hotel status
  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, name, status")
    .eq("clerk_org_id", orgId)
    .single();

  // Self-heal: if hotel is active/pending, let them back to dashboard/deactivated
  if (hotel && hotel.status !== "suspended" && hotel.status !== "cancelled") {
    redirect("/dashboard");
  }

  return (
    <main className="w-full min-h-[100dvh] bg-background text-foreground flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md rounded-2xl border border-border/50 bg-card p-8 shadow-xs">
        <div className="mx-auto mb-5 grid size-11 place-items-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
          <ShieldAlert className="size-5" aria-hidden />
        </div>

        <p className="mb-2 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Access suspended
        </p>

        <h1 className="text-center text-xl font-semibold tracking-tight text-foreground">
          {hotel?.name || "Your Hotel"} is suspended
        </h1>

        <p className="mt-2 mb-8 text-center text-sm leading-relaxed text-muted-foreground">
          Access to this property has been temporarily suspended. Please contact platform administration to resolve this issue.
        </p>

        <div className="flex w-full flex-col gap-2.5">
          <SignOutButton>
            <button className="h-10 w-full cursor-pointer rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
              Sign Out
            </button>
          </SignOutButton>

          <a
            href="mailto:support@RoomLine.pro"
            className="flex h-10 w-full items-center justify-center rounded-xl border border-border bg-secondary px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Contact Support
          </a>
        </div>
      </div>
    </main>
  );
}
