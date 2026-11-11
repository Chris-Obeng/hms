/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BookingOverviewPanel } from "@/components/bookings/_components/booking-overview-panel";
import type { FullBookingDetail, GroupLineItem } from "@/app/actions/bookings-detail";

const ANCHOR_ID = "c235bf9e-c372-403c-8563-5dbe0dbb28bd";
const SIBLING_ID = "839a7aaf-695e-4b37-a23e-f24ae5d035f8";

function line(overrides: Partial<GroupLineItem>): GroupLineItem {
  return {
    id: ANCHOR_ID,
    reference: "8600790185330",
    roomTypeName: "Middle-Room",
    roomNumber: "room 8",
    roomsCount: 1,
    adults: 2,
    children: 0,
    checkIn: "2026-09-30",
    checkOut: "2026-10-02",
    nights: 2,
    roomRate: 2099.99,
    subtotal: 4199.98,
    taxAmount: 0,
    totalAmount: 4199.98,
    amountPaid: 0,
    outstanding: 4199.98,
    paymentStatus: "unpaid",
    status: "confirmed",
    ...overrides,
  };
}

const sibling = (overrides: Partial<GroupLineItem> = {}) =>
  line({
    id: SIBLING_ID,
    reference: "3133888972154",
    roomNumber: "room 6",
    roomTypeName: "Premium Room",
    totalAmount: 6300,
    ...overrides,
  });

function booking(lines: GroupLineItem[]): FullBookingDetail {
  return {
    id: ANCHOR_ID,
    reference: "8600790185330",
    status: "confirmed",
    paymentStatus: "partial",
    paymentPreference: "pay_at_hotel",
    source: "direct",
    checkIn: "2026-09-30",
    checkOut: "2026-10-02",
    nights: 2,
    adults: 2,
    children: 0,
    totalAmount: 10499.98,
    amountPaid: 6300,
    outstandingBalance: 4199.98,
    roomRate: 2099.99,
    subtotal: 10499.98,
    taxAmount: 0,
    currency: "GHS",
    estimatedArrival: null,
    specialRequests: null,
    internalNotes: null,
    checkInAt: null,
    checkOutAt: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: null,
    updatedAt: null,
    guest: { id: "g1", fullName: "Elizabeth Nkrumah", email: null, phone: null },
    room: { id: "r8", roomNumber: "8", floor: null },
    roomType: { id: "rt1", name: "Middle-Room" },
    payments: [],
    createdBy: null,
    groupId: ANCHOR_ID,
    roomsCount: 1,
    group: {
      total: 10499.98,
      amountPaid: 6300,
      outstanding: 4199.98,
      subtotal: 10499.98,
      taxAmount: 0,
      totalRooms: lines.length,
      lines,
    },
  };
}

function setup(lines: GroupLineItem[], onBulkAction = vi.fn()) {
  render(<BookingOverviewPanel booking={booking(lines)} actionLoading={null} onBulkAction={onBulkAction} />);
  return { onBulkAction };
}

describe("BookingOverviewPanel — per-room lifecycle buttons", () => {
  it("lists every room and offers only the actions its status allows", () => {
    // Anchor already out, sibling still in house: the only action left is the
    // sibling's check-out, on its own row.
    setup([line({ status: "checked_out" }), sibling({ status: "checked_in" })]);

    expect(screen.getByText("Middle-Room")).toBeDefined();
    expect(screen.getByText("Premium Room")).toBeDefined();

    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons).toEqual(["Check out"]);
  });

  it("renders no controls at all without a bulk handler", () => {
    render(<BookingOverviewPanel booking={booking([line({}), sibling({})])} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("BookingOverviewPanel — one button per eligible room", () => {
  it("checks in every eligible room from its own row", async () => {
    const { onBulkAction } = setup([line({}), sibling({})]);
    const user = userEvent.setup();
    const buttons = screen.getAllByRole("button", { name: "Check in" });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[0]);
    await user.click(buttons[1]);

    expect(onBulkAction).toHaveBeenCalledTimes(2);
    expect(onBulkAction).toHaveBeenCalledWith([ANCHOR_ID], "checked_in", "check_in");
    expect(onBulkAction).toHaveBeenCalledWith([SIBLING_ID], "checked_in", "check_in");
  });

  it("checks out every eligible room from its own row", async () => {
    const { onBulkAction } = setup([
      line({ status: "checked_in" }),
      sibling({ status: "checked_in" }),
    ]);
    const user = userEvent.setup();
    const buttons = screen.getAllByRole("button", { name: "Check out" });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[0]);
    await user.click(buttons[1]);

    expect(onBulkAction).toHaveBeenCalledWith([ANCHOR_ID], "checked_out", "check_out");
    expect(onBulkAction).toHaveBeenCalledWith([SIBLING_ID], "checked_out", "check_out");
  });

  it("offers the single room's control only on that room's row", async () => {
    const { onBulkAction } = setup([line({}), sibling({ status: "checked_in" })]);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Check in" }));

    expect(onBulkAction).toHaveBeenCalledTimes(1);
    expect(onBulkAction).toHaveBeenCalledWith([ANCHOR_ID], "checked_in", "check_in");
  });

  it("hides the buttons when no room can move", () => {
    setup([line({ status: "checked_out" }), sibling({ status: "cancelled" })]);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
