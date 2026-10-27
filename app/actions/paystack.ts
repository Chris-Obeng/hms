"use server";

import { createClient } from "@/lib/supabase/server";
import { requireMinRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  getPaystackBanks,
  getPaystackBankType,
  resolveAccount,
  createSubaccount,
  updateSubaccount,
} from "@/lib/paystack";

/** Ghana mobile money numbers are exactly 10 digits; bank accounts vary (6–20). */
function validateAccountNumber(accountNumber: string, bankType: string | null): string | null {
  if (bankType === "mobile_money") {
    return /^\d{10}$/.test(accountNumber)
      ? null
      : "Mobile money numbers must be exactly 10 digits.";
  }
  return /^\d{6,20}$/.test(accountNumber)
    ? null
    : "Enter a valid account number (6–20 digits).";
}

async function getPaymentConfigContext() {
  const ctx = await requireMinRole("manager", "manage payment settings");
  if (ctx.hotel.status !== "active") throw new Error("Active hotel access is required.");
  const supabase = await createClient();
  const { data: hotel, error } = await supabase
    .from("hotels")
    .select("id, name, email, paystack_subaccount_code, paystack_bank_code, paystack_account_number, paystack_business_name, paystack_settlement_schedule, settings, currency")
    .eq("id", ctx.hotelId)
    .eq("clerk_org_id", ctx.orgId)
    .single();
  if (error || !hotel) throw new Error("Hotel not found");
  return { supabase, hotel };
}

// ── Banks list (cached in Next.js fetch cache) ────────────────────

export async function fetchPaystackBanks() {
  try {
    await getPaymentConfigContext(); // auth check — this action spends Paystack API quota
    const banks = await getPaystackBanks();
    return { success: true as const, banks };
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}

// ── Verify bank account ───────────────────────────────────────────

export async function verifyBankAccount(accountNumber: string, bankCode: string) {
  try {
    await getPaymentConfigContext(); // auth check
    const bankType = await getPaystackBankType(bankCode);
    // Mobile money wallets: exactly 10 digits. Bank channels: 6–20.
    const validationError = validateAccountNumber(accountNumber, bankType);
    if (validationError) throw new Error(validationError);
    const data = await resolveAccount(accountNumber, bankCode);
    const accountName = data.account_name?.trim();
    if (!accountName) throw new Error("Paystack did not return a registered account name.");
    return { success: true as const, accountName };
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}

// ── Create or update subaccount ───────────────────────────────────

export async function savePaystackBankAccount(input: {
  bankCode: string;
  accountNumber: string;
  confirmedAccountName?: string;
  settlementSchedule?: string;
}) {
  try {
    const { supabase, hotel } = await getPaymentConfigContext();

    const bankType = await getPaystackBankType(input.bankCode);
    const validationError = validateAccountNumber(input.accountNumber, bankType);
    if (validationError) throw new Error(validationError);
    // Resolve again at save time so the Paystack-registered account name is
    // authoritative even if the client is holding an older verification result.
    const account = await resolveAccount(input.accountNumber, input.bankCode);
    const accountName = account.account_name?.trim();
    if (!accountName) throw new Error("Paystack did not return a registered account name.");
    if (input.confirmedAccountName && input.confirmedAccountName !== accountName) {
      throw new Error("The registered account name changed. Verify the account again before saving.");
    }

    let subaccountCode = hotel.paystack_subaccount_code;

    if (subaccountCode) {
      // Update existing
      await updateSubaccount(subaccountCode, {
        business_name: accountName,
        bank_code: input.bankCode,
        account_number: input.accountNumber,
      });
    } else {
      // Create new
      const result = await createSubaccount({
        business_name: accountName,
        settlement_bank: input.bankCode,
        account_number: input.accountNumber,
        percentage_charge: 0,
        primary_contact_email: hotel.email ?? "",
      });
      subaccountCode = result.subaccount_code;
    }

    const { error: persistenceError } = await supabase
      .from("hotels")
      .update({
        paystack_subaccount_code: subaccountCode,
        paystack_bank_code: input.bankCode,
        paystack_account_number: input.accountNumber,
        paystack_business_name: accountName,
        paystack_settlement_schedule: input.settlementSchedule ?? "auto",
      })
      .eq("id", hotel.id);
    if (persistenceError) throw new Error(`Payout account could not be saved locally: ${persistenceError.message}`);

    revalidatePath("/dashboard/payments");
    revalidatePath("/dashboard/settings/payments");
    return { success: true as const, subaccountCode, businessName: accountName };
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}

// ── Payment policy ────────────────────────────────────────────────

export type PaymentPolicy = "choice" | "pay_now_only" | "pay_later_only";

const PAYMENT_POLICIES: readonly string[] = ["choice", "pay_now_only", "pay_later_only"];

export async function updatePaymentPolicy(policy: PaymentPolicy) {
  try {
    if (!PAYMENT_POLICIES.includes(policy)) {
      throw new Error("Invalid payment policy.");
    }
    const { supabase, hotel } = await getPaymentConfigContext();
    const currentSettings = (hotel.settings as Record<string, unknown>) ?? {};
    const { error: persistenceError } = await supabase
      .from("hotels")
      .update({ settings: { ...currentSettings, payment_policy: policy } })
      .eq("id", hotel.id);
    if (persistenceError) throw new Error(`Payment policy could not be saved: ${persistenceError.message}`);
    revalidatePath("/dashboard/payments");
    revalidatePath("/dashboard/settings/payments");
    return { success: true as const };
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}

export async function getPaymentsSettings() {
  try {
    const { hotel } = await getPaymentConfigContext();
    const settings = (hotel.settings as Record<string, unknown>) ?? {};
    return {
      success: true as const,
      data: {
        subaccountCode: hotel.paystack_subaccount_code,
        bankCode: hotel.paystack_bank_code,
        accountNumber: hotel.paystack_account_number,
        businessName: hotel.paystack_business_name,
        settlementSchedule: hotel.paystack_settlement_schedule ?? "auto",
        paymentPolicy: (settings.payment_policy as PaymentPolicy) ?? "choice",
        currency: hotel.currency ?? "GHS",
      },
    };
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}
