/** Shared figure formatting for the BI page. All amounts arrive as major-unit numbers from the report DTOs. */

/** Axis tick style: 15000 -> "15K". */
export function compactNumber(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** Currency prefix stripped so the amount can be styled separately: "GHS 12,345" -> "12,345". */
export function moneyAmount(value: number | null, currency: string, options?: Intl.NumberFormatOptions): string {
  if (value === null) return "—";
  const text = new Intl.NumberFormat("en-GH", {
    style: "currency", currency, currencyDisplay: "code", ...options,
  }).format(value);
  return text.replace(new RegExp(`^${currency}\\s*`), "").trim() || text;
}

/** One-decimal share for legends and table cells. */
export function share(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 1000) / 10}%` : "0%";
}

/** Signed delta with the unit stated: "+9.2% vs prior period" / "+4.1 pts vs prior period". */
export function deltaText(value: number | null, unit: "%" | "pts" = "%"): { text: string; direction: "up" | "down" | "flat" } | null {
  if (value === null || !Number.isFinite(value)) return null;
  const direction = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const sign = direction === "flat" ? "" : value > 0 ? "+" : "−";
  const suffix = unit === "pts" ? " pts vs prior period" : "% vs prior period";
  return { text: `${sign}${Math.abs(value).toLocaleString("en", { maximumFractionDigits: 1 })}${suffix}`, direction };
}

/** Monday-start week key for a YYYY-MM-DD date. */
function weekKey(date: string): string {
  const monday = new Date(`${date}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

/** Weekly totals of a daily series, for the revenue granularity toggle. */
export function weeklySum(rows: { date: string; value: number }[]): { key: string; value: number }[] {
  const weeks = new Map<string, number>();
  for (const row of rows) {
    const key = weekKey(row.date);
    weeks.set(key, (weeks.get(key) ?? 0) + row.value);
  }
  return [...weeks].map(([key, value]) => ({ key, value }));
}

/** Weekly averages of a daily series (gaps skipped), for occupancy. */
export function weeklyMean(rows: { date: string; value: number | null }[]): { key: string; value: number | null }[] {
  const weeks = new Map<string, number[]>();
  for (const row of rows) {
    if (row.value === null) continue;
    const key = weekKey(row.date);
    weeks.set(key, [...(weeks.get(key) ?? []), row.value]);
  }
  return [...weeks].map(([key, values]) => ({ key, value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null }));
}
