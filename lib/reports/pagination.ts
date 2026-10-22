export interface PageResult<T> { data: T[] | null; error: { code?: string; message?: string } | null; count: number | null }

export function reportReadError(label: string, error: { code?: string } | null): never {
  // Avoid logging query text, guest data, or database error detail.
  console.error("[reports] required read failed", { resource: label, code: error?.code ?? "INVALID_RESPONSE" });
  throw new Error(`Report unavailable: could not read ${label}. Please retry.`);
}

/**
 * Deterministic id-keyset pagination with an exact remaining count on each page.
 * A smaller API cap is fine; short pages never imply completeness. Count changes,
 * missing/duplicate/unordered rows and oversized reports fail explicitly.
 * These are live reads, not a repeatable-read accounting snapshot.
 */
export async function readAllPages<T extends { id: string }>(
  label: string,
  page: (after: string | null, size: number) => PromiseLike<PageResult<T>>,
  maxRows = 100_000,
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  let total: number | null = null;
  for (let request = 0; request < 2000; request++) {
    const result = await page(cursor, 500);
    if (result.error || !Array.isArray(result.data) || !Number.isSafeInteger(result.count) || result.count! < 0) reportReadError(label, result.error);
    const count = result.count!;
    if (total === null) total = count;
    if (total > maxRows) throw new Error(`Report unavailable: ${label} exceeds the ${maxRows.toLocaleString("en-US")}-row safety limit; choose a shorter period.`);
    if (rows.length + count !== total) throw new Error("Report data changed during pagination. Please refresh and retry.");
    if (result.data.length > count || (count > 0 && result.data.length === 0)) reportReadError(label, null);
    for (const row of result.data) {
      if (typeof row.id !== "string" || (cursor !== null && row.id <= cursor)) reportReadError(label, null);
      rows.push(row);
      cursor = row.id;
    }
    if (rows.length === total) return rows;
  }
  throw new Error("Report unavailable: pagination safety limit exceeded.");
}
