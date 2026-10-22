import { eachDayOfInterval, format } from "date-fns";
export interface InventorySnapshot {
  id: string;
  effective_date: string;
  capacity_by_type: unknown;
  time_zone: string;
}
export interface CapacityDay { date: string; capacity: number | null; byType: Map<string, number> | null }

/** Carry dated snapshots forward only. No backward fill from today's rooms. */
export function historicalCapacity(snapshots: InventorySnapshot[], start: Date, end: Date, today: string, timeZone: string): CapacityDay[] {
  const sorted = [...snapshots].sort((a, b) => a.effective_date.localeCompare(b.effective_date));
  const parsed = sorted.map(row => {
    if (!row.capacity_by_type || typeof row.capacity_by_type !== "object" || Array.isArray(row.capacity_by_type)) throw new Error("Report unavailable: invalid inventory history.");
    const values = new Map<string, number>();
    for (const [type, count] of Object.entries(row.capacity_by_type)) {
      if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) throw new Error("Report unavailable: invalid historical room capacity.");
      values.set(type, count);
    }
    return { ...row, values };
  });
  let index = -1;
  return eachDayOfInterval({ start, end }).map(day => {
    const date = format(day, "yyyy-MM-dd");
    while (index + 1 < parsed.length && parsed[index + 1].effective_date <= date) index++;
    const current = parsed[index];
    // A timezone change invalidates carry-forward until a matching new baseline.
    if (!current || current.time_zone !== timeZone || date >= today) return { date, capacity: null, byType: null };
    return { date, capacity: [...current.values.values()].reduce((sum, n) => sum + n, 0), byType: current.values };
  });
}
