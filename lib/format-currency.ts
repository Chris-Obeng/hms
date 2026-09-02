/**
 * lib/format-currency.ts
 *
 * Compatibility shim. The implementation now lives in `lib/money.ts`, which owns
 * the ISO 4217 exponent table, the symbol map and the Intl builder.
 *
 * This module used to carry a second `formatCurrency` whose third parameter was
 * `{ showDecimals, locale }` while `lib/format.ts` took `Intl.NumberFormatOptions`
 * — two incompatible signatures under one name, and two copies of the currency
 * list that could drift. The `{ showDecimals, locale }` shape is preserved here so
 * existing call sites keep compiling; new code should import from `lib/money` or
 * `lib/format`.
 */

import {
  DEFAULT_CURRENCY,
  formatMajor,
  type FormatMoneyOptions,
} from "./money";

export {
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
  getCurrencySymbol,
} from "./money";

/** Formats an amount with its currency symbol. Decimals follow the currency. */
export function formatCurrency(
  amount: number,
  currencyCode: string = DEFAULT_CURRENCY,
  options?: Pick<FormatMoneyOptions, "showDecimals" | "locale">
): string {
  return formatMajor(amount, currencyCode, options);
}

/** No decimals, for dashboards and charts: `1234` → `₵1,234`. */
export function formatCurrencyCompact(
  amount: number,
  currencyCode: string = DEFAULT_CURRENCY
): string {
  return formatMajor(amount, currencyCode, { showDecimals: false });
}
