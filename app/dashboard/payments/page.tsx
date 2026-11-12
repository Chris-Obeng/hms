import { requireMinRole } from "@/lib/auth";
import { can } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getPaystackMode, isUsableSubaccount } from "@/lib/paystack";
import { businessToday } from "@/lib/business-date";
import { getPaymentActivity, type PaymentActivityStatus } from "./actions";
import { PaymentsClient } from "./payments-client";

export const metadata = { title: "Payments · RoomLine" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ tab?: string; date?: string; startDate?: string; endDate?: string; status?: string; method?: string; search?: string; page?: string }> }) {
  const params = await searchParams;
  let ctx;
  try {
    ctx = await requireMinRole("read_only", "view payments");
  } catch (error) {
    return <section className="mx-auto max-w-2xl space-y-2 py-12"><h1 className="text-page-title">Payments</h1><p className="text-body">{error instanceof Error ? error.message : "Payments could not be loaded."}</p></section>;
  }

  const { data: hotel, error } = await supabaseAdmin
    .from("hotels")
    .select("timezone, paystack_subaccount_code, paystack_domain, paystack_bank_code, paystack_account_number, paystack_business_name, paystack_settlement_schedule, settings")
    .eq("id", ctx.hotelId)
    .eq("clerk_org_id", ctx.orgId)
    .single();
  if (error || !hotel?.timezone) throw new Error("Payment settings could not be loaded.");

  const today = businessToday(hotel.timezone);
  const initialStartDate = params.startDate && /^\d{4}-\d{2}-\d{2}$/.test(params.startDate) && params.startDate <= today ? params.startDate : params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) && params.date <= today ? params.date : today;
  const initialEndDate = params.endDate && /^\d{4}-\d{2}-\d{2}$/.test(params.endDate) && params.endDate >= initialStartDate && params.endDate <= today ? params.endDate : initialStartDate;
  const validStatuses: PaymentActivityStatus[] = ["all", "success", "pending", "failed", "refunded"];
  const initialStatus = validStatuses.includes(params.status as PaymentActivityStatus) ? params.status as PaymentActivityStatus : "success";
  const initialMethod = params.method ?? "all";
  const initialSearch = params.search ?? "";
  const initialPage = Number.isInteger(Number(params.page)) && Number(params.page) > 0 ? Number(params.page) : 1;
  const activity = await getPaymentActivity({ startDate: initialStartDate, endDate: initialEndDate, page: initialPage, status: initialStatus, method: initialMethod, search: initialSearch });
  const settings = (hotel.settings as Record<string, unknown>) ?? {};

  const requestedTab = params.tab === "payouts" || params.tab === "setup" ? params.tab : "activity";
  const initialTab = requestedTab === "setup" && !can(ctx.role, "payments:configure") ? "activity" : requestedTab;

  return <PaymentsClient
    hotelId={ctx.hotelId}
    currency={ctx.hotel.currency}
    timeZone={hotel.timezone}
    today={today}
    initialTab={initialTab}
    initialActivity={activity.success ? activity.data : null}
    activityError={activity.success ? null : activity.error}
    canConfigure={can(ctx.role, "payments:configure")}
    initialFilters={{ status: initialStatus, method: initialMethod, search: initialSearch }}
    initialSetup={{
      subaccountCode: isUsableSubaccount(hotel) ? hotel.paystack_subaccount_code : null,
      bankCode: hotel.paystack_bank_code,
      accountNumber: can(ctx.role, "payments:configure") ? hotel.paystack_account_number : null,
      businessName: can(ctx.role, "payments:configure") ? hotel.paystack_business_name ?? ctx.hotel.name : null,
      settlementSchedule: hotel.paystack_settlement_schedule ?? "auto",
      paymentPolicy: (settings.payment_policy as string) ?? "choice",
      modeMismatch: Boolean(
        hotel.paystack_subaccount_code &&
          hotel.paystack_domain &&
          hotel.paystack_domain !== getPaystackMode()
      ),
      activeMode: getPaystackMode(),
    }}
  />;
}
