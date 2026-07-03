/**
 * Minimal Paystack API helper.
 * All calls are server-side only — PAYSTACK_SECRET_KEY never reaches the client.
 * Amounts: GHS uses pesewas (×100). NGN uses kobo (×100).
 */

const BASE = "https://api.paystack.co";

export async function paystackFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<{ status: boolean; message: string; data: T }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Paystack ${res.status}: ${text}`);
  }
  return res.json();
}

export interface PaystackBank {
  name: string;
  code: string;
}

export async function getPaystackBanks(): Promise<PaystackBank[]> {
  const res = await paystackFetch<PaystackBank[]>("/bank?country=ghana&perPage=100");
  return res.data ?? [];
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
  amount: number; // in pesewas for GHS
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

export async function verifyTransaction(reference: string) {
  const res = await paystackFetch<{
    status: string;
    amount: number;
    reference: string;
    currency: string;
    subaccount?: { account_code: string };
    customer: { email: string };
    metadata?: string;
  }>(`/transaction/verify/${encodeURIComponent(reference)}`);
  return res.data;
}
