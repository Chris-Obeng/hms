/**
 * Limits for a one-night price change. `daily_rate_overrides.price` is
 * numeric(10,2), so anything at or above 100,000,000 overflows and more than
 * two decimals would be rounded silently by the database. The server action
 * and the rates editor both check with this, so they agree.
 */
export const MAX_OVERRIDE_PRICE = 99_999_999.99;

/** What is wrong with a price, in words for the editor, or null when it is fine. */
export function overridePriceProblem(price: number): string | null {
  if (!Number.isFinite(price) || price < 0.01) return "Enter a price above 0";
  if (price > MAX_OVERRIDE_PRICE) return "Enter a price below 100,000,000";
  if (!/^\d+(\.\d{1,2})?$/.test(String(price))) return "Use at most 2 decimal places";
  return null;
}
