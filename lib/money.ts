/**
 * lib/money.ts
 *
 * Integer money for the JavaScript layer.
 *
 * Postgres already stores amounts as `numeric(10,2)`, which is exact. The
 * imprecision lives on this side: every price that crosses into JS becomes a
 * binary float, and the conversion to Paystack's smallest unit was written
 * inline as `Math.round(total * 100)` in four separate request handlers. Two of
 * those handlers charge a card. `19.99 * 100` is `1998.9999999999998` in IEEE
 * 754, and the `× 100` factor is simply wrong for the zero-decimal currencies
 * this app already lets a hotel choose (`UGX` is in `SUPPORTED_CURRENCIES`
 * today) — charging a Kampala guest 100× the intended amount is a one-line
 * mistake with no compensating control anywhere downstream.
 *
 * So: one exponent table, one rounding rule, one conversion in each direction,
 * and integer arithmetic in between. Amounts named `*Minor` are integers in the
 * currency's smallest unit (pesewas, kobo, cents). Amounts named `major` are the
 * human-facing decimal value and exist only at the edges — reading a `numeric`
 * column, rendering a string, or talking to an API that expects decimals.
 *
 * This module is pure and dependency-free so it can be imported from server
 * components, client components, server actions and route handlers alike.
 */

/** Fallback for hotels created before `currency` was mandatory. */
export const DEFAULT_CURRENCY = "GHS";

/**
 * The one currency this version is sold in. Ghana only: hotels and the platform
 * fee are both denominated in cedis. The formatting helpers below stay generic
 * because historical rows and Paystack responses can still carry another ISO
 * code; nothing in the product offers one.
 */
export const SUPPORTED_CURRENCIES = ["GHS"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Hotel pricing currency. Same list today, kept separate so the two can diverge later. */
export const HOTEL_CURRENCIES = SUPPORTED_CURRENCIES;
export type HotelCurrency = (typeof HOTEL_CURRENCIES)[number];

/**
 * ISO 4217 minor-unit exponents that are *not* 2.
 *
 * Only the exceptions are listed; `currencyExponent` defaults to 2, which is
 * correct for the overwhelming majority and for every currency this app
 * currently supports except `UGX`. The list is deliberately broader than
 * `SUPPORTED_CURRENCIES`: a booking row stores whatever currency it was created
 * with, and the two CFA francs already appear in the symbol map, so a value can
 * reach this module without ever having been selectable in settings.
 */
const CURRENCY_EXPONENT: Record<string, number> = {
  // Zero-decimal: the minor unit *is* the major unit.
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  // Three-decimal, mostly Gulf states.
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
};

/** Display symbols for currencies whose ISO code reads poorly in a price. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  GHS: "₵",
  USD: "$",
  EUR: "€",
  GBP: "£",
  NGN: "₦",
  ZAR: "R",
  KES: "KSh",
  UGX: "USh",
  XOF: "CFA",
  XAF: "FCFA",
};

/** Number of decimal places the currency's minor unit implies. Defaults to 2. */
export function currencyExponent(currency: string | null | undefined): number {
  if (!currency) return CURRENCY_EXPONENT[DEFAULT_CURRENCY] ?? 2;
  return CURRENCY_EXPONENT[currency.toUpperCase()] ?? 2;
}

/** Minor units in one major unit: 100 for GHS, 1 for UGX, 1000 for KWD. */
export function minorPerMajor(currency: string | null | undefined): number {
  return 10 ** currencyExponent(currency);
}

/** Currency symbol, falling back to the ISO code when there is no good glyph. */
export function getCurrencySymbol(currency: string = DEFAULT_CURRENCY): string {
  return CURRENCY_SYMBOLS[currency?.toUpperCase()] ?? currency;
}

// ── Rounding ─────────────────────────────────────────────────────

/**
 * Half-up, away from zero.
 *
 * `Math.round` breaks ties toward +∞, so `Math.round(-0.5)` is `-0`. Refunds and
 * balance adjustments are negative amounts, and a rounding rule that is not
 * symmetric makes a refund differ from the charge it reverses by one minor unit.
 */
function roundHalfUpAway(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

function assertMinor(minor: number, label: string): void {
  if (!Number.isInteger(minor)) {
    // A non-integer here means a major-unit amount reached a minor-unit
    // parameter — `199` where `19900` belonged, or the reverse. Both are
    // 100×-magnitude money bugs, so they must not be quietly rounded away.
    throw new TypeError(`${label} must be an integer number of minor units, got ${minor}`);
  }
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError(`${label} exceeds the safe integer range: ${minor}`);
  }
}

// ── Conversion ───────────────────────────────────────────────────

/**
 * Decimal amount → integer minor units. This is the only place a price becomes
 * a payment-gateway amount.
 *
 * Strings are accepted because that is how `numeric` columns arrive over
 * PostgREST when precision matters, and passing the string through avoids one
 * float round trip.
 *
 * The `toFixed(4)` step is not cosmetic. `1.005 * 100` is `100.49999999999999`
 * and `8.165 * 100` is `816.4999999999999`, so rounding the raw product loses a
 * pesewa on amounts a hotel can genuinely charge; collapsing the representation
 * error first yields 101 and 817.
 *
 * Throws rather than returning `NaN`: every caller is on a path where the next
 * step is charging a card or comparing against money already captured.
 */
export function toMinor(major: number | string, currency: string | null | undefined): number {
  const numeric = typeof major === "string" ? Number(major.trim()) : major;
  if (typeof numeric !== "number" || !Number.isFinite(numeric)) {
    throw new TypeError(`Cannot convert ${JSON.stringify(major)} to minor units`);
  }
  const scaled = numeric * minorPerMajor(currency);
  const rounded = roundHalfUpAway(Number(scaled.toFixed(4)));
  assertMinor(rounded, "converted amount");
  return rounded;
}

/**
 * Integer minor units → decimal amount, for display and for the existing
 * `numeric(10,2)` columns. Not for arithmetic — do the maths in minor units and
 * convert once at the end.
 */
export function fromMinor(minor: number, currency: string | null | undefined): number {
  assertMinor(minor, "minor amount");
  const factor = minorPerMajor(currency);
  // Divide, then re-round to the currency's precision: 2 decimals cannot be
  // represented exactly in binary, so `1999 / 100` is fine but a subsequent
  // multiplication would reintroduce the drift this module exists to remove.
  return Number((minor / factor).toFixed(currencyExponent(currency)));
}

// ── Integer arithmetic ───────────────────────────────────────────

/** Minor amount × a whole quantity (nights, rooms). Stays exact. */
export function mulMinor(minor: number, quantity: number): number {
  assertMinor(minor, "minor amount");
  if (!Number.isInteger(quantity)) {
    throw new TypeError(`Quantity must be a whole number, got ${quantity}`);
  }
  const product = minor * quantity;
  assertMinor(product, "product");
  return product;
}

/** Sum of minor amounts. Exact by construction; `reduce` on floats is not. */
export function sumMinor(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    assertMinor(value, "minor amount");
    total += value;
  }
  assertMinor(total, "total");
  return total;
}

