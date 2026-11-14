/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BookingActionBar } from "@/components/bookings/_components/booking-action-bar";
import { checkInBooking, checkOutBooking } from "@/app/dashboard/actions";
import { updateBookingStatus } from "@/app/actions/bookings";
import type { FullBookingDetail, GroupLineItem } from "@/app/actions/bookings-detail";

// The bar's handlers are Next server actions behind Clerk + Supabase; replace
// the modules so the render path is pure UI.
vi.mock("@/app/dashboard/actions", () => ({
  checkInBooking: vi.fn(async () => ({ success: true })),
  checkOutBooking: vi.fn(async () => ({ success: true })),
  // Not leaving early: the check-out goes straight through.
  previewEarlyCheckout: vi.fn(async () => ({ success: true, preview: null })),
}));
vi.mock("@/app/actions/bookings", () => ({
  updateBookingStatus: vi.fn(async () => ({ success: true })),
}));

/** The real two-room reservation (room 8 anchor out, room 6 still in-house). */
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
    earlyDepartureFee: 0,
    totalAmount: 4199.98,
    amountPaid: 0,
    outstanding: 4199.98,
    paymentStatus: "unpaid",
    status: "checked_out",
    ...overrides,
  };
}

const anchorLine = line({});
const siblingLine = line({
  id: SIBLING_ID,
  reference: "3133888972154",
  roomNumber: "room 6",
  roomTypeName: "Premium Room",
  status: "checked_in",
  totalAmount: 6300,
  amountPaid: 6300,
  outstanding: 0,
  paymentStatus: "paid",
});

function booking(overrides: Partial<FullBookingDetail> = {}): FullBookingDetail {
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
    earlyDepartureFee: 0,
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
      earlyDepartureFee: 0,
      totalRooms: 2,
      lines: [anchorLine, siblingLine],
    },
    ...overrides,
  };
}

function setup(overrides: Partial<FullBookingDetail> = {}) {
  const onAction = vi.fn();
  render(
    <BookingActionBar booking={booking(overrides)} actionLoading={null} onAction={onAction} />
  );
  return { onAction };
}

