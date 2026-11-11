/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { nightAuditReceipt } from "./night-audit-fixtures";
import { readNightAuditSummary, type NightAuditSummary } from "@/lib/night-audit/summary";
import type { ReactElement } from "react";
import { NightAuditClient } from "@/app/dashboard/night-audit/night-audit-client";


const mocks = vi.hoisted(() => ({ close: vi.fn(), getData: vi.fn() }));
vi.mock("@/app/dashboard/night-audit/actions", () => ({ executeNightAudit: mocks.close, getNightAuditData: mocks.getData }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

function summary(patch: Record<string, unknown> = {}): NightAuditSummary {
  return { ...readNightAuditSummary(nightAuditReceipt()), ...patch } as NightAuditSummary;
}

function renderPage(element: ReactElement) {
  return render(element);
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("Daily close", () => {
  it("offers one close action when everything is settled", () => {
    renderPage(<NightAuditClient roomRevenueInclTax={100} initialSummary={summary()} canRunAudit />);
    expect(screen.getByRole("heading", { name: "Ready to close" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Close Oct 20" })).toBeDefined();
    expect(screen.getByText("Nothing outstanding.")).toBeDefined();
  });

  it("blocks the close and names the work to do", () => {
    renderPage(<NightAuditClient roomRevenueInclTax={100} canRunAudit initialSummary={summary({
      pendingArrivals: 1, rateIssues: 1,
      unresolvedBookings: [{ id: "b1", reference: "RL-1", guestName: "Ama Mensah", roomNumber: "102", type: "pending_arrival" }],
      rateIssueBookings: [{ id: "b2", reference: "RL-2" }],
    })} />);
    expect(screen.getByRole("heading", { name: "Blocked · 2 to resolve" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Close Oct 20" }).getAttribute("disabled")).not.toBeNull();
    expect(screen.getByText("Ama Mensah")).toBeDefined();
    expect(screen.getByText("RL-2")).toBeDefined();
  });

  it("waits for the property day to finish", () => {
    renderPage(<NightAuditClient roomRevenueInclTax={100} initialSummary={summary({ auditDate: "2026-10-21", propertyToday: "2026-10-21" })} canRunAudit />);
    expect(screen.getByRole("heading", { name: "Waiting for midnight" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Close Oct 21" }).getAttribute("disabled")).not.toBeNull();
  });

  it("shows the receipt, not a close button, once the day is closed", () => {
    renderPage(<NightAuditClient roomRevenueInclTax={100} initialSummary={readNightAuditSummary(nightAuditReceipt(true))} canRunAudit />);
    expect(screen.getByRole("heading", { name: "Closed" })).toBeDefined();
    expect(screen.getByText(/Recorded by Night manager/)).toBeDefined();
    expect(screen.getByText("First handover")).toBeDefined();
    expect(screen.queryByRole("button", { name: /^Close / })).toBeNull();
  });

  it("requires confirmation inside a dialog before recording the close", async () => {
    const user = userEvent.setup();
    renderPage(<NightAuditClient roomRevenueInclTax={100} initialSummary={summary()} canRunAudit />);
    await user.click(screen.getByRole("button", { name: "Close Oct 20" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("cannot be changed later");
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it("hides the close action from staff who cannot run it", () => {
    renderPage(<NightAuditClient roomRevenueInclTax={100} initialSummary={summary()} canRunAudit={false} />);
    expect(screen.getByRole("button", { name: "Close Oct 20" }).getAttribute("disabled")).not.toBeNull();
    expect(screen.getByText("A manager or super admin can close the day.")).toBeDefined();
  });

  it("announces the new state after the day closes", async () => {
    const user = userEvent.setup();
    mocks.close.mockResolvedValue({ success: true, message: "Day closed.", summary: readNightAuditSummary(nightAuditReceipt(true)) });
    renderPage(<NightAuditClient roomRevenueInclTax={100} initialSummary={summary()} canRunAudit />);
    // The pre-close state is announced on mount; the post-close state must replace it.
    expect(screen.getAllByText(/This day is ready to close\./).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Close Oct 20" }));
    const dialog = await screen.findByRole("alertdialog");
    const submit = [...dialog.querySelectorAll("button")].at(-1)!;
    expect(submit.textContent).toBe("Close Oct 20");
    await user.click(submit);
    await waitFor(() => expect(screen.getAllByText("This day is closed.").length).toBeGreaterThan(0));
    expect(screen.queryByText("This day is ready to close.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Closed" })).toBeDefined();
  });

  it("clears a failed close's error when the dialog is reopened", async () => {
    const user = userEvent.setup();
    mocks.close.mockResolvedValueOnce({ success: false, error: "Already closed by another manager." });
    renderPage(<NightAuditClient roomRevenueInclTax={100} initialSummary={summary()} canRunAudit />);
    await user.click(screen.getByRole("button", { name: "Close Oct 20" }));
    const dialog = await screen.findByRole("alertdialog");
    const submit = [...dialog.querySelectorAll("button")].at(-1)!;
    await user.click(submit);
    expect(await screen.findByText("Already closed by another manager.")).toBeDefined();
    await user.click([...dialog.querySelectorAll("button")][0]);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Close Oct 20" }));
    await screen.findByRole("alertdialog");
    expect(screen.queryByText("Already closed by another manager.")).toBeNull();
  });
});
