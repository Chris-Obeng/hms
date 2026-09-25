import { fromMinor } from "@/lib/money";
import { getPlatformFeeConfig } from "@/lib/platform/fees";
import { PlatformFeeSettingsForm } from "./settings-client";

// Fee config is read through the service-role client; never cache the page.
export const dynamic = "force-dynamic";

/**
 * Platform Fees — the per-transaction cut RoomLine takes from each online
 * booking payment. Auth is enforced by the (protected) layout; the update
 * action re-asserts admin for defense-in-depth.
 */
export default async function PlatformSettingsPage() {
  const config = await getPlatformFeeConfig();

  const initial = {
    feeType: config.feeType,
    feePercent: config.feePercent,
    // Flat fee is stored in minor units; the form edits major units.
    feeFlatMajor: fromMinor(config.feeFlatMinor, config.feeFlatCurrency),
    feeFlatCurrency: config.feeFlatCurrency,
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Platform fees
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          The commission RoomLine charges hotels on each online booking payment.
          Changes apply to the next transaction — money already collected is
          unaffected.
        </p>
      </header>

      <PlatformFeeSettingsForm initial={initial} />
    </div>
  );
}
