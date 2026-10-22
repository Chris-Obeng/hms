import { fromMinor } from "@/lib/money";

export const MIN_AUDIT_DATE = "2000-01-01";
export const NIGHT_AUDIT_SETUP_ERROR =
  "Night Audit setup is incomplete. Ask your administrator to apply the durable_business_date_close migration and reload the database API schema. No close has been recorded by this request.";

export interface NightAuditSummary {
  auditDate: string;
  propertyToday: string;
  timeZone: string | null;
  currency: string | null;
  capturedAt: string | null;
  roomNights: number | null;
  roomRevenue: number | null;
  adr: number | null;
  collections: number | null;
  paymentCount: number | null;
  paymentsByMethod: { method: string; count: number; amount: number }[];
  pendingArrivals: number | null;
  pendingDepartures: number | null;
  rateIssues: number | null;
  paymentIssues: number | null;
  rateIssueBookings: { id: string; reference: string }[];
  unresolvedBookings: {
    id: string;
    reference: string;
    guestName: string;
    roomNumber: string | null;
    type: "pending_arrival" | "pending_departure";
  }[];
  source: "preview" | "durable_close" | "legacy_audit_log";
  isClosed: boolean;
  closeId: string | null;
  lastAudit: { staffName: string | null; notes: string | null; at: string | null } | null;
  canClose: boolean;
  replayed: boolean;
  warnings: string[];
}

/** Reject nonexistent dates; never silently close a different calendar day. */
export function validateAuditDate(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Business date must be a real YYYY-MM-DD date.");
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < MIN_AUDIT_DATE) {
    throw new Error(`Business date must be a real date on or after ${MIN_AUDIT_DATE}.`);
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Night Audit returned an invalid response.");
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("Night Audit returned an incomplete response.");
  return value;
}

function nullableText(value: unknown): string | null {
  return value === null || value === "" ? null : text(value);
}

function count(value: unknown): number {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+$/.test(value))) {
    throw new Error("Night Audit returned an invalid count or amount.");
  }
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error("Night Audit returned an unsafe count or amount.");
  return result;
}

function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error("Night Audit returned an incomplete list.");
  return value.map(object);
}

