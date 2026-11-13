/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { toCell } from "@/app/dashboard/reports/_components/bi/export-button";

describe("BI CSV cells", () => {
  it.each(["=SUM(A1:A2)", "+1+1", "-2+3", "@cmd", "\tlead", "\rlead", "-Direct"])("neutralises formula text %j", (text) => {
    expect(toCell(text).replace(/^"|"$/g, "").startsWith("'")).toBe(true);
  });
  it("keeps numbers and signed figures as they are", () => {
    expect(toCell(-250.5)).toBe("-250.5");
    expect(toCell(0)).toBe("0");
    expect(toCell("-1.5%")).toBe("-1.5%");
    expect(toCell("-4 pts")).toBe("-4 pts");
    expect(toCell("6.4%")).toBe("6.4%");
  });
  it("quotes commas, quotes and line breaks, and leaves empty cells blank", () => {
    expect(toCell('Garden, "suite"')).toBe('"Garden, ""suite"""');
    expect(toCell("=1,2")).toBe(`"'=1,2"`);
    expect(toCell(null)).toBe("");
    expect(toCell(undefined)).toBe("");
    expect(toCell("Direct")).toBe("Direct");
  });
});
