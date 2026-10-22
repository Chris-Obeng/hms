import { describe, expect, it } from "vitest";
import { readNightAuditSummary, validateAuditDate } from "@/lib/night-audit/summary";
import { nightAuditReceipt } from "./night-audit-fixtures";

describe("durable night-audit summary", () => {
  it("keeps net minor units and computes ADR without rounding revenue to whole currency", () => {
    const summary = readNightAuditSummary(nightAuditReceipt());
    expect(summary.roomRevenue).toBe(100.01);
    expect(summary.adr).toBe(33.34);
    expect(summary.collections).toBe(300.29);
    expect(summary.paymentsByMethod[0].amount).toBe(300.29);
    expect(summary.canClose).toBe(true);
  });

  it("supports zero-decimal currency and more than 1000 aggregated facts", () => {
    const receipt = nightAuditReceipt();
    Object.assign(receipt.summary, { currency: "UGX", roomNights: 1001, roomRevenueMinor: "30028999" });
    expect(readNightAuditSummary(receipt)).toMatchObject({ roomRevenue: 30028999, roomNights: 1001, adr: 29999 });
  });

  it("does not invent an ADR for an empty property day", () => {
    const receipt = nightAuditReceipt();
    Object.assign(receipt.summary, { roomNights: 0, roomRevenueMinor: "0" });
    expect(readNightAuditSummary(receipt).adr).toBeNull();
  });

  it("keeps the requested business date separate from next-day actor time", () => {
    const summary = readNightAuditSummary(nightAuditReceipt(true));
    expect(summary.auditDate).toBe("2026-10-20");
    expect(summary.lastAudit?.at).toBe("2026-10-21T01:20:00Z");
    expect(summary.canClose).toBe(false);
  });

  it("reads unverified legacy dates without treating old gross figures as new financial facts", () => {
    const receipt = { ...nightAuditReceipt(true), source: "legacy_audit_log", summary: { legacyAudit: { roomRevenue: 999, occupancyRate: 80 } } };
    expect(readNightAuditSummary(receipt)).toMatchObject({ isClosed: true, roomRevenue: null, roomNights: null, collections: null, currency: null, canClose: false });
  });

  it("does not substitute current room capacity into a persisted historical summary", () => {
    const summary = readNightAuditSummary(nightAuditReceipt(true));
    expect(summary).not.toHaveProperty("occupancyRate");
    expect(summary.warnings.join(" ")).toContain("no dated inventory capacity");
  });

  it("accepts a persisted actor whose optional display name is blank", () => {
    const receipt = { ...nightAuditReceipt(true), closedBy: "", notes: "" };
    expect(readNightAuditSummary(receipt).lastAudit).toMatchObject({ staffName: null, notes: null });
  });

  it("uses propertyToday, not the device day, as the close boundary", () => {
    const receipt = nightAuditReceipt();
    receipt.propertyToday = receipt.businessDate;
    receipt.summary.timeZone = "America/Los_Angeles";
    expect(readNightAuditSummary(receipt).canClose).toBe(false);
  });

  it("gates unresolved operations using full counts, not the capped display list", () => {
    const receipt = nightAuditReceipt();
    receipt.summary.pendingArrivals = 1001;
    expect(readNightAuditSummary(receipt).canClose).toBe(false);
  });

  it("hides partial revenue when nightly reconciliation is incomplete", () => {
    const receipt = nightAuditReceipt();
    receipt.summary.rateIssues = 1;
    receipt.summary.roomRevenueMinor = null;
    expect(readNightAuditSummary(receipt)).toMatchObject({ canClose: false, roomRevenue: null, adr: null });
  });

  it("hides mixed-currency collection totals", () => {
    const receipt = nightAuditReceipt();
    receipt.summary.paymentIssues = 1;
    receipt.summary.collectionsMinor = null;
    expect(readNightAuditSummary(receipt)).toMatchObject({ canClose: false, collections: null });
  });

  it.each(["2026-02-29", "2026-04-31", "2026-13-01", "1999-12-31", "", "tomorrow", "2026-1-01"])("rejects invalid calendar date %s", (date) => {
    expect(() => validateAuditDate(date)).toThrow();
  });
  it("accepts a real leap day", () => expect(() => validateAuditDate("2024-02-29")).not.toThrow());

  it("rejects an invalid property timezone rather than falling back", () => {
    const receipt = nightAuditReceipt();
    receipt.summary.timeZone = "Not/A_Zone";
    expect(() => readNightAuditSummary(receipt)).toThrow();
  });

  it.each(["9007199254740993", "1.3", "NaN", "-1"])("rejects unsafe monetary payload %s", (amount) => {
    const receipt = nightAuditReceipt();
    receipt.summary.roomRevenueMinor = amount;
    expect(() => readNightAuditSummary(receipt)).toThrow();
  });

  it("rejects a close without persistence proof and a mismatched snapshot date", () => {
    expect(() => readNightAuditSummary({ ...nightAuditReceipt(true), closeId: null })).toThrow(/receipt/);
    const receipt = nightAuditReceipt(true);
    receipt.summary.businessDate = "2026-10-19";
    expect(() => readNightAuditSummary(receipt)).toThrow(/business date/);
  });
});
