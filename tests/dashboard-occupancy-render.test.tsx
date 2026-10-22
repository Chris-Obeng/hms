/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OccupancyCard } from "@/app/dashboard/_components/occupancy-card";
import { calculateRoomsSold } from "@/lib/metrics/dashboard-occupancy";

const context = { date: "2026-10-21", businessToday: "2026-10-21", asOf: "2026-10-21T12:00:00Z" };
const counts = { totalRooms: 8, outOfService: 1, blocked: 1, soldRooms: 2, heldRooms: 1 };

describe("rooms-sold card", () => {
  it("labels the exact night, denominator, separate holds and one-decimal center", () => {
    const metric = calculateRoomsSold(context, counts);
    const { container } = render(<OccupancyCard metric={metric} />);
    expect(screen.getByRole("heading", { name: "Rooms sold" })).toBeTruthy();
    expect(screen.getByText("October 21, 2026")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("2 of 6 sellable rooms, 33.3 percent. 1 pending holds and 3 available to sell");
    expect(screen.getByText("33.3%")).toBeTruthy();
    expect(screen.getByText("Pending holds").nextElementSibling?.textContent).toBe("1");
    expect(screen.getByText("Available to sell").nextElementSibling?.textContent).toBe("3");
    const soldArc = container.querySelector('circle[stroke="var(--primary)"]');
    expect(Number(soldArc?.getAttribute("stroke-dasharray")?.split(" ")[0])).toBe(metric.soldPercent);
    expect(container.textContent).not.toContain("occupied");
    expect(container.querySelector("animate")).toBeNull();
  });
  it("keeps native calculation details keyboard-focusable and expandable", async () => {
    const user = userEvent.setup();
    const { container } = render(<OccupancyCard metric={calculateRoomsSold(context, counts)} />);
    await user.tab();
    expect(document.activeElement?.textContent).toBe("How this is calculated");
    // user-event 14's keypress behavior does not emulate native Enter clicks
    // for summary elements. Verify focus and native disclosure activation.
    await user.click(screen.getByText("How this is calculated"));
    expect(container.querySelector("details")?.open).toBe(true);
  });
  it("shows unavailable without a fake 0% donut for zero inventory", () => {
    render(<OccupancyCard metric={calculateRoomsSold(context, { totalRooms: 0, outOfService: 0, blocked: 0, soldRooms: 0, heldRooms: 0 })} />);
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText("0%")).toBeNull();
  });
  it("shows overselling explicitly rather than a capped chart", () => {
    render(<OccupancyCard metric={calculateRoomsSold(context, { ...counts, soldRooms: 9, heldRooms: 0 })} />);
    expect(screen.getByText("Check inventory")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("exceed sellable inventory by 3 rooms");
    expect(screen.getByText(/sellable rooms \(150%\)/)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
  it("explains historical unavailability and never labels it tonight", () => {
    render(<OccupancyCard metric={calculateRoomsSold({ ...context, date: "2026-10-20" }, counts)} />);
    expect(screen.getByText("October 20, 2026")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain("Historical room inventory");
    expect(screen.queryByText(/Tonight/)).toBeNull();
  });
  it("qualifies future capacity as a current-inventory projection", () => {
    render(<OccupancyCard metric={calculateRoomsSold({ ...context, date: "2026-10-22" }, counts)} />);
    expect(screen.getByText(/Forward booking snapshot using today's active rooms/)).toBeTruthy();
  });
  it("keeps the data's actual date visible during a date switch", () => {
    render(<OccupancyCard metric={calculateRoomsSold(context, counts)} isDateSwitching />);
    expect(screen.getByText("October 21, 2026")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Loading selected date…");
  });
});
