/**
 * Minimal Paystack API helper.
 * All calls are server-side only — PAYSTACK_SECRET_KEY never reaches the client.
 * Amounts are integers in the currency's smallest unit — pesewas for GHS, kobo
 * for NGN. The factor is not always 100: it is 10 ** the ISO 4217 exponent, and
 * for a zero-decimal currency the smallest unit is the major unit. Convert with
 * `toMinor`/`fromMinor` from `lib/money`, never a literal 100.
 *
 * Every failure is reported to Sentry here rather than at the call sites: several
 * callers swallow a Paystack error to keep a guest checkout or a settings save
 * alive, and this is the only place that sees all of them.
 */

import { captureError, captureIssue } from "@/lib/observability/sentry";

const BASE = "https://api.paystack.co";

/**
 * Groupable label for a request path: query string dropped and id-looking
 * segments collapsed, so `/transaction/verify/RL-8H2K91` groups with every other
 * verify call instead of opening a new Sentry issue per reference.
 *
 * Dropping the query string is also a privacy requirement — `/bank/resolve`
 * carries a bank account number in it.
 *
 * A digit is the only reliable marker of a variable segment: no literal Paystack
 * path segment contains one, while references, codes and numeric ids always do.
 * Underscores must not count — `charge_authorization`, `finalize_transfer` and
 * `bulk_charge` are literal segments, and collapsing them merged unrelated
 * failures into a single issue.
 */
export function endpointLabel(path: string): string {
  const [pathname] = path.split("?");
  return pathname
    .split("/")
    .map((segment) => (/\d/.test(segment) ? ":id" : segment))
    .join("/");
}

export async function paystackFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<{ status: boolean; message: string; data: T }> {
  const endpoint = endpointLabel(path);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    // Network-level failure: DNS, TLS, timeout. During a Paystack outage this is
    // what a broken checkout looks like from inside the app.
    captureError(error, {
      scope: "payments",
      tags: { "paystack.endpoint": endpoint, "paystack.failure": "network" },
      fingerprint: ["paystack-api", "network", endpoint],
    });
    throw error;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    // Body is deliberately not sent — only its size. Paystack error payloads can
    // echo the request, and some requests carry a customer email.
    captureIssue(`Paystack API ${res.status} ${endpoint}`, {
      scope: "payments",
      level: res.status >= 500 || res.status === 401 ? "error" : "warning",
      tags: {
        "paystack.endpoint": endpoint,
        "paystack.status": res.status,
      },
      contexts: {
        paystack: { endpoint, status: res.status, body_bytes: text.length },
      },
      fingerprint: ["paystack-api", endpoint, String(res.status)],
    });
    // Body kept out of the message: call sites pass this to captureError, so the
    // raw payload (may echo a guest email) would reach Sentry. Size is logged above.
    throw new Error(`Paystack ${res.status} ${endpoint}`);
  }
  return res.json();
}

export interface PaystackBank {
  name: string;
  code: string;
  /** e.g. "mobile_money" | "nuban" | "ghipps" */
  type?: string;
}

export async function getPaystackBanks(): Promise<PaystackBank[]> {
  // Bank list changes ~never — cache for 24h so getPaystackBankType() calls
  // on verify/save don't burn Paystack API quota. Ghana /bank/resolve covers
  // both bank channels (ghipps) and mobile money wallets (live mode).
  const res = await paystackFetch<PaystackBank[]>("/bank?country=ghana&perPage=100", {
    next: { revalidate: 86_400 },
  });
  return res.data ?? [];
}

/** Resolve a bank channel's type ("mobile_money" | "ghipps" | ...) by code. */
export async function getPaystackBankType(bankCode: string): Promise<string | null> {
  const banks = await getPaystackBanks();
  return banks.find((b) => b.code === bankCode)?.type ?? null;
}

export async function resolveAccount(
  accountNumber: string,
  bankCode: string
): Promise<{ account_name: string; account_number: string }> {
  const res = await paystackFetch<{ account_name: string; account_number: string }>(
    `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`
  );
  return res.data;
}

export interface SubaccountCreateInput {
  business_name: string;
  settlement_bank: string; // bank code
  account_number: string;
  percentage_charge?: number;
  description?: string;
  primary_contact_email?: string;
}

export async function createSubaccount(input: SubaccountCreateInput) {
  const res = await paystackFetch<{
    subaccount_code: string;
    settlement_bank: string;
    account_number: string;
    business_name: string;
  }>("/subaccount", {
    method: "POST",
    body: JSON.stringify({ percentage_charge: 0, ...input }),
  });
  return res.data;
}

