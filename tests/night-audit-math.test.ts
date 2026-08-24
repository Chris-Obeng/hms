import { describe, expect, it } from "vitest";
import { computeNightAuditSummary, type NightAuditInputs } from "@/lib/metrics/night-audit-math";

function base(overrides: Partial<NightAuditInputs> = {}): NightAuditInputs {
  return {
    auditDate: "2026-08-23",
    currency: "GHS",
    rooms: [],
    pendingArrivals: [],
    pendingDepartures: [],
    inHouseCount: 0,
    payments: [],
    occupiedBookings: [],
    lastAuditLog: null,
    ...overrides,
  };
}

describe("computeNightAuditSummary — night audit math", () => {
  it("zero rooms → zero rates, no NaN", () => {
    const s = computeNightAuditSummary(base());
    expect(s.totalRooms).toBe(0);
    expect(s.occupancyRate).toBe(0);
    expect(s.adrToday).toBe(0);
    expect(s.revparToday).toBe(0);
    expect(s.vacantRooms).toBe(0);
  });

  it("occupancy excludes maintenance/out-of-service rooms from vacant count", () => {
    const s = computeNightAuditSummary(
      base({
        rooms: [
          { id: "1", status: "occupied" },
          { id: "2", status: "occupied" },
          { id: "3", status: "available" },
          { id: "4", status: "maintenance" },
          { id: "5", status: "out_of_service" },
        ],
      })
    );
    expect(s.totalRooms).toBe(5);
    expect(s.occupiedRooms).toBe(2);
    expect(s.outOfService).toBe(2);
    expect(s.vacantRooms).toBe(1);
    expect(s.occupancyRate).toBe(40);
  });

  it("ADR/RevPAR derive from nightly revenue across spanning bookings", () => {
    const s = computeNightAuditSummary(
      base({
        rooms: [
          { id: "1", status: "occupied" },
          { id: "2", status: "occupied" },
        ],
        occupiedBookings: [
          { total_amount: 600, nights: 3 }, // 200/night
          { total_amount: 400, nights: 2 }, // 200/night
        ],
      })
    );
    expect(s.estimatedRoomRevenue).toBe(400);
    expect(s.adrToday).toBe(200); // 400 / 2 occupied rooms
    expect(s.revparToday).toBe(200); // 400 / 2 rooms
  });

  it("checkout-day boundary: booking with nights=1 counts a single night of revenue", () => {
    const s = computeNightAuditSummary(
      base({
        rooms: [{ id: "1", status: "occupied" }],
        occupiedBookings: [{ total_amount: 350, nights: 1 }],
      })
    );
    expect(s.estimatedRoomRevenue).toBe(350);
    expect(s.adrToday).toBe(350);
  });

  it("nights=0 or null never divides by zero (guard uses max(1, n))", () => {
    const s = computeNightAuditSummary(
      base({
        rooms: [{ id: "1", status: "occupied" }],
        occupiedBookings: [
          { total_amount: 300, nights: 0 },
          { total_amount: 100, nights: null },
        ],
      })
    );
    expect(s.estimatedRoomRevenue).toBe(400); // 300 + 100
    expect(s.adrToday).toBe(400);
  });

  it("groups payments by method and sorts by amount desc", () => {
    const s = computeNightAuditSummary(
      base({
        payments: [
          { amount: 120, method: "cash" },
          { amount: 500, method: "mobile_money" },
          { amount: 80, method: "cash" },
          { amount: null, method: null },
        ],
      })
    );
    expect(s.totalPaymentsToday).toBe(700);
    expect(s.paymentsByMethod[0]).toMatchObject({ method: "mobile_money", amount: 500 });
    expect(s.paymentsByMethod.find((m) => m.method === "cash")).toMatchObject({ count: 2, amount: 200 });
    expect(s.paymentsByMethod.find((m) => m.method === "other")).toMatchObject({ amount: 0 });
  });

  it("unresolved bookings resolve embedded joins as object or single-element array", () => {
    const s = computeNightAuditSummary(
      base({
        pendingArrivals: [
          { id: "a1", reference: "R-1", guests: { full_name: "Ama" }, rooms: [{ room_number: "12" }] },
          { id: "a2", reference: "R-2", guests: [{ full_name: null }], rooms: [] },
        ],
        pendingDepartures: [
          { id: "d1", reference: "R-3", guests: [{ full_name: "Yaw" }], rooms: { room_number: "7" } },
        ],
      })
    );
    expect(s.pendingArrivals).toBe(2);
    expect(s.unresolvedBookings[0]).toMatchObject({ guestName: "Ama", roomNumber: "12", type: "pending_arrival" });
    expect(s.unresolvedBookings[1].guestName).toBe("Unknown Guest");
    expect(s.unresolvedBookings[2]).toMatchObject({ guestName: "Yaw", roomNumber: "7", type: "pending_departure" });
  });

  it("isClosed reflects the first close-of-day audit log entry", () => {
    const open = computeNightAuditSummary(base());
    expect(open.isClosed).toBe(false);

    const closed = computeNightAuditSummary(
      base({
        lastAuditLog: {
          staff_name: "Efua",
          after_state: { notes: "quiet night", date: "2026-08-23" },
          created_at: "2026-08-23T22:05:00Z",
        },
      })
    );
    expect(closed.isClosed).toBe(true);
    expect(closed.lastAudit).toMatchObject({ staffName: "Efua", notes: "quiet night" });
  });
});
