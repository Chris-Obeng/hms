import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BookingDeepLinkClient } from "./booking-deep-link-client";

type Props = { params: Promise<{ id: string }> };

/**
 * Standalone reservation page — the canonical deep-link target (shareable,
 * printable, restorable). Quick glance stays in the dashboard drawer.
 */
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
    .select("id, reference")
    .eq("id", id)
    .eq("hotel_id", hotel.id)
    .single();

  if (!booking) notFound();

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-5 flex items-center gap-3">
        <Link
          href="/dashboard/bookings"
          aria-label="Back to bookings"
          className="inline-flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-page-title truncate text-foreground">Reservation</h1>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
            {booking.reference}
          </p>
        </div>
      </div>

      <BookingDeepLinkClient
        bookingId={id}
        currency={hotel.currency ?? "GHS"}
      />
    </div>
  );
}