export async function updateSubaccount(
  code: string,
  input: Partial<SubaccountCreateInput>
) {
  const res = await paystackFetch<{ subaccount_code: string }>(
    `/subaccount/${encodeURIComponent(code)}`,
    { method: "PUT", body: JSON.stringify(input) }
  );
  return res.data;
}

export interface TransactionInitInput {
  email: string;
  /** Integer minor units for `currency` — build it with `toMinor`. */
  amount: number;
  currency?: string;
  reference: string;
  callback_url: string;
  subaccount: string;
  /**
   * Flat amount (in `currency`'s smallest unit) routed to the main account,
   * overriding the subaccount's percentage split for this charge. This is how
   * RoomLine's per-transaction platform fee is realised — omit it (undefined)
   * for a zero fee so the subaccount's own split applies unchanged.
   */
  transaction_charge?: number;
  /**
   * Who bears Paystack's own processing fee: 'account' (default, main account)
   * or 'subaccount'. Left undefined here — RoomLine bears it, matching today's
   * behaviour.
   */
  bearer?: "account" | "subaccount";
  metadata?: Record<string, unknown>;
}

export async function initializeTransaction(input: TransactionInitInput) {
  const res = await paystackFetch<{
    authorization_url: string;
    access_code: string;
    reference: string;
  }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      // Paystack expects metadata as a plain object, not a JSON string
      metadata: input.metadata ?? undefined,
    }),
  });
  return res.data;
}

export interface VerifiedPaystackTransaction {
  status: string;
  /** Integer minor units for `currency` — read it with `fromMinor`. */
  amount: number;
  reference: string;
  currency: string;
  id?: number | string;
  /**
   * Present when the charge was split to a subaccount. Paystack names the
   * field `subaccount_code` in both the verify response and webhook payloads;
   * when the charge was NOT split the key holds an empty object or is absent.
   * An `account_code` key has been observed on some account configurations, so
   * extractSubaccountCode below reads both — never index this object directly.
   */
  subaccount?: {
    subaccount_code?: string | null;
    account_code?: string | null;
  } | null;
  customer: { email: string };
  metadata?: string;
}

/**
 * Extracts the subaccount code from a Paystack transaction payload — verify
 * response or webhook `event.data`.
 *
 * Returns null when the charge carried no subaccount (Paystack then sends
 * `subaccount: {}` or omits the key) or when the value is not a usable string.
 * Downstream, a null here means "unverifiable settlement identity", which the
 * settlement RPC deliberately classifies as a permanent, manually-reviewed
 * failure rather than auto-confirming money whose split destination we cannot
 * confirm.
 */
