"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function PlatformSignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/platform/sign-in");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors w-full"
    >
      <LogOut className="size-4 shrink-0" />
      Sign out
    </button>
  );
}