/** The DB sends integer money as strings so JSON cannot lose bigint precision. */
export function readNightAuditSummary(value: unknown): NightAuditSummary {
  const envelope = object(value);
  const auditDate = text(envelope.businessDate);
  const propertyToday = text(envelope.propertyToday);
  validateAuditDate(auditDate);
  validateAuditDate(propertyToday);
  const source = envelope.source;
  if (source !== "preview" && source !== "durable_close" && source !== "legacy_audit_log") {
    throw new Error("Night Audit returned an unknown receipt version.");
  }
  if (typeof envelope.isClosed !== "boolean" || typeof envelope.replayed !== "boolean") {
    throw new Error("Night Audit returned an invalid close status.");
  }
  const closeId = nullableText(envelope.closeId);
  if (envelope.isClosed !== Boolean(closeId) || envelope.isClosed !== (source !== "preview")) {
    throw new Error("Night Audit did not return a durable close receipt.");
  }
  const lastAudit = envelope.isClosed ? {
    staffName: nullableText(envelope.closedBy), notes: nullableText(envelope.notes), at: nullableText(envelope.closedAt),
  } : null;
  const common: Pick<NightAuditSummary, "auditDate" | "propertyToday" | "source" | "isClosed" | "closeId" | "lastAudit" | "replayed"> = {
    auditDate, propertyToday, source, isClosed: envelope.isClosed, closeId, lastAudit, replayed: envelope.replayed,
  };
  if (source === "legacy_audit_log") {
    return {
      ...common, timeZone: null, currency: null, capturedAt: null,
      roomNights: null, roomRevenue: null, adr: null, collections: null, paymentCount: null,
      pendingArrivals: null, pendingDepartures: null, rateIssues: null, paymentIssues: null,
      paymentsByMethod: [], unresolvedBookings: [], rateIssueBookings: [], canClose: false,
      warnings: ["Imported legacy close: the original business date and actor timestamp are retained. Its old figures and exception handling were not verified; no historical figures have been reconstructed."],
    };
  }
  const snapshot = object(envelope.summary);
  if (snapshot.schemaVersion !== 1 || snapshot.businessDate !== auditDate) {
    throw new Error("Night Audit returned a mismatched summary version or business date.");
  }
  const currency = text(snapshot.currency);
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Night Audit returned an invalid currency.");
  const timeZone = text(snapshot.timeZone);
  // Unlike generic business-date helpers, this financial review must fail closed
  // on invalid property configuration rather than quietly fall back to UTC.
  new Intl.DateTimeFormat("en", { timeZone }).format();
  const capturedAt = text(snapshot.capturedAt);
  if (!Number.isFinite(Date.parse(capturedAt))) throw new Error("Night Audit returned an invalid capture timestamp.");
  if (source === "durable_close" && (!lastAudit?.at || !Number.isFinite(Date.parse(lastAudit.at)))) {
    throw new Error("Night Audit did not return the persisted close timestamp.");
  }
  const roomNights = count(snapshot.roomNights);
  const rateIssues = count(snapshot.rateIssues);
  const paymentIssues = count(snapshot.paymentIssues);
  const pendingArrivals = count(snapshot.pendingArrivals);
  const pendingDepartures = count(snapshot.pendingDepartures);
  const roomMinor = snapshot.roomRevenueMinor === null ? null : count(snapshot.roomRevenueMinor);
  const collectionMinor = snapshot.collectionsMinor === null ? null : count(snapshot.collectionsMinor);
  if ((rateIssues === 0) !== (roomMinor !== null) || (paymentIssues === 0) !== (collectionMinor !== null)) {
    throw new Error("Night Audit returned unreconciled totals without an explanation.");
  }
  const paymentsByMethod = rows(snapshot.paymentsByMethod).map((row) => ({
    method: text(row.method), count: count(row.count), amount: fromMinor(count(row.amountMinor), currency),
  }));
  const unresolvedBookings = rows(snapshot.unresolvedBookings).map((row): NightAuditSummary["unresolvedBookings"][number] => {
    if (row.type !== "pending_arrival" && row.type !== "pending_departure") throw new Error("Night Audit returned an unknown operation.");
    return { id: text(row.id), reference: text(row.reference), guestName: text(row.guestName),
      roomNumber: nullableText(row.roomNumber), type: row.type };
  });
  const canClose = !envelope.isClosed && auditDate < propertyToday &&
    pendingArrivals + pendingDepartures + rateIssues + paymentIssues === 0;
  if (source === "durable_close" && pendingArrivals + pendingDepartures + rateIssues + paymentIssues > 0) {
    throw new Error("Night Audit returned a close with unresolved blockers.");
  }
  const warnings = [
    "Occupancy and RevPAR are unavailable: this review has no dated inventory capacity.",
    "This is an immutable operational review, not a general ledger or accounting-date advancement. Later source edits do not update a closed snapshot.",
  ];
  if (source === "preview") warnings.push("Preview uses currently recorded stay and payment facts; it is not an as-of historical ledger.");
  if (count(snapshot.reconstructedStays)) warnings.push("Some stored nightly rates were reconstructed by an earlier migration; they are identified as reconstructed rather than original quotes.");
  if (rateIssues) warnings.push(`${rateIssues} stay(s) need nightly charge reconciliation. Revenue is unavailable until every stay reconciles to its net room subtotal.`);
  if (paymentIssues) warnings.push(`${paymentIssues} payment(s) use a different currency. Collections are unavailable until currency reconciliation is complete.`);
  return {
    ...common, timeZone, currency, capturedAt, roomNights,
    roomRevenue: roomMinor === null ? null : fromMinor(roomMinor, currency),
    adr: roomMinor === null || roomNights === 0 ? null : fromMinor(Math.round(roomMinor / roomNights), currency),
    collections: collectionMinor === null ? null : fromMinor(collectionMinor, currency),
    paymentCount: count(snapshot.paymentCount), paymentsByMethod,
    pendingArrivals, pendingDepartures, rateIssues, paymentIssues, unresolvedBookings,
    rateIssueBookings: rows(snapshot.rateIssueBookings).map((row) => ({ id: text(row.id), reference: text(row.reference) })),
    canClose, warnings,
  };
}
