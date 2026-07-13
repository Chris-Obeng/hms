import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { AlertTriangle, ShieldOff } from "lucide-react";
import { HousekeepingClient } from "./housekeeping-client";
import { getHousekeepingData } from "@/app/actions/housekeeping";

export const dynamic = "force-dynamic";

export default async function HousekeepingPage() {
  const { orgId, userId } = await auth();

  if (!orgId || !userId) {
    return <AccessDeniedState />;
  }

  const supabase = await createClient();
  const { data: hotel } = await supabase
    .from("hotels")
    .select("id")
    .eq("clerk_org_id", orgId)
    .single();

  if (!hotel) {
    return <ErrorState message="Hotel not found for your organisation." />;
  }

  const result = await getHousekeepingData();

  if (!result.success) {
    return <ErrorState message={result.error} />;
  }

  return (
    <HousekeepingClient initialData={result.data} hotelId={hotel.id} />
  );
}

// ── Error states ──────────────────────────────────────────────────

function AccessDeniedState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="size-12 rounded-full bg-muted/30 flex items-center justify-center mb-4">
        <ShieldOff className="size-6 text-muted-foreground/40" />
      </div>
      <h2 className="text-section text-foreground">Access Denied</h2>
      <p className="text-body text-muted-foreground mt-1 max-w-sm">
        Please sign in to access housekeeping.
      </p>
    </div>
  );
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="size-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <AlertTriangle className="size-6 text-destructive" />
      </div>
      <h2 className="text-section text-foreground">Failed to load</h2>
      <p className="text-body text-muted-foreground mt-1 max-w-sm">
        {message ?? "Something went wrong loading housekeeping data."}
      </p>
    </div>
  );
}
