/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ActivityList, type ActivityBooking } from "@/app/dashboard/_components/activity-list";

function booking(overrides: Partial<ActivityBooking> = {}): ActivityBooking {
  return {
    id: "booking-1",
    reference: "RL-0001",
    guestName: "Ama Serwaa",
    guestPhone: null,
    guestEmail: null,
    roomNumber: "12",
    roomType: "Deluxe",
    roomsCount: 1,
    checkIn: "2026-10-01",
    checkOut: "2026-10-03",
    nights: 2,
    adults: 2,
    children: 0,
    status: "confirmed",
    paymentStatus: "unpaid",
    totalAmount: 1200,
    source: "manual",
    createdAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

function renderList(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function mockViewport(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  mockViewport(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ActivityList cancel / no-show dropdown", () => {
  it("opens the cancel confirmation when 'Cancel booking' is chosen", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    renderList(
      <ActivityList
        bookings={[booking()]}
        onCheckIn={vi.fn()}
        onCancel={onCancel}
        onNoShow={vi.fn()}
        onViewDetails={vi.fn()}
      />
    );

    // Open the split-button overflow menu (desktop table path)
    await user.click(screen.getByRole("button", { name: "Check-in options" }));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: "Cancel booking" }));

    expect(await screen.findByRole("heading", { name: "Cancel Reservation" })).toBeDefined();
  });

  it("opens the no-show confirmation when 'Mark no-show' is chosen", async () => {
    const user = userEvent.setup();

    renderList(
      <ActivityList
        bookings={[booking()]}
        onCheckIn={vi.fn()}
        onCancel={vi.fn()}
        onNoShow={vi.fn()}
        onViewDetails={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Check-in options" }));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: "Mark no-show" }));

    expect(await screen.findByRole("heading", { name: "Mark as No-Show" })).toBeDefined();
  });

  it("calls onCancel with the booking id after confirming", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    renderList(
      <ActivityList
        bookings={[booking()]}
        onCheckIn={vi.fn()}
        onCancel={onCancel}
        onNoShow={vi.fn()}
        onViewDetails={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Check-in options" }));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: "Cancel booking" }));
    await user.click(await screen.findByRole("button", { name: "Cancel Reservation" }));

    await waitFor(() => expect(onCancel).toHaveBeenCalledWith("booking-1"));
  });

  it("calls onNoShow with the booking id after confirming", async () => {
    const user = userEvent.setup();
    const onNoShow = vi.fn();

    renderList(
      <ActivityList
        bookings={[booking()]}
        onCheckIn={vi.fn()}
        onCancel={vi.fn()}
        onNoShow={onNoShow}
        onViewDetails={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Check-in options" }));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: "Mark no-show" }));
    await user.click(await screen.findByRole("button", { name: "Mark No-Show" }));

    await waitFor(() => expect(onNoShow).toHaveBeenCalledWith("booking-1"));
  });
});
