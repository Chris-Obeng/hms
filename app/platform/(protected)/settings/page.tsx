import { fromMinor } from "@/lib/money";
import { getPlatformFeeConfig } from "@/lib/platform/fees";
import { createPlatformClient } from "@/lib/supabase/platform-server";
import { PlatformMfaCard } from "./_mfa-card";
import { PlatformFeeSettingsForm } from "./settings-client";

// Fee config and MFA state are dynamic; never cache the page.
export const dynamic = "force-dynamic";

/**
 * Platform Settings — Commission configuration + Super-Admin TOTP MFA (`HIGH-10`).
 * Auth is enforced by the (protected) layout; server actions re-assert admin + AAL2.
 */
export default async function PlatformSettingsPage() {
  const supabase = await createPlatformClient();
  const [config, factorsResult, aalResult] = await Promise.all([
    getPlatformFeeConfig(),
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);

  const initial = {
    feeType: config.feeType,
    feePercent: config.feePercent,
    // Flat fee is stored in minor units; the form edits major units.
    feeFlatMajor: fromMinor(config.feeFlatMinor, config.feeFlatCurrency),
    feeFlatCurrency: config.feeFlatCurrency,
  };

  const initialFactors = (factorsResult.data?.totp ?? []).map((f) => ({
    id: f.id,
    friendlyName: f.friendly_name ?? "Authenticator app",
    status: f.status,
    createdAt: f.created_at,
  }));
  const initialAal = aalResult.data?.currentLevel ?? "aal1";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-10 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Platform settings
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Manage RoomLine&apos;s online booking commission and super-admin
          two-factor security.
        </p>
      </header>

      <PlatformMfaCard
        initialFactors={initialFactors}
        initialAal={initialAal}
      />

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Platform fees
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Changes apply to the next transaction — money already collected is
            unaffected.
          </p>
        </div>
        <PlatformFeeSettingsForm initial={initial} />
      </div>
    </div>
  );
}
