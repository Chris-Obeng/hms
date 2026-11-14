/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OccupancyCard } from "@/app/dashboard/_components/occupancy-card";
import { calculateRoomsSold, unavailableRoomsSold } from "@/lib/metrics/dashboard-occupancy";

const context = { date: "2026-10-21", businessToday: "2026-10-21", asOf: "2026-10-21T12:00:00Z" };
const counts = { totalRooms: 8, outOfService: 1, blocked: 1, soldRooms: 2, heldRooms: 1 };

describe("occupancy card", () => {
  it("labels the exact night, denominator, separate holds, excluded rooms, and one-decimal center", () => {
    const metric = calculateRoomsSold(context, counts);
    const { container } = render(<OccupancyCard metric={metric} />);
    expect(screen.getByRole("heading", { name: "Occupancy, October 21, 2026" })).toBeTruthy();
    expect(screen.getByText("October 21, 2026")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "2 of 6 sellable rooms booked, 33.3 percent. 1 on hold, 3 available"
    );
    expect(screen.getByText("33.3%")).toBeTruthy();
    expect(screen.getByText("Booked").nextElementSibling?.textContent).toBe("2");
    expect(screen.getByText("On hold").nextElementSibling?.textContent).toBe("1");
    expect(screen.getByText("Available").nextElementSibling?.textContent).toBe("3");
    expect(screen.getByText("Out of service").nextElementSibling?.textContent).toBe("1");
    expect(screen.getByText("Blocked").nextElementSibling?.textContent).toBe("1");
    const soldArc = container.querySelector('circle[stroke="var(--primary)"]');
    expect(Number(soldArc?.getAttribute("stroke-dasharray")?.split(" ")[0])).toBe(
      metric.soldPercent
    );
    expect(container.textContent).not.toContain("occupied");
    expect(container.querySelector("animate")).toBeNull();
  });

  it("omits explanatory calculation prose and disclosure clutter across live and future dates", () => {
    const live = render(<OccupancyCard metric={calculateRoomsSold(context, counts)} />);
    expect(live.container.querySelector("details")).toBeNull();
    expect(screen.queryByText(/How this is calculated/i)).toBeNull();
    expect(screen.queryByText(/Live booking snapshot/i)).toBeNull();
    live.unmount();

    const future = render(
      <OccupancyCard metric={calculateRoomsSold({ ...context, date: "2026-10-22" }, counts)} />
    );
    expect(future.container.querySelector("details")).toBeNull();
    expect(screen.queryByText(/Forward booking snapshot/i)).toBeNull();
  });

  it("shows unavailable without a fake 0% donut for zero inventory", () => {
    render(
      <OccupancyCard
        metric={calculateRoomsSold(context, {
          totalRooms: 0,
          outOfService: 0,
          blocked: 0,
          soldRooms: 0,
          heldRooms: 0,
        })}
      />
    );
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("shows overselling explicitly rather than a capped chart", () => {
    render(
      <OccupancyCard
        metric={calculateRoomsSold(context, { ...counts, soldRooms: 9, heldRooms: 0 })}
      />
    );
    expect(screen.getByText("Check inventory")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("exceed sellable inventory by 3 rooms");
    expect(screen.getByText(/sellable rooms \(150%\)/)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows a recorded past night like any other, never labelled tonight", () => {
    render(
      <OccupancyCard metric={calculateRoomsSold({ ...context, date: "2026-10-20" }, counts)} />
    );
    expect(screen.getByText("October 20, 2026")).toBeTruthy();
    expect(screen.getByText("33.3%")).toBeTruthy();
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.queryByText(/Tonight/)).toBeNull();
  });

  it("explains a past night with no room records", () => {
    render(<OccupancyCard metric={unavailableRoomsSold({ ...context, date: "2026-06-01" })} />);
    expect(screen.getByRole("note").textContent).toContain("No room inventory is recorded");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("keeps the data's actual date visible during a date switch", () => {
    render(<OccupancyCard metric={calculateRoomsSold(context, counts)} isDateSwitching />);
    expect(screen.getByText("October 21, 2026")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Loading selected date…");
  });
});
