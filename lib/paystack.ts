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
    throw new Error(`Paystack ${res.status}: ${text}`);
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
  subaccount?: { account_code: string };
  customer: { email: string };
  metadata?: string;
}

export async function verifyTransaction(reference: string): Promise<VerifiedPaystackTransaction> {
  const res = await paystackFetch<VerifiedPaystackTransaction>(
    `/transaction/verify/${encodeURIComponent(reference)}`
  );
  return res.data;
}
