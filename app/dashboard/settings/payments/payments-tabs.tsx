"use client";

import * as React from "react";
import { Tabs } from "@heroui/react";
import { SettingsSubHeader } from "../_components/settings-sub-header";
import { PaymentsSettingsClient } from "./payments-client";
import { PayoutsPanel } from "@/components/payouts/payouts-panel";
import { getMyHotelPayouts } from "@/app/actions/payouts";

type PaymentsTab = "settings" | "payouts";

interface Props {
  initialData: {
    subaccountCode: string | null;
    bankCode: string | null;
    accountNumber: string | null;
    businessName: string | null;
    settlementSchedule: string;
    paymentPolicy: string;
  };
  timeZone?: string;
}

/**
 * Payments settings shell: the existing bank/policy form plus a Payouts view
 * that reads live settlement state from Paystack. The sub-header lives here so
 * it spans both tabs; each tab owns its own body.
 */
export function PaymentsTabs({ initialData, timeZone = "UTC" }: Props) {
  const [tab, setTab] = React.useState<PaymentsTab>("payouts");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <SettingsSubHeader
        icon="card"
        title="Payments"
      />

      <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(k as PaymentsTab)}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="Payment settings sections" className="w-full sm:w-fit sm:mx-auto">
            <Tabs.Tab id="payouts" className="flex-1 sm:flex-initial text-xs sm:text-sm text-foreground/70 hover:text-foreground data-[selected=true]:text-foreground">
              Online Payments
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="settings" className="flex-1 sm:flex-initial text-xs sm:text-sm text-foreground/70 hover:text-foreground data-[selected=true]:text-foreground">
              Settings
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="payouts" className="mt-5">
          <div className="w-full">
            <PayoutsPanel
              load={getMyHotelPayouts}
              active={tab === "payouts"}
              timeZone={timeZone}
              onGoToSetup={() => setTab("settings")}
            />
          </div>
        </Tabs.Panel>

        <Tabs.Panel id="settings" className="mt-5">
          <PaymentsSettingsClient initialData={initialData} />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
