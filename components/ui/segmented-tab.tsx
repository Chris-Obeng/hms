"use client";

import * as React from "react";
import { Tabs } from "@heroui/react";

// iOS-style segmented control trigger: the active tab reads as a raised white
// pill (elevated bg + hairline ring + shadow). Shared by the booking and guest
// detail sheets; `id` matches the sibling <Tabs.Panel id>.

export function SegmentedTab({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <Tabs.Tab
      id={id}
      className="
        flex h-10 cursor-pointer items-center justify-center rounded-lg px-3 text-sm
        font-semibold text-muted-foreground outline-none transition-colors
        data-[hovered=true]:text-foreground
        data-[selected=true]:bg-background data-[selected=true]:text-foreground
        data-[selected=true]:shadow-sm data-[selected=true]:ring-1 data-[selected=true]:ring-border/70
        focus-visible:ring-2 focus-visible:ring-ring
      "
    >
      {children}
    </Tabs.Tab>
  );
}
