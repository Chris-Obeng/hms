"use client";

import { usePathname, useRouter } from "next/navigation";
import { RouterProvider, Tabs } from "@heroui/react";

const SECTIONS = [
  { id: "hotel", label: "Hotel", href: "/dashboard/settings/hotel" },
  { id: "notifications", label: "Notifications", href: "/dashboard/settings/notifications" },
  { id: "emails", label: "Guest emails", href: "/dashboard/settings/emails" },
  { id: "audit-log", label: "Audit log", href: "/dashboard/settings/audit-log" },
] as const;

/**
 * Settings shell: one title and HeroUI link tabs for the sections, so every
 * settings page is one tap away without opening the sidebar.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const active = SECTIONS.find((s) => pathname.startsWith(s.href))?.id ?? "hotel";

  return (
    <div className="mx-auto w-full max-w-5xl pt-6 md:pt-8">
      <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">Settings</h1>

      <RouterProvider navigate={(href) => router.push(href)}>
        <Tabs variant="secondary" selectedKey={active} className="mb-6 mt-4 gap-0">
          <Tabs.ListContainer className="border-border/70">
            <Tabs.List aria-label="Settings sections" className="gap-6">
              {SECTIONS.map((s) => (
                <Tabs.Tab
                  key={s.id}
                  id={s.id}
                  href={s.href}
                  className="h-12 w-auto flex-none px-0 text-sm font-medium text-muted-foreground data-[selected=true]:font-semibold data-[selected=true]:text-foreground"
                >
                  {s.label}
                  <Tabs.Indicator className="rounded-t-sm bg-primary" />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      </RouterProvider>

      {children}
    </div>
  );
}
