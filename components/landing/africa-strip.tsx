/**
 * Local-trust strip. Payment method names are plain text (no third-party
 * logos to license or keep in sync); the point is recognition, not branding.
 */
const METHODS = ["MTN Mobile Money", "Telecel Cash", "AirtelTigo", "VISA", "Mastercard"] as const;

export function AfricaStrip() {
  return (
    <section className="border-y border-ivory/[0.06] bg-ivory/[0.02]" aria-label="Supported payment methods">
      <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-ivory/35">
          Built for how Ghana pays
        </p>
        <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {METHODS.map((method) => (
            <li key={method} className="text-sm font-semibold tracking-tight text-ivory/55">
              {method}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-center text-xs text-ivory/30">
          Settled in cedis, straight to your Ghanaian bank account.
        </p>
      </div>
    </section>
  );
}
