export function nightAuditReceipt(closed = false) {
  return {
    businessDate: "2026-10-20", propertyToday: "2026-10-21",
    isClosed: closed, closeId: closed ? "close-20" : null,
    source: closed ? "durable_close" : "preview", replayed: false,
    closedAt: closed ? "2026-10-21T01:20:00Z" : null,
    closedBy: closed ? "Night manager" : null, notes: closed ? "First handover" : null,
    summary: {
      schemaVersion: 1, businessDate: "2026-10-20", timeZone: "Africa/Accra",
      currency: "GHS", capturedAt: "2026-10-21T01:19:59Z",
      roomNights: 3, roomRevenueMinor: "10001" as string | null,
      rateIssues: 0, reconstructedStays: 0, rateIssueBookings: [],
      pendingArrivals: 0, pendingDepartures: 0, unresolvedBookings: [],
      collectionsMinor: "30029" as string | null, paymentIssues: 0, paymentCount: 2,
      paymentsByMethod: [{ method: "cash", count: 2, amountMinor: "30029" }],
    },
  };
}
