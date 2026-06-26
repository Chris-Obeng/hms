"use server";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  getPaystackBanks,
  resolveAccount,
  createSubaccount,
  updateSubaccount,
} from "@/lib/paystack";

async function getSuperAdminHotel() {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) throw new Error("Not authenticated");
  const supabase = await createClient();
  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, name, email, paystack_subaccount_code, paystack_bank_code, paystack_account_number, paystack_business_name, paystack_settlement_schedule, settings, plan, currency")
    .eq("clerk_org_id", orgId)
    .single();
  if (!hotel) throw new Error("Hotel not found");
  const { data: staff } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("clerk_user_id", userId)
    .eq("clerk_org_id", orgId)
    .single();
  if (staff?.role !== "super_admin" && staff?.role !== "manager") {
    throw new Error("Insufficient permissions");
  }
  return { supabase, hotel, orgId, isSuperAdmin: staff.role === "super_admin" };
}

// ── Banks list (cached in Next.js fetch cache) ────────────────────

export async function fetchPaystackBanks() {
  try {
    const banks = await getPaystackBanks();
    return { success: true as const, banks };
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}

// ── Verify bank account ───────────────────────────────────────────

export async function verifyBankAccount(accountNumber: string, bankCode: string) {
  try {
    await getSuperAdminHotel(); // auth check
    const data = await resolveAccount(accountNumber, bankCode);
    return { success: true as const, accountName: data.account_name };
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}

// ── Create or update subaccount ───────────────────────────────────

export async function savePaystackBankAccount(input: {
  businessName: string;
  bankCode: string;
  accountNumber: string;
  settlementSchedule?: string;
}) {
  try {
    const { supabase, hotel } = await getSuperAdminHotel();

    let subaccountCode = hotel.paystack_subaccount_code;

    if (subaccountCode) {
      // Update existing
      await updateSubaccount(subaccountCode, {
        business_name: input.businessName,
        settlement_bank: input.bankCode,
        account_number: input.accountNumber,
      });
    } else {
      // Create new
      const result = await createSubaccount({
        business_name: input.businessName,
        settlement_bank: input.bankCode,
        account_number: input.accountNumber,
        percentage_charge: 0,
        primary_contact_email: hotel.email ?? "",
      });
      subaccountCode = result.subaccount_code;
    }

    await supabase
      .from("hotels")
      .update({
        paystack_subaccount_code: subaccountCode,
        paystack_bank_code: input.bankCode,
        paystack_account_number: input.accountNumber,
        paystack_business_name: input.businessName,
        paystack_settlement_schedule: input.settlementSchedule ?? "auto",
      })
      .eq("id", hotel.id);

    revalidatePath("/dashboard/settings/payments");
    return { success: true as const, subaccountCode };
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}

// ── Payment policy ────────────────────────────────────────────────

export type PaymentPolicy = "choice" | "pay_now_only" | "pay_later_only";

export async function updatePaymentPolicy(policy: PaymentPolicy) {
  try {
    const { supabase, hotel } = await getSuperAdminHotel();
    const currentSettings = (hotel.settings as Record<string, unknown>) ?? {};
    await supabase
      .from("hotels")
      .update({ settings: { ...currentSettings, payment_policy: policy } })
      .eq("id", hotel.id);
    revalidatePath("/dashboard/settings/payments");
    return { success: true as const };
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}

export async function getPaymentsSettings() {
  try {
    const { hotel } = await getSuperAdminHotel();
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
        plan: hotel.plan,
        currency: hotel.currency ?? "GHS",
      },
    };
  } catch (err) {
    return { success: false as const, error: (err as Error).message };
  }
}
