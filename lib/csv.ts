/**
 * lib/csv.ts
 *
 * Browser-side CSV export helpers shared by the report, transaction and
 * audit-log tables. Values are always quoted and inner quotes escaped.
 */

function toCsvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(toCsvCell).join(",")).join("\n");
}

/** Triggers a browser download of `csv` as `filename`. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Builds and downloads a CSV from rows of records, using the first row's keys as headers. */
export function downloadRecordsAsCsv(
  filename: string,
  rows: Record<string, unknown>[]
): void {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  downloadCsv(filename, toCsv(headers, rows.map((row) => headers.map((h) => row[h]))));
}
