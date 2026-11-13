"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RouterProvider, Tabs } from "@heroui/react";

const SECTIONS = [
  { id: "rooms", label: "Rooms", href: "/dashboard/rooms" },
  { id: "rates", label: "Rates", href: "/dashboard/rooms/pricing" },
  { id: "seasons", label: "Seasons", href: "/dashboard/rooms/pricing?tab=seasons" },
] as const;

export type RoomsSection = (typeof SECTIONS)[number]["id"];

/** Route tabs shared by the rooms list and the rates pages (same pattern as Settings). */
export function RoomsTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active: RoomsSection = pathname.startsWith("/dashboard/rooms/pricing")
    ? searchParams.get("tab") === "seasons"
      ? "seasons"
      : "rates"
    : "rooms";

  return (
    <RouterProvider navigate={(href) => router.push(href, { scroll: false })}>
      <Tabs variant="secondary" selectedKey={active} className="gap-0">
        <Tabs.ListContainer className="border-border/70">
          <Tabs.List aria-label="Rooms sections" className="gap-6">
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
  );
}
