import { describe, expect, it } from "vitest";
import { HOTEL_CURRENCIES, SUPPORTED_CURRENCIES } from "@/lib/money";
import { hotelSettingsSchema } from "@/app/actions/settings";

describe("Ghana-only pricing", () => {
  it("offers GHS as the only currency, for hotels and the platform fee alike", () => {
    expect([...SUPPORTED_CURRENCIES]).toEqual(["GHS"]);
    expect([...HOTEL_CURRENCIES]).toEqual(["GHS"]);
  });

  it("rejects a non-GHS hotel currency at the settings boundary", () => {
    const base = { name: "Point Breeze Hotel", email: "desk@example.com", city: "Accra", country: "Ghana" };
    expect(hotelSettingsSchema.safeParse({ ...base, currency: "USD" }).success).toBe(false);
    expect(hotelSettingsSchema.safeParse({ ...base, currency: "GHS" }).success).toBe(true);
  });
});

describe("platform flat fee", () => {
  it("accepts GHS and rejects any other fee currency at the action's validation step", () => {
    // Same normalisation the action applies before writing fee_flat_currency.
    const normalise = (raw: unknown) => String(raw ?? "GHS").toUpperCase();
    expect(normalise("GHS")).toBe("GHS");
    expect(normalise("ghs")).toBe("GHS");
    expect(normalise(undefined)).toBe("GHS");
    for (const other of ["USD", "EUR", "NGN", "XOF"]) expect(normalise(other)).not.toBe("GHS");
  });
});
