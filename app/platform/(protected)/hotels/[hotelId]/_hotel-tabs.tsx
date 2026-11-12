"use client";

import * as React from "react";
import type { ReactNode } from "react";
import { Tabs } from "@heroui/react";
import { PayoutsPanel } from "@/components/payouts/payouts-panel";

/**
 * Client tab shell for the platform hotel-detail page. The server renders the
 * Overview body and passes it in as a node, so Overview stays fully
 * server-rendered. The payouts panel is a client island owned here: it takes a
 * server-bound loader and fetches only once the Online-payments tab is shown
 * (active gate), so a hotel-detail view never hits the Paystack Settlements API
 * unless that tab is opened.
 */
export function HotelDetailTabs({
  overview,
  payoutsLoad,
  timeZone,
}: {
  overview: ReactNode;
  payoutsLoad: React.ComponentProps<typeof PayoutsPanel>["load"];
  timeZone: string;
}) {
  const [tab, setTab] = React.useState<"overview" | "payments">("overview");

  return (
    <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(k as "overview" | "payments")}>
      <Tabs.ListContainer>
        <Tabs.List aria-label="Hotel detail sections" className="w-full sm:w-fit">
          <Tabs.Tab id="overview" className="flex-1 sm:flex-initial text-xs sm:text-sm text-foreground/70 hover:text-foreground data-[selected=true]:text-foreground">
            Overview
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="payments" className="flex-1 sm:flex-initial text-xs sm:text-sm text-foreground/70 hover:text-foreground data-[selected=true]:text-foreground">
            Online payments
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>

      <Tabs.Panel id="overview" className="mt-6">
        {overview}
      </Tabs.Panel>

      <Tabs.Panel id="payments" className="mt-6">
        <section className="space-y-3">
          <div>
            <h2 className="text-section text-foreground">Online payments</h2>
            <p className="text-caption text-muted-foreground mt-1">
              {"Online reservations and whether their funds have settled to the hotel's bank."}
            </p>
          </div>
          <PayoutsPanel load={payoutsLoad} active={tab === "payments"} timeZone={timeZone} />
        </section>
      </Tabs.Panel>
    </Tabs>
  );
}
