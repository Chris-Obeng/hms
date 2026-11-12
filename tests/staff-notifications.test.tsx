// @vitest-environment jsdom
import * as React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

const mockFetchNotifications = vi.fn();
const mockMarkAllRead = vi.fn();
const mockClearRead = vi.fn();
const mockMarkSingleRead = vi.fn();
const mockArchiveSingle = vi.fn();

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, getToken: vi.fn(async () => null) }),
}));

const mockRouterPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
  usePathname: () => "/dashboard",
}));

vi.mock("@/lib/observability/realtime", () => ({
  onRealtimeStatus: () => vi.fn(),
}));

vi.mock("@/lib/push", () => ({
  readBrowserAlertsPreference: () => false,
  syncPushSubscriptionStatus: vi.fn(async () => ({
    supported: false,
    iosNeedsInstall: false,
    permission: "default",
    active: false,
    staffId: null,
  })),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    realtime: { setAuth: vi.fn() },
    channel: () => {
      const ch = {
        on: () => ch,
        subscribe: () => ch,
      };
      return ch;
    },
    removeChannel: vi.fn(),
  }),
}));

vi.mock("@/app/actions/notifications", () => ({
  fetchNotificationsAction: (...args: unknown[]) => mockFetchNotifications(...args),
  markAllReadAction: (...args: unknown[]) => mockMarkAllRead(...args),
  clearReadNotificationsAction: (...args: unknown[]) => mockClearRead(...args),
  markSingleReadAction: (...args: unknown[]) => mockMarkSingleRead(...args),
  archiveSingleNotificationAction: (...args: unknown[]) => mockArchiveSingle(...args),
}));

import {
  buildBookingCancelledNotification,
  buildNewBookingNotification,
  buildPaymentReceivedNotification,
  buildPaymentReviewNotification,
  buildStaffJoinedNotification,
  formatPaymentMethodLabel,
  presentStaffNotification,
} from "@/lib/notifications/staff-notifications";
import { NotificationBell } from "@/components/ui/notification-bell";
import {
  NotificationCenter,
  NotificationPanel,
} from "@/components/notifications/notification-center";
import { useNotifications } from "@/hooks/use-notifications";
import type { NotificationItem } from "@/app/actions/notifications";