export function extractSubaccountCode(txn: {
  subaccount?: unknown;
}): string | null {
  const sub = txn.subaccount;
  if (typeof sub !== "object" || sub === null) return null;
  const record = sub as Record<string, unknown>;
  for (const key of ["subaccount_code", "account_code"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return null;
}

export async function verifyTransaction(reference: string): Promise<VerifiedPaystackTransaction> {
  const res = await paystackFetch<VerifiedPaystackTransaction>(
    `/transaction/verify/${encodeURIComponent(reference)}`
  );
  return res.data;
}

// ── Settlements (payout visibility) ──────────────────────────────────
//
// Paystack settles each hotel's subaccount directly to its bank on the
// subaccount's schedule (Ghana default: AUTO, T+1). No `settlement.success`
// webhook exists, so payout state is only knowable by polling these read-only
// endpoints. Everything below is server-only (secret key), returns Paystack's
// own shapes (treated as untrusted data by callers), and reports failures via
// the shared `paystackFetch` Sentry path. Amounts are integer MINOR units —
// format with `formatMoney` from `lib/money`, never a literal ÷100.

export interface PaystackSubaccount {
  /** Numeric id — the value the /settlement `subaccount` filter wants. */
  id: number;
  subaccount_code: string;
  business_name: string;
  settlement_bank: string;
  account_number: string;
  /** "auto" (T+1) | "weekly" | "monthly" | "manual". */
  settlement_schedule: string;
  active?: boolean;
  currency?: string;
}

/**
 * Fetch a subaccount by its `ACCT_` code or numeric id. Cached 24h by default:
 * the id↔code mapping and bank details are effectively static, and this is on
 * the render path of every payouts view.
 */
export async function getSubaccount(
  idOrCode: string | number,
  revalidate: number = 86_400
): Promise<PaystackSubaccount> {
  const res = await paystackFetch<PaystackSubaccount>(
    `/subaccount/${encodeURIComponent(String(idOrCode))}`,
    { next: { revalidate } }
  );
  return res.data;
}

/**
 * Numeric subaccount id for an `ACCT_` code, memoised for the worker's life.
 * We store the code but the Settlements filter needs the id; the mapping never
 * changes for a given code, so a plain in-process cache is enough (and callers
 * additionally wrap this in React `cache`).
 */
const subaccountIdCache = new Map<string, number>();
export async function resolveSubaccountId(code: string): Promise<number> {
  const hit = subaccountIdCache.get(code);
  if (hit !== undefined) return hit;
  const sub = await getSubaccount(code);
  subaccountIdCache.set(code, sub.id);
  return sub.id;
}

export interface PaystackSettlement {
  id: number;
  domain: string;
  /** success | processing | pending | failed */
  status: string;
  currency: string;
  integration: number;
  /** Minor units. */
  total_amount: number;
  /** Minor units actually credited to the bank (net of fees/deductions). */
  effective_amount: number;
  total_fees: number;
  total_processed: number;
  deductions: number | null;
  settlement_date: string;
  settled_by: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListSettlementsParams {
  /** Numeric subaccount id (from resolveSubaccountId), NOT the ACCT_ code. */
  subaccountId: number;
  status?: "success" | "processing" | "pending" | "failed";
  /** ISO datetime lower bound (settlement_date). */
  from?: string;
  /** ISO datetime upper bound. */
  to?: string;
  perPage?: number;
  /** Starting page; the helper loops forward from here. */
  page?: number;
}

/**
 * All settlements matching the filter, looping pages internally. T+1 over a
 * 30-day window is ≤ ~31 settlements, so one 50-row page normally covers it;
 * the page cap is a runaway backstop, not an expected path. `paystackFetch`
 * drops the `meta` envelope, so termination is by short-page, not page count.
 */
export async function listSettlements(params: ListSettlementsParams): Promise<PaystackSettlement[]> {
  const perPage = params.perPage ?? 50;
  const MAX_PAGES = 20;
  const all: PaystackSettlement[] = [];
  let page = params.page ?? 1;
  for (let i = 0; i < MAX_PAGES; i++) {
    const qs = new URLSearchParams({
      subaccount: String(params.subaccountId),
      perPage: String(perPage),
      page: String(page),
    });
    if (params.status) qs.set("status", params.status);
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    // 5-min TTL: bounds Paystack API volume / rate-limit exposure while keeping
    // T+1 payout state current enough for a dashboard. Same fetch-cache idiom as
    // getPaystackBanks. Each page URL is a distinct cache entry.
    const res = await paystackFetch<PaystackSettlement[]>(`/settlement?${qs.toString()}`, {
      next: { revalidate: 300 },
    });
    const rows = res.data ?? [];
    all.push(...rows);
    if (rows.length < perPage) break;
    page += 1;
  }
  return all;
}

/**
 * The transactions included in one settlement — the primitive that maps a
 * Paystack transaction id back to the settlement that paid it out. Only `id`
 * is load-bearing (matched against `payments.paystack_id`); the rest of the
 * transaction shape is not relied on.
 */
export interface SettlementTransaction {
  id: number;
  reference?: string;
  amount?: number;
  status?: string;
}

export async function listSettlementTransactions(
  settlementId: number,
  opts: { page?: number; perPage?: number } = {}
): Promise<SettlementTransaction[]> {
  const perPage = opts.perPage ?? 200;
  const MAX_PAGES = 50;
  const all: SettlementTransaction[] = [];
  let page = opts.page ?? 1;
  for (let i = 0; i < MAX_PAGES; i++) {
    const qs = new URLSearchParams({ perPage: String(perPage), page: String(page) });
    // A settlement's transaction set is immutable once the settlement exists,
    // so cache it long; the short-TTL settlement list above is what surfaces
    // newly-created settlements.
    const res = await paystackFetch<SettlementTransaction[]>(
      `/settlement/${encodeURIComponent(String(settlementId))}/transactions?${qs.toString()}`,
      { next: { revalidate: 3_600 } }
    );
    const rows = res.data ?? [];
    all.push(...rows);
    if (rows.length < perPage) break;
    page += 1;
  }
  return all;
}
