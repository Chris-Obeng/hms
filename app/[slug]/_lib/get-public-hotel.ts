import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hotelSlugParam } from "@/lib/validation/params";

const PUBLIC_HOTEL_COLUMNS =
  "id,name,slug,status,description,address,city,phone,logo_url,currency,timezone,check_in_time,check_out_time,cancellation_policy,settings,paystack_subaccount_code,paystack_domain";

/**
 * Request-memoized hotel lookup shared across `generateMetadata`, `SlugLayout`,
 * the booking wizard (`/[slug]`), and the confirmation receipt (`/[slug]/confirmation`).
 *
 * Returns inactive/suspended rows intentionally so existing guests can still open
 * their confirmation receipts; the booking entry page enforces `status === "active"`.
 */
export const getPublicHotel = cache(async (rawSlug: string) => {
  if (!hotelSlugParam.safeParse(rawSlug).success) {
    return null;
  }

  const bySlug = await supabaseAdmin
    .from("hotels")
    .select(PUBLIC_HOTEL_COLUMNS)
    .eq("slug", rawSlug)
    .maybeSingle();

  if (bySlug.data) return bySlug.data;

  const byDomain = await supabaseAdmin
    .from("hotels")
    .select(PUBLIC_HOTEL_COLUMNS)
    .eq("custom_domain", rawSlug)
    .maybeSingle();

  return byDomain.data ?? null;
});
