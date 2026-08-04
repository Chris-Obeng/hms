import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

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
    <main className="overflow-x-hidden w-full max-w-full min-h-[100dvh] bg-background text-foreground flex items-center justify-center p-4 relative font-sans">
      {/* Subtle Ethereal Glass Background Ambient Red Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-red-950/[0.06] blur-[120px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full bg-indigo-950/[0.04] blur-[100px] pointer-events-none" />

      {/* Double-Bezel Outer Shell */}
      <div className="w-full max-w-md p-1.5 bg-card border border-border rounded-3xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.85)] relative z-10 transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-border">
        {/* Double-Bezel Inner Core */}
        <div className="w-full bg-background/80 border border-border rounded-[calc(1.5rem-0.375rem)] p-8 md:p-10 flex flex-col items-center text-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.015)] backdrop-blur-3xl">
          {/* Status Indicator */}
          <div className="mb-6 flex items-center justify-center w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
          </div>

          {/* Eyebrow */}
          <span className="text-[10px] tracking-[0.2em] uppercase text-red-500/80 font-mono font-medium mb-4">
            Access Suspended
          </span>

          {/* Headline */}
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground mb-2">
            {hotel?.name || "Your Hotel"} is Suspended
          </h1>

          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed mb-8 max-w-[28ch]">
            Access to this property has been temporarily suspended. Please contact platform administration to resolve this issue.
          </p>

          {/* CTA Group */}
          <div className="w-full flex flex-col gap-3">
            <SignOutButton>
              <button className="w-full px-6 py-3 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all duration-300 shadow-[0_4px_20px_-4px_rgba(255,255,255,0.15)] hover:shadow-[0_4px_24px_-2px_rgba(255,255,255,0.2)] text-sm cursor-pointer">
                Sign Out
              </button>
            </SignOutButton>

            <a
              href="mailto:support@RoomLine.pro"
              className="w-full px-6 py-3 rounded-full border border-border bg-secondary text-foreground font-medium hover:bg-zinc-900/80 hover:text-foreground active:scale-[0.98] transition-all duration-300 text-center text-sm cursor-pointer"
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