describe("staff-notifications — plain-language hospitality copy", () => {
  it("builds concise online booking copy with guest, room, dates, nights, and paid amount", () => {
    const copy = buildNewBookingNotification({
      guestName: "Chris Mensah",
      roomLabel: "Deluxe Room",
      checkIn: "2026-11-13",
      checkOut: "2026-11-18",
      nights: 5,
      currency: "GHS",
      amountPaid: 11130,
      isOnline: true,
    });

    expect(copy.title).toBe("New booking — Chris Mensah");
    expect(copy.message).toBe(
      "Deluxe Room · Nov 13 – Nov 18 (5 nights) · Paid GHS 11,130.00"
    );
  });

  it("builds concise pay-at-check-in and desk awaiting-payment copy without technical jargon", () => {
    const onlinePayAtCheckin = buildNewBookingNotification({
      guestName: "Ama Boateng",
      roomLabel: "Standard Room",
      checkIn: "2026-11-10",
      checkOut: "2026-11-13",
      currency: "GHS",
      totalAmount: 4724.97,
      paymentPreference: "pay_at_checkin",
      isOnline: true,
    });

    expect(onlinePayAtCheckin.title).toBe("New booking — Ama Boateng");
    expect(onlinePayAtCheckin.message).toBe(
      "Standard Room · Nov 10 – Nov 13 (3 nights) · Pay at check-in (GHS 4,724.97)"
    );

    const deskUnpaid = buildNewBookingNotification({
      guestName: "Kojo Owusu",
      roomLabel: "Executive Room",
      checkIn: "2026-11-20",
      checkOut: "2026-11-22",
      currency: "GHS",
      totalAmount: 2400,
      paymentPreference: "pay_now",
      actorName: "Sarah",
    });

    expect(deskUnpaid.message).toBe(
      "Executive Room · Nov 20 – Nov 22 (2 nights) · GHS 2,400.00 awaiting payment · Added by Sarah"
    );
  });

  it("builds clear partial, full, and 'other' method payment alerts", () => {
    const partial = buildPaymentReceivedNotification({
      amount: 2000,
      currency: "GHS",
      guestName: "Kofi Asante",
      roomLabel: "Executive Suite",
      remainingBalance: 1500,
      method: "mobile_money",
      actorName: "Sarah Owusu",
    });

    expect(partial.title).toBe("Part payment — GHS 2,000.00");
    expect(partial.message).toBe(
      "Kofi Asante · Executive Suite · Mobile Money · GHS 1,500.00 left to pay · Recorded by Sarah"
    );
    expect(formatPaymentMethodLabel("other")).toBe("Other payment");
  });

  it("builds calm, emoji-free review alerts, settlement checks, and fallback team messages", () => {
    const review = buildPaymentReviewNotification({
      reason: "non_active_booking",
      currency: "GHS",
      amountPaid: 500,
      bookingStatus: "cancelled",
      guestName: "Chris",
    });
    expect(review.title).not.toMatch(/⚠/);
    expect(review.title).toBe("Payment on cancelled booking");
    expect(review.message).toContain("GHS 500.00 arrived from Chris");

    const settlementCheck = buildPaymentReviewNotification({
      reason: "settlement_check",
      currency: "GHS",
      amountPaid: 500,
      guestName: "Chris",
    });
    expect(settlementCheck.title).toBe("Payment needs a quick check");
    expect(settlementCheck.message).not.toContain("differs from the booking total");

    const cancel = buildBookingCancelledNotification({
      guestName: "Chris",
      roomLabel: "Deluxe Room",
      checkIn: "2026-11-13",
      checkOut: "2026-11-15",
      actorName: "Kofi",
    });
    expect(cancel.title).toBe("Booking cancelled — Chris");
    expect(cancel.message).toBe("Deluxe Room · Nov 13 – Nov 15 (2 nights) · Cancelled by Kofi");

    const joined = buildStaffJoinedNotification({
      fullName: "Sarah Boateng",
      role: "front_desk",
    });
    expect(joined.title).toBe("New team member — Sarah Boateng");
    expect(joined.message).toBe("Joined your hotel as Front Desk.");

    const namelessJoin = buildStaffJoinedNotification({ role: "front_desk" });
    expect(namelessJoin.title).toBe("New team member joined");
  });

  it("normalizes legacy database notification strings into clean staff copy", () => {
    const legacyBooking = presentStaffNotification({
      id: "n-1",
      type: "new_booking",
      title: "New online booking",
      message: "1723821744980 · Chris · Deluxe Room · 2026-11-13 → 2026-11-18",
      booking_id: "b-123",
    });
    expect(legacyBooking.title).toBe("New booking — Chris");
    expect(legacyBooking.message).toBe("Deluxe Room · Nov 13 – Nov 18 (5 nights)");
    expect(legacyBooking.reference).toBe("1723821744980");
    expect(legacyBooking.href).toBe("/dashboard/bookings/b-123");

    const legacyPayment = presentStaffNotification({
      id: "n-2",
      type: "payment_received",
      title: "Payment Received",
      message: "Online payment of GHS 11130.00 confirmed",
      booking_id: "b-123",
    });
    expect(legacyPayment.title).toBe("Payment received — GHS 11,130.00");
    expect(legacyPayment.message).toBe("Online payment · Paid in full");

    const legacyWarning = presentStaffNotification({
      id: "n-3",
      type: "payment_failed",
      title: "⚠️ Payment on Non-Active Booking",
      message:
        'Payment REF-1 succeeded but booking status is "cancelled". Money recorded — review manually.',
      booking_id: "b-123",
    });
    expect(legacyWarning.title).toBe("Payment on Non-Active Booking");
    expect(legacyWarning.message).toContain("booking is cancelled");
  });
});

