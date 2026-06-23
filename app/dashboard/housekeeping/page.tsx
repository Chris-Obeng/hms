import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { Sparkles } from "lucide-react";
import { HousekeepingClient } from "./housekeeping-client";
import { getHousekeepingData } from "@/app/actions/housekeeping";

export const dynamic = "force-dynamic";

export default async function HousekeepingPage() {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) {
    return <NoAccessState />;
  }

  const result = await getHousekeepingData();

  if (!result.success) {
    return <ErrorState message={result.error} />;
  }

  return <HousekeepingClient initialData={result.data} />;
}

function NoAccessState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="size-12 rounded-full bg-muted/30 flex items-center justify-center mb-4">
        <Sparkles className="size-6 text-muted-foreground/30" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">Access Denied</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        Please sign in to access housekeeping.
      </p>
    </div>
  );
}

function ErrorState({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="size-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <Sparkles className="size-6 text-destructive" />
      </div>
      <h2 className="text-lg font-semibold text-foreground">Failed to load</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        {message || "Something went wrong loading housekeeping data."}
      </p>
    </div>
  );
}
