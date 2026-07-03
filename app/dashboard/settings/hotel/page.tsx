import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { Building2 } from "lucide-react";
import Link from "next/link";
import { HotelSettingsClient } from "./hotel-client";
import { BookingPageCard } from "./booking-page-card";

export const dynamic = "force-dynamic";

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

  const isSuperAdmin = currentUser?.role === "super_admin";

  const base = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "localhost:3000";
  const bookingUrl = hotel.custom_domain
    ? `https://${hotel.custom_domain}/${hotel.slug}`
    : hotel.slug
    ? `http://${base}/${hotel.slug}`
    : null;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </Link>
        <div>
          <h1 className="text-page-title text-foreground">Hotel Profile</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your property's public information and branding</p>
        </div>
      </div>

      {/* Booking page link — always visible */}
      {bookingUrl && <BookingPageCard url={bookingUrl} hotelName={hotel.name} />}

      {!isSuperAdmin ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-6">
          <Building2 className="size-10 text-muted-foreground/30 mb-3" />
          <h2 className="text-sm font-semibold text-foreground">Super Admin Only</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">Only the hotel Super Admin can manage settings.</p>
        </div>
      ) : (
        <HotelSettingsClient
          hotelId={hotel.id}
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
            currency: hotel.currency || "",
            cancellationPolicy: hotel.cancellation_policy || "",
            taxEnabled: ((hotel.settings as Record<string, unknown>)?.tax_enabled as boolean) ?? false,
            taxPercentage: ((hotel.settings as Record<string, unknown>)?.tax_percentage as number) ?? 0,
          }}
          logoUrl={hotel.logo_url}
          coverImageUrl={hotel.cover_image_url}
          staffName={currentUser?.full_name || undefined}
        />
      )}
    </div>
  );
}

function NoAccessState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <Building2 className="size-12 text-muted-foreground/30 mb-4" />
      <h2 className="text-lg font-semibold text-foreground">Access Denied</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">Please sign in to manage settings.</p>
    </div>
  );
}