describe("NotificationBell — HeroUI v3 Badge behavior", () => {
  it("hides the badge when count is 0 and displays clamped count when > max", () => {
    const { rerender, container } = render(<NotificationBell count={0} />);
    expect(container.querySelector('[data-slot="badge"]')).toBeNull();

    rerender(<NotificationBell count={7} max={99} />);
    const badge = container.querySelector('[data-slot="badge"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe("7");
    expect(
      screen.getByRole("button", { name: "Notifications, 7 unread" })
    ).toBeDefined();

    rerender(<NotificationBell count={120} max={99} />);
    expect(container.querySelector('[data-slot="badge"]')?.textContent).toBe("99+");
  });
});

function HookHarness({
  onState,
}: {
  onState: (state: ReturnType<typeof useNotifications>) => void;
}) {
  const state = useNotifications({
    hotelId: "hotel-1",
    staffId: "staff-1",
    initialUnreadCount: 2,
  });
  React.useEffect(() => {
    onState(state);
  }, [state, onState]);
  return null;
}

describe("useNotifications — race-free badge counts & optimistic UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("discards stale in-flight fetches so optimistic markAllRead never jumps back", async () => {
    const initialItems: NotificationItem[] = [
      {
        id: "n-1",
        type: "new_booking",
        title: "New booking — Chris",
        message: "Deluxe Room · Nov 13 – Nov 18 (5 nights)",
        booking_id: "b-1",
        is_read: false,
        created_at: new Date().toISOString(),
      },
      {
        id: "n-2",
        type: "payment_received",
        title: "Payment received — GHS 500.00",
        message: "Ama · Standard Room · Paid in full",
        booking_id: "b-2",
        is_read: false,
        created_at: new Date().toISOString(),
      },
    ];

    let resolveStaleFetch!: (val: unknown) => void;

    mockFetchNotifications
      .mockResolvedValueOnce({
        success: true,
        data: initialItems,
        unreadCount: 2,
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStaleFetch = resolve;
          })
      );
    mockMarkAllRead.mockResolvedValue({ success: true });

    let latest!: ReturnType<typeof useNotifications>;
    render(<HookHarness onState={(s) => (latest = s)} />);

    await waitFor(() => expect(latest.hasLoaded).toBe(true));
    expect(latest.unreadCount).toBe(2);

    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = latest.refresh();
    });

    await act(async () => {
      await latest.markAllRead();
    });
    expect(latest.unreadCount).toBe(0);
    expect(latest.notifications.every((n) => n.is_read)).toBe(true);

    await act(async () => {
      resolveStaleFetch({
        success: true,
        data: initialItems,
        unreadCount: 2,
      });
      await refreshPromise;
    });

    expect(latest.unreadCount).toBe(0);
    expect(latest.notifications.every((n) => n.is_read)).toBe(true);
  });

  it("handles same-frame rapid dismissals without double-decrementing and rolls back surgically", async () => {
    const items: NotificationItem[] = [
      {
        id: "n-1",
        type: "new_booking",
        title: "New booking — Chris",
        message: "Deluxe Room",
        booking_id: "b-1",
        is_read: false,
        created_at: "2026-11-12T10:00:00.000Z",
      },
      {
        id: "n-2",
        type: "payment_received",
        title: "Payment received — GHS 500.00",
        message: "Ama · Paid in full",
        booking_id: "b-2",
        is_read: false,
        created_at: "2026-11-12T09:00:00.000Z",
      },
    ];

    let rejectFirst!: (val: unknown) => void;
    mockFetchNotifications
      .mockResolvedValueOnce({
        success: true,
        data: items,
        unreadCount: 2,
      })
      .mockResolvedValue({
        success: true,
        data: [items[0]],
        unreadCount: 1,
      });

    mockArchiveSingle
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            rejectFirst = resolve;
          })
      )
      .mockResolvedValueOnce({ success: true });

    let latest!: ReturnType<typeof useNotifications>;
    render(<HookHarness onState={(s) => (latest = s)} />);
    await waitFor(() => expect(latest.hasLoaded).toBe(true));

    // Fire duplicate tap on n-1 AND tap on n-2 in the exact same synchronous tick
    let p1!: Promise<void>;
    let p1Dup!: Promise<void>;
    let p2!: Promise<void>;
    act(() => {
      p1 = latest.archiveOne("n-1");
      p1Dup = latest.archiveOne("n-1");
      p2 = latest.archiveOne("n-2");
    });

    // Duplicate tap on n-1 was ignored; unread badge dropped cleanly from 2 -> 0
    expect(mockArchiveSingle).toHaveBeenCalledTimes(2);
    expect(latest.unreadCount).toBe(0);
    expect(latest.notifications).toHaveLength(0);

    await act(async () => {
      await Promise.all([p1Dup, p2]);
    });

    // Now slow n-1 fails AFTER n-2 already succeeded — n-2 MUST stay dismissed!
    await act(async () => {
      rejectFirst({ success: false, error: "Temporary network error" });
      await p1;
    });

    expect(latest.notifications.map((n) => n.id)).toEqual(["n-1"]);
    expect(latest.unreadCount).toBe(1);
  });

  it("optimistically clears read items, backfills >40 unread feeds, and rolls back on error", async () => {
    const items: NotificationItem[] = [
      {
        id: "n-unread",
        type: "new_booking",
        title: "New booking — Chris",
        message: "Deluxe Room",
        booking_id: "b-1",
        is_read: false,
        created_at: new Date().toISOString(),
      },
      {
        id: "n-read",
        type: "payment_received",
        title: "Payment received — GHS 500.00",
        message: "Ama · Paid in full",
        booking_id: "b-2",
        is_read: true,
        created_at: new Date().toISOString(),
      },
    ];

    // unreadCount is 3 while only 1 unread is in the initial 40-row slice -> needs backfill after clearRead
    mockFetchNotifications
      .mockResolvedValueOnce({
        success: true,
        data: items,
        unreadCount: 3,
      })
      .mockResolvedValueOnce({
        success: true,
        data: [items[0]],
        unreadCount: 3,
      });

    mockClearRead
      .mockResolvedValueOnce({
        success: false,
        error: "Database temporarily unavailable",
      })
      .mockResolvedValueOnce({ success: true });

    let latest!: ReturnType<typeof useNotifications>;
    render(<HookHarness onState={(s) => (latest = s)} />);

    await waitFor(() => expect(latest.hasLoaded).toBe(true));
    expect(latest.notifications).toHaveLength(2);
    expect(latest.readCount).toBe(1);

    // 1. Failed clearRead rolls back cleanly
    await act(async () => {
      await latest.clearRead();
    });
    expect(latest.notifications).toHaveLength(2);
    expect(latest.unreadCount).toBe(3);

    // 2. Successful clearRead triggers automatic backfill refresh because visibleUnread (1) < unreadCount (3)
    await act(async () => {
      await latest.clearRead();
    });
    await waitFor(() => expect(mockFetchNotifications).toHaveBeenCalledTimes(2));
  });

  it("renders NotificationPanel with drawer-body scroll slot, accessible unread label, and row navigation", async () => {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    const items: NotificationItem[] = [
      {
        id: "n-live-1",
        type: "new_booking",
        title: "New booking — Chris Mensah",
        message: "Deluxe Room · Nov 13 – Nov 18 (5 nights) · Paid GHS 11,130.00",
        booking_id: "booking-99",
        is_read: false,
        created_at: new Date().toISOString(),
      },
    ];

    const onActivateRow = vi.fn();
    const onDismissRow = vi.fn();

    const { container } = render(
      <NotificationPanel
        notifications={items}
        unreadCount={1}
        readCount={0}
        isLoading={false}
        hasLoaded={true}
        isDesktop={true}
        filter="all"
        onFilterChange={vi.fn()}
        onMarkAllRead={vi.fn()}
        onClearRead={vi.fn()}
        onActivateRow={onActivateRow}
        onDismissRow={onDismissRow}
        onOpenSettings={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(container.querySelector('[data-slot="drawer-body"]')).not.toBeNull();
    expect(screen.getByText("Unread:")).toBeDefined();

    const markAllBtn = screen.getByRole("button", { name: /Mark all read/i });
    const clearReadBtn = screen.getByRole("button", { name: /Clear read/i });
    expect((markAllBtn as HTMLButtonElement).disabled).toBe(false);
    expect((clearReadBtn as HTMLButtonElement).disabled).toBe(true);

    const rowBtn = screen.getByText("New booking — Chris Mensah").closest("button")!;
    act(() => {
      rowBtn.click();
    });

    expect(onActivateRow).toHaveBeenCalledWith(
      items[0],
      "/dashboard/bookings/booking-99"
    );

    const dismissBtn = screen.getByRole("button", { name: /Dismiss notification/i });
    act(() => {
      dismissBtn.click();
    });
    expect(onDismissRow).toHaveBeenCalledWith("n-live-1");
  });

  it("toggles NotificationCenter open and closed via the bell button on mobile viewports", async () => {
    const origMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(min-width: 768px)" ? false : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    mockFetchNotifications.mockResolvedValue({
      success: true,
      data: [],
      unreadCount: 0,
    });

    try {
      render(
        <NotificationCenter
          hotelId="hotel-1"
          staffId="staff-1"
          initialUnreadCount={0}
        />
      );

      const bellBtn = screen.getByRole("button", { name: "Notifications" });
      expect(bellBtn.getAttribute("aria-expanded")).toBeNull();

      await act(async () => {
        bellBtn.click();
      });
      expect(bellBtn.getAttribute("aria-expanded")).toBe("true");

      await act(async () => {
        bellBtn.click();
      });
      expect(bellBtn.getAttribute("aria-expanded")).toBeNull();
    } finally {
      window.matchMedia = origMatchMedia;
    }
  });
});
