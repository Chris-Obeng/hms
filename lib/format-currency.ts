/**
 * Currency formatting utilities for multi-currency support.
 * 
 * Production-grade: Uses Intl.NumberFormat for locale-aware formatting,
 * falls back to symbol map for unsupported locales.
 */

/** Supported currency codes (ISO 4217) */
export const SUPPORTED_CURRENCIES = ["GHS", "USD", "EUR", "GBP", "NGN", "ZAR", "KES", "UGX"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

const CURRENCY_SYMBOLS: Record<string, string> = {
  GHS: "₵",
  USD: "$",
  EUR: "€",
  GBP: "£",
  NGN: "₦",
  ZAR: "R",
  KES: "KSh",
  UGX: "USh",
  XOF: "CFA", // West African CFA franc
  XAF: "FCFA", // Central African CFA franc
};

/**
 * Format amount with currency symbol.
 * Uses browser's Intl.NumberFormat when available for proper locale formatting.
 * Falls back to custom symbol + basic formatting for unsupported currencies.
 */
export function formatCurrency(
  amount: number,
  currencyCode: string = "GHS",
  options?: { showDecimals?: boolean; locale?: string }
): string {
  const { showDecimals = true, locale = "en-GH" } = options ?? {};

  // Try native formatting first (respects locale decimal/grouping rules)
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: showDecimals ? 2 : 0,
      maximumFractionDigits: showDecimals ? 2 : 0,
    }).format(amount);
  } catch {
    // Fallback if currency not supported by Intl (unlikely but safe)
    const symbol = CURRENCY_SYMBOLS[currencyCode] ?? currencyCode;
    const formatted = amount.toLocaleString(undefined, {
      minimumFractionDigits: showDecimals ? 2 : 0,
      maximumFractionDigits: showDecimals ? 2 : 0,
    });
    return `${symbol}${formatted}`;
  }
}

/**
 * Get currency symbol only (no amount).
 */
export function getCurrencySymbol(currencyCode: string = "GHS"): string {
  return CURRENCY_SYMBOLS[currencyCode] ?? currencyCode;
}

/**
 * Format currency for display in compact form (no decimals, uses symbol).
 * Example: formatCurrencyCompact(1234, "GHS") → "₵1,234"
 */
export function formatCurrencyCompact(
  amount: number,
  currencyCode: string = "GHS"
): string {
  return formatCurrency(amount, currencyCode, { showDecimals: false });
}
