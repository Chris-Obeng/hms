/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SegmentedDonut } from "@/components/ui/segmented-donut";

const segments = [
  { key: "cash", label: "Cash", value: 60, color: "red" },
  { key: "card", label: "Card", value: 40, color: "blue" },
];

describe("SegmentedDonut", () => {
  it("states the total and each share in its accessible name, never colour alone", () => {
    render(<SegmentedDonut label="Collected by payment method" heading="Collected" value="GHS 100.00" segments={segments} />);
    expect(screen.getByRole("img", { name: /Collected by payment method: GHS 100.00\. Cash 60 percent, Card 40 percent\./ })).toBeDefined();
    expect(screen.getByText("60%")).toBeDefined();
    expect(screen.getByText("40%")).toBeDefined();
  });

  it("drops zero-valued segments and folds them out of the shares", () => {
    render(<SegmentedDonut label="Mix" value="GHS 10.00" segments={[...segments, { key: "none", label: "None", value: 0, color: "grey" }]} />);
    expect(screen.queryByText("None")).toBeNull();
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("Cash 60 percent");
  });

  it("renders a single figure without inventing a composition", () => {
    render(<SegmentedDonut label="Mix" value="GHS 5.00" segments={[{ key: "cash", label: "Cash", value: 5, color: "red" }]} />);
    expect(screen.getByText("100%")).toBeDefined();
  });

  it("reports an empty state instead of a fabricated ring", () => {
    render(<SegmentedDonut label="Mix" value="GHS 0.00" segments={[]} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Mix: GHS 0.00. No data.");
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("rounds shares to whole numbers that still sum to 100", () => {
    const thirds = [
      { key: "a", label: "Cash", value: 1, color: "red" },
      { key: "b", label: "Card", value: 1, color: "blue" },
      { key: "c", label: "Mobile", value: 1, color: "green" },
    ];
    render(<SegmentedDonut label="Mix" value="GHS 3.00" segments={thirds} />);
    const shown = screen.getAllByText(/%$/).map((node) => Number(node.textContent!.replace("%", "")));
    expect(shown.reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Mix: GHS 3.00. Cash 34 percent, Card 33 percent, Mobile 33 percent.");
  });

  it("shows a tiny real slice as <1 instead of 0", () => {
    render(<SegmentedDonut label="Mix" value="GHS 1,000.00" segments={[
      { key: "big", label: "Card", value: 999.5, color: "blue" },
      { key: "tiny", label: "Cash", value: 0.5, color: "red" },
    ]} />);
    expect(screen.getByText("<1%")).toBeDefined();
    expect(screen.queryByText("0%")).toBeNull();
  });
});
