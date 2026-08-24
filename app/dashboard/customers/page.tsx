import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { Building2 } from "lucide-react";
import { CustomersTable } from "@/components/customers/customers-table";
export default async function CustomersPage() {
  const { orgId } = await auth();

  if (!orgId) {
    return <NoHotelState />;
  }

  const supabase = await createClient();

  // Fetch hotel
  const { data: hotel } = await supabase
    .from("hotels")
    .select("id, name, currency")
    .eq("clerk_org_id", orgId)
    .single();

  const hotelId = hotel?.id;

  if (!hotelId) {
    return <NoHotelState />;
  }

  // Fetch all guests for this hotel
  const { data: guests } = await supabase
    .from("guests")
    .select(
      "id, full_name, email, phone, national_id, nationality, notes, tags, total_stays, total_spend, last_stay_date, created_at, updated_at"
    )
    .eq("hotel_id", hotelId)
    .order("created_at", { ascending: false })
    .limit(500);

  const guestList = (guests || []).map((g) => ({
    id: g.id,
    fullName: g.full_name,
    email: g.email || null,
    phone: g.phone || null,
    nationalId: g.national_id || null,
    nationality: g.nationality || null,
    notes: g.notes || null,
    tags: (g.tags as string[]) || [],
    totalStays: g.total_stays || 0,
    totalSpend: g.total_spend || 0,
    lastStayDate: g.last_stay_date || null,
    createdAt: g.created_at,
    updatedAt: g.updated_at,
  }));

  const currency = hotel?.currency || "GHS";
  const totalGuests = guestList.length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-page-title text-foreground">
          Customers
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {totalGuests} guest profile{totalGuests !== 1 ? "s" : ""} · Lifetime value tracking
        </p>
      </div>

      <CustomersTable data={guestList} currency={currency} />
    </div>
  );
}

function NoHotelState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <Building2 className="size-12 text-muted-foreground/30 mb-4" />
      <h2 className="text-lg font-semibold text-foreground">Hotel not found</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        No hotel is associated with this account. Customers cannot be managed
        until your hotel is set up.
      </p>
    </div>
  );
}
