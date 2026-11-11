"use client";

import { usePathname } from "next/navigation";

/**
 * Settings shell. The section navigation lives in the main sidebar (Settings
 * expands in place), so this is just the content column. Pages that own their
 * own title — the audit log renders a designed header — skip the generic one.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ownsHeader = pathname.startsWith("/dashboard/settings/audit-log");

  return (
    <div className="mx-auto w-full max-w-7xl">
      {!ownsHeader && (
        <header className="mb-6">
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.3px] text-foreground max-md:text-xl">
            Settings
          </h1>
          <p className="mt-1 max-md:text-xs text-sm text-muted-foreground">
            Property configuration, guest communication and team access.
          </p>
        </header>
      )}
      {children}
    </div>
  );
}