describe("BookingActionBar — a grouped reservation acts on the opened row only", () => {
  it("names the room and never offers a group-wide action", () => {
    setup({ status: "confirmed" });
    expect(screen.getByRole("button", { name: "Check in Room 8" })).toBeDefined();
    expect(screen.queryByRole("button", { name: /check in all/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /all rooms/i })).toBeNull();
  });

  it("checks in only that one row, never its siblings", async () => {
    const { onAction } = setup({ status: "confirmed" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Check in Room 8" }));

    const [action, optimisticStatus, run] = onAction.mock.calls[0];
    expect(action).toBe("check_in");
    expect(optimisticStatus).toBe("checked_in");

    await run();
    expect(vi.mocked(checkInBooking)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(checkInBooking)).toHaveBeenCalledWith(ANCHOR_ID);
    expect(vi.mocked(checkInBooking)).not.toHaveBeenCalledWith(SIBLING_ID);
  });

  it("checks out only that one row", async () => {
    const { onAction } = setup({ status: "checked_in" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Check out Room 8" }));
    await vi.waitFor(() => expect(onAction).toHaveBeenCalled());

    const [action, , run] = onAction.mock.calls[0];
    expect(action).toBe("check_out");
    await run();
    expect(vi.mocked(checkOutBooking)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(checkOutBooking)).toHaveBeenCalledWith(ANCHOR_ID, {});
  });

  it("keeps a checked-out row from moving its siblings", () => {
    // The room this drawer is open on has left; the group's check-out belongs to
    // the bulk bar under the rooms list, not to this row.
    setup({ status: "checked_out" });
    expect(screen.queryByRole("button", { name: /check (in|out)/i })).toBeNull();
  });

  it("falls back to the room type when the opened row has no physical room", () => {
    setup({ status: "confirmed", room: null, roomType: { id: "rt2", name: "Deluxe Room" } });
    expect(screen.getByRole("button", { name: "Check in Deluxe Room" })).toBeDefined();
  });

  it("cancels that one room and says the siblings are untouched", async () => {
    const { onAction } = setup({ status: "confirmed" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("heading", { name: "Cancel Room 8?" })).toBeDefined();
    expect(screen.getByText(/Other rooms in the reservation are not affected/i)).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Cancel room" }));
    expect(onAction.mock.calls[0][0]).toBe("cancel");
    await onAction.mock.calls[0][2]();
    expect(vi.mocked(updateBookingStatus)).toHaveBeenCalledWith(ANCHOR_ID, "cancelled");
  });
});

describe("BookingActionBar — single-room actions keep their copy", () => {
  it("checks the guest in through the row-level action", async () => {
    const { onAction } = setup({ status: "confirmed", group: null, groupId: null });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Check in guest" }));

    const [action, optimisticStatus, run] = onAction.mock.calls[0];
    expect(action).toBe("check_in");
    expect(optimisticStatus).toBe("checked_in");
    await run();
    expect(vi.mocked(checkInBooking)).toHaveBeenCalledWith(ANCHOR_ID);
  });

  it("checks the guest out through the row-level action", async () => {
    const { onAction } = setup({ status: "checked_in", group: null, groupId: null });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Check out guest" }));
    await vi.waitFor(() => expect(onAction).toHaveBeenCalled());

    const [, , run] = onAction.mock.calls[0];
    await run();
    expect(vi.mocked(checkOutBooking)).toHaveBeenCalledWith(ANCHOR_ID, {});
  });

  it("keeps the reservation wording when the booking is not part of a group", async () => {
    const { onAction } = setup({ status: "confirmed", group: null, groupId: null });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("heading", { name: "Cancel this reservation?" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Cancel reservation" }));
    await onAction.mock.calls[0][2]();
    expect(vi.mocked(updateBookingStatus)).toHaveBeenCalledWith(ANCHOR_ID, "cancelled");
  });
});

describe("BookingActionBar — button content", () => {
  it("renders the check-in label without a glyph", () => {
    setup({ status: "confirmed" });
    const checkIn = screen.getByRole("button", { name: "Check in Room 8" });
    expect(checkIn.textContent).toBe("Check in Room 8");
    expect(checkIn.querySelector("svg")).toBeNull();
  });

  it("renders the check-out label without a glyph", () => {
    setup({ status: "checked_in" });
    const checkOut = screen.getByRole("button", { name: "Check out Room 8" });
    expect(checkOut.textContent).toBe("Check out Room 8");
    expect(checkOut.querySelector("svg")).toBeNull();
  });
});

describe("BookingActionBar — leaving before the booked date", () => {
  const outcome = {
    currency: "GHS",
    checkOutBefore: "2026-11-18",
    checkOutAfter: "2026-11-14",
    nightsReleased: 4,
    releasedAmount: 400,
    earlyDepartureFee: 400,
    totalBefore: 500,
    totalAfter: 500,
    amountPaid: 500,
    overpaid: 0,
    paymentStatus: "paid",
  };

  it("asks first and passes the staff member's choice to the check-out", async () => {
    const { previewEarlyCheckout } = await import("@/app/dashboard/actions");
    vi.mocked(previewEarlyCheckout).mockResolvedValue({
      success: true,
      preview: {
        policy: "charge",
        departureDate: "2026-11-14",
        charge: outcome,
        release: { ...outcome, earlyDepartureFee: 0, totalAfter: 100, overpaid: 400 },
      },
    });
    vi.mocked(checkOutBooking).mockClear();
    const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
    const onAction = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BookingActionBar
          booking={booking({ status: "checked_in", group: null, groupId: null })}
          actionLoading={null}
          onAction={onAction}
        />
      </QueryClientProvider>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Check out guest" }));

    expect(await screen.findByRole("heading", { name: "Check out early?" })).toBeDefined();
    expect(await screen.findByText(/Refund GH₵400\.00 to the guest/)).toBeDefined();
    expect(onAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("radio", { name: /Take them off the bill/ }));
    await user.click(screen.getByRole("button", { name: "Check out early" }));
    await vi.waitFor(() => expect(onAction).toHaveBeenCalled());
    await onAction.mock.calls[0][2]();
    expect(vi.mocked(checkOutBooking)).toHaveBeenCalledWith(ANCHOR_ID, { unusedNights: "release" });
  });
});