/**
 * Percentage → basis points.
 *
 * `hotels.settings.tax_percentage` is a decimal percentage (`12.5`). Basis
 * points keep the rate an integer, so applying it is integer × integer ÷ 10000
 * with exactly one rounding step, rather than a chain of float multiplications
 * whose result depends on the order they were written in.
 */
export function percentToBps(percentage: number): number {
  if (!Number.isFinite(percentage)) {
    throw new TypeError(`Tax percentage must be finite, got ${percentage}`);
  }
  return roundHalfUpAway(Number((percentage * 100).toFixed(4)));
}

/** Apply a basis-point rate to a minor amount, rounding once. */
export function applyBps(minor: number, bps: number): number {
  assertMinor(minor, "minor amount");
  if (!Number.isInteger(bps)) {
    throw new TypeError(`Basis points must be an integer, got ${bps}`);
  }
  return roundHalfUpAway((minor * bps) / 10_000);
}

// ── Display ──────────────────────────────────────────────────────

/**
 * Ghana is the launch market and every hotel on the platform prices in GHS
 * today, so `en-GH` is the house locale. It is passed explicitly rather than
 * left to the runtime: a server component formats on the server, where the
 * system locale is whatever the host happens to be, and the same amount would
 * render differently in SSR output than after hydration.
 */
export const DEFAULT_LOCALE = "en-GH";

export interface FormatMoneyOptions {
  /** Drop the decimal part — dashboards, charts, compact tables. */
  showDecimals?: boolean;
  locale?: string;
  /** Escape hatch for callers that need a specific Intl behaviour. */
  intl?: Intl.NumberFormatOptions;
}

/**
 * Formats a *major-unit* amount. Used by the display layer, which still reads
 * `numeric` columns as decimals.
 *
 * Fraction digits default to the currency's own exponent instead of a hardcoded
 * 2, so `UGX 1200` renders as a whole number rather than `USh 1,200.00`.
 *
 * Intl throws on an unknown currency code rather than degrading, and a booking
 * row can carry any code, so the fallback formats the number and prefixes the
 * symbol map. A price that renders slightly wrong beats a page that 500s.
 */
export function formatMajor(
  amount: number,
  currency: string = DEFAULT_CURRENCY,
  options: FormatMoneyOptions = {}
): string {
  const { showDecimals = true, locale = DEFAULT_LOCALE, intl } = options;
  const digits = showDecimals ? currencyExponent(currency) : 0;

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      ...intl,
    }).format(amount);
  } catch {
    const formatted = amount.toLocaleString(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      ...intl,
    });
    return `${getCurrencySymbol(currency)}${formatted}`;
  }
}

/** Formats an integer minor-unit amount. Preferred for anything new. */
export function formatMoney(
  minor: number,
  currency: string = DEFAULT_CURRENCY,
  options: FormatMoneyOptions = {}
): string {
  return formatMajor(fromMinor(minor, currency), currency, options);
}
