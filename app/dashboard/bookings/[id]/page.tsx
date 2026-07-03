import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BookingDeepLinkClient } from "./booking-deep-link-client";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function BookingDetailPage({ params }: Props) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) redirect("/sign-in");

  const supabase = await createClient();

  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, currency")
    .eq("clerk_org_id", orgId)
    .single();

  if (!hotel) redirect("/dashboard");

  // Verify booking belongs to this hotel (security check before rendering)
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, reference, guests(full_name)")
    .eq("id", id)
    .eq("hotel_id", hotel.id)
    .single();

  if (!booking) notFound();

  const guestName = (booking.guests as { full_name?: string | null } | null)?.full_name ?? "Booking";

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/bookings"
          className="inline-flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-page-title text-foreground">{booking.reference}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{guestName}</p>
        </div>
      </div>

      <BookingDeepLinkClient
        bookingId={id}
        currency={hotel.currency ?? "GHS"}
      />
    </div>
  );
}
