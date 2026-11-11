import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/roles";
import { HotelSettingsClient } from "./hotel-client";
import type { HotelCurrency } from "@/lib/money";

/** View is broad (per the design); the gate lives on the Save action, which the server re-checks. */
export default async function HotelSettingsPage() {
  const { orgId, userId } = await auth();
  if (!orgId || !userId) return <NoAccessState />;

  const supabase = await createClient();

  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, name, slug, custom_domain, address, city, country, phone, email, description, check_in_time, check_out_time, timezone, currency, cancellation_policy, logo_url, cover_image_url, settings")
    .eq("clerk_org_id", orgId)
    .single();

  if (!hotel) return <NoAccessState />;

  const { data: currentUser } = await supabase
    .from("staff_profiles")
    .select("role, full_name")
    .eq("clerk_user_id", userId)
    .eq("clerk_org_id", orgId)
    .single();

  const isSuperAdmin = can(currentUser?.role, "settings:manage");
  const base = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "localhost:3000";
  const protocol = base.startsWith("localhost") ? "http" : "https";
  const bookingUrl = hotel.slug
    ? hotel.custom_domain
      ? `https://${hotel.custom_domain}`
      : `${protocol}://${base}/${hotel.slug}`
    : null;

  return (
    <HotelSettingsClient
      canEdit={isSuperAdmin}
      hotelId={hotel.id}
      bookingUrl={bookingUrl}
      initialData={{
        name: hotel.name,
        address: hotel.address || "",
        city: hotel.city || "",
        country: hotel.country || "",
        phone: hotel.phone || "",
        email: hotel.email || "",
        description: hotel.description || "",
        checkInTime: hotel.check_in_time || "",
        checkOutTime: hotel.check_out_time || "",
        timezone: hotel.timezone || "",
        currency: (hotel.currency as HotelCurrency) || "GHS",
        cancellationPolicy: hotel.cancellation_policy || "",
        taxEnabled: ((hotel.settings as Record<string, unknown>)?.tax_enabled as boolean) ?? false,
        taxPercentage: ((hotel.settings as Record<string, unknown>)?.tax_percentage as number) ?? 0,
      }}
      logoUrl={hotel.logo_url}
      coverImageUrl={hotel.cover_image_url}
      staffName={currentUser?.full_name || undefined}
    />
  );
}

function NoAccessState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <h2 className="text-lg font-semibold text-foreground">Access Denied</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">Please sign in to manage settings.</p>
    </div>
  );
}
