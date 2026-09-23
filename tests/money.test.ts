import { describe, expect, it } from "vitest";
import {
  applyBps,
  currencyExponent,
  formatMajor,
  formatMoney,
  fromMinor,
  getCurrencySymbol,
  minorPerMajor,
  mulMinor,
  percentToBps,
  sumMinor,
  toMinor,
} from "@/lib/money";

describe("currencyExponent", () => {
  it("defaults to 2 for ordinary currencies and for a missing code", () => {
    expect(currencyExponent("GHS")).toBe(2);
    expect(currencyExponent("USD")).toBe(2);
    expect(currencyExponent("ZZZ")).toBe(2);
    expect(currencyExponent(null)).toBe(2);
    expect(currencyExponent(undefined)).toBe(2);
  });

  it("knows the zero-decimal and three-decimal currencies", () => {
    expect(currencyExponent("UGX")).toBe(0);
    expect(currencyExponent("XOF")).toBe(0);
    expect(currencyExponent("JPY")).toBe(0);
    expect(currencyExponent("KWD")).toBe(3);
  });

  it("is case-insensitive, because codes arrive from settings and webhooks", () => {
    expect(currencyExponent("ugx")).toBe(0);
    expect(minorPerMajor("kwd")).toBe(1000);
  });
});

describe("toMinor", () => {
  it("converts the common two-decimal case", () => {
    expect(toMinor(19.99, "GHS")).toBe(1999);
    expect(toMinor(0.07, "GHS")).toBe(7);
    expect(toMinor(1200, "GHS")).toBe(120_000);
    expect(toMinor(0, "GHS")).toBe(0);
  });

  it("rounds the half-cent cases that raw float multiplication loses", () => {
    // 1.005 * 100 === 100.49999999999999 and 8.165 * 100 === 816.4999999999999,
    // so Math.round on the raw product returns 100 and 816.
    expect(toMinor(1.005, "GHS")).toBe(101);
    expect(toMinor(8.165, "GHS")).toBe(817);
    expect(toMinor(2.675, "GHS")).toBe(268);
  });

  it("does not multiply zero-decimal currencies", () => {
    expect(toMinor(1200, "UGX")).toBe(1200);
    expect(toMinor(5000, "XOF")).toBe(5000);
  });

  it("scales three-decimal currencies by 1000", () => {
    expect(toMinor(1.234, "KWD")).toBe(1234);
  });

  it("accepts the strings PostgREST returns for numeric columns", () => {
    expect(toMinor("19.99", "GHS")).toBe(1999);
    expect(toMinor(" 250.50 ", "GHS")).toBe(25_050);
  });

  it("is symmetric about zero so a refund reverses its charge exactly", () => {
    expect(toMinor(-1.005, "GHS")).toBe(-101);
    expect(toMinor(-8.165, "GHS")).toBe(-817);
    expect(toMinor(-19.99, "GHS")).toBe(-1999);
  });

  it("throws instead of handing NaN to a card charge", () => {
    expect(() => toMinor(Number.NaN, "GHS")).toThrow(TypeError);
    expect(() => toMinor(Number.POSITIVE_INFINITY, "GHS")).toThrow(TypeError);
    expect(() => toMinor("not a price", "GHS")).toThrow(TypeError);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => toMinor(null as any, "GHS")).toThrow(TypeError);
  });
});

describe("fromMinor", () => {
  it("round-trips against toMinor", () => {
    // Expected values are written out rather than derived with `toFixed(2)`,
    // which carries the same float defect: `(1.005).toFixed(2)` is `"1.00"`.
    const cases: [number, number][] = [
      [0, 0],
      [0.07, 0.07],
      [1.005, 1.01],
      [8.165, 8.17],
      [19.99, 19.99],
      [250.5, 250.5],
      [12_345.67, 12_345.67],
    ];
    for (const [major, expected] of cases) {
      expect(fromMinor(toMinor(major, "GHS"), "GHS")).toBe(expected);
    }
  });

  it("respects the currency exponent", () => {
    expect(fromMinor(1200, "UGX")).toBe(1200);
    expect(fromMinor(1234, "KWD")).toBe(1.234);
    expect(fromMinor(1999, "GHS")).toBe(19.99);
  });

  it("rejects a major amount smuggled into a minor slot", () => {
    expect(() => fromMinor(19.99, "GHS")).toThrow(TypeError);
  });
});

describe("integer arithmetic", () => {
  it("multiplies by whole quantities exactly", () => {
    // 0.1 * 3 is 0.30000000000000004 in float; nights are integers, so this is not.
    expect(mulMinor(toMinor(0.1, "GHS"), 3)).toBe(30);
    expect(mulMinor(45_000, 7)).toBe(315_000);
  });

  it("rejects fractional quantities and non-integer amounts", () => {
    expect(() => mulMinor(1999, 1.5)).toThrow(TypeError);
    expect(() => mulMinor(19.99, 2)).toThrow(TypeError);
  });

  it("sums without float drift", () => {
    const nightly = [toMinor(0.1, "GHS"), toMinor(0.2, "GHS"), toMinor(0.3, "GHS")];
    expect(sumMinor(nightly)).toBe(60);
    expect(fromMinor(sumMinor(nightly), "GHS")).toBe(0.6);
    expect(sumMinor([])).toBe(0);
  });
});

describe("percentage tax", () => {
  it("converts decimal percentages to basis points", () => {
    expect(percentToBps(12.5)).toBe(1250);
    expect(percentToBps(0)).toBe(0);
    expect(percentToBps(2.575)).toBe(258);
  });

  it("applies a rate with a single rounding step", () => {
    // 15% VAT + 2.5% levy on GHS 450.00
    expect(applyBps(45_000, percentToBps(17.5))).toBe(7875);
    expect(applyBps(1999, percentToBps(12.5))).toBe(250);
    expect(applyBps(0, 1250)).toBe(0);
  });

  it("keeps tax on a refund symmetric with tax on the charge", () => {
    expect(applyBps(-1999, 1250)).toBe(-250);
  });

  it("rejects non-integer basis points and non-finite percentages", () => {
    expect(() => applyBps(1999, 12.5)).toThrow(TypeError);
    expect(() => percentToBps(Number.NaN)).toThrow(TypeError);
  });
});

describe("formatting", () => {
  it("renders two decimals for GHS", () => {
    const out = formatMajor(1234.5, "GHS");
    expect(out).toContain("1,234.50");
  });

  it("renders no decimals for a zero-decimal currency", () => {
    const out = formatMajor(1200, "UGX");
    expect(out).not.toContain(".");
    expect(out).toContain("1,200");
  });

  it("drops decimals on request without touching the amount", () => {
    expect(formatMajor(1234.56, "GHS", { showDecimals: false })).toContain("1,235");
  });

  it("formats minor units through the same path", () => {
    expect(formatMoney(123_450, "GHS")).toBe(formatMajor(1234.5, "GHS"));
    expect(formatMoney(1200, "UGX")).toBe(formatMajor(1200, "UGX"));
  });

  it("falls back to the symbol map instead of throwing on an unknown code", () => {
    const out = formatMajor(10, "NOTACURRENCY");
    expect(out).toContain("10.00");
  });

  it("exposes symbols with an ISO-code fallback", () => {
    expect(getCurrencySymbol("GHS")).toBe("₵");
    expect(getCurrencySymbol("XAF")).toBe("FCFA");
    expect(getCurrencySymbol("SEK")).toBe("SEK");
  });
});
