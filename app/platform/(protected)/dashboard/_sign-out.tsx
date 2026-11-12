"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createPlatformBrowserClient } from "@/lib/supabase/platform-browser";

export function PlatformSignOutButton() {
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch("/platform/auth/sign-out", { method: "POST" });
      const supabase = createPlatformBrowserClient();
      await supabase.auth.signOut();
    } finally {
      router.push("/platform/sign-in");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      disabled={signingOut}
      onClick={handleSignOut}
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors w-full disabled:opacity-60"
    >
      <LogOut className="size-4 shrink-0" />
      {signingOut ? "Signing out…" : "Sign out"}
    </button>
  );
}
